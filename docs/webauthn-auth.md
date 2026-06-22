# WebAuthn / Passkey Authentication

Today Voxply generates an Ed25519 keypair from a random seed, stores
the seed in `localStorage` (web) or `~/.voxply/identity.json`
(desktop/android), and uses session tokens to authenticate with hubs.
This works but has pain points across all clients:

- Users must back up a recovery phrase to move between devices.
- Web: private key lives in `localStorage` — no hardware protection.
- Desktop/Android: identity file is plaintext on disk; no OS-level
  access control.
- Hub restart with a new identity invalidates all stored sessions.

**WebAuthn** (FIDO2) replaces the authentication ceremony on all
three clients. The user's keypair lives in the device's secure
enclave (TPM, Secure Enclave, Android StrongBox) or on a hardware
key (YubiKey). Authentication is a biometric/PIN tap — no phrase,
no clipboard, no plaintext key on disk.

A companion feature — **"Trust this device"** — lets users skip
the biometric tap on subsequent opens by issuing a long-lived device
token stored in platform-secure storage.

---

## What changes and what doesn't

| | Today | After WebAuthn |
|---|---|---|
| Key storage | `localStorage` / plaintext JSON | Secure enclave / hardware key |
| Backup | Recovery phrase | Passkey sync (iCloud Keychain, Google PM) or hardware key |
| Hub restart | Invalidates all sessions; user must re-join | Re-assertion is a fresh challenge; identity survives |
| Cross-device | Copy seed or recovery phrase manually | Passkey syncs automatically via OS provider |
| Repeated opens | Re-reads localStorage / identity file silently | "Trust this device" device token skips biometric |

Identity is **still per-user keypair** — WebAuthn is a better storage
and ceremony. The Ed25519 identity key (for message signing,
certifications, DMs) stays; only how the client proves it owns that
key to the hub changes.

---

## Protocol sketch

### Registration (first join on a device)

```
Client                          Hub
  |                               |
  |-- POST /auth/webauthn/begin ->|
  |                               | generate PublicKeyCredentialCreationOptions
  |                               | (challenge, rpId, user.id = pubkey)
  |<- { options } ---------------|
  |                               |
  | [platform authenticator]      |
  | biometric/PIN prompt          |
  | keypair created in enclave    |
  | returns credential response   |
  |                               |
  |-- POST /auth/webauthn/finish->|
  |   { credential }              | verify attestation
  |                               | store (user_id, credential_id, cose_key, aaguid)
  |<- { session_token } ---------|
```

### Login (returning user)

```
Client                          Hub
  |                               |
  |-- POST /auth/webauthn/assert/begin ->|
  |                               | generate PublicKeyCredentialRequestOptions
  |                               | (challenge, allowCredentials for this user)
  |<- { options } ---------------|
  |                               |
  | [platform authenticator]      |
  | biometric/PIN prompt          |
  | signs challenge               |
  | returns assertion response    |
  |                               |
  |-- POST /auth/webauthn/assert/finish ->|
  |   { assertion }               | verify signature
  |                               | issue session_token
  |<- { session_token } ---------|
```

Session tokens are the same bearer tokens Voxply already uses — no
downstream changes to WS auth, `hubFetch`, or route guards.

---

## Hub changes

### New dependency

```toml
# hub/Cargo.toml
webauthn-rs = { version = "0.5", features = ["danger-allow-state-serialisation"] }
```

`webauthn-rs` handles challenge generation, CBOR credential parsing,
attestation verification, and assertion validation.

### New DB tables

```sql
CREATE TABLE webauthn_credentials (
    id               TEXT PRIMARY KEY,  -- base64url credential_id
    user_id          TEXT NOT NULL,     -- FK → users.public_key
    public_key_cbor  BLOB NOT NULL,     -- COSEKey from registration
    sign_count       INTEGER NOT NULL DEFAULT 0,
    aaguid           TEXT,              -- authenticator model hint
    friendly_name    TEXT,              -- user-editable ("iPhone 15", "YubiKey 5")
    created_at       INTEGER NOT NULL,
    last_used_at     INTEGER
);

CREATE TABLE device_tokens (
    id           TEXT PRIMARY KEY,      -- random 256-bit token, stored hashed
    user_id      TEXT NOT NULL,         -- FK → users.public_key
    device_name  TEXT,                  -- "MacBook Pro", "Pixel 8"
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,      -- default: now + 30 days
    last_used_at INTEGER,
    revoked      INTEGER NOT NULL DEFAULT 0
);
```

One user can have multiple credentials (phone + laptop + hardware key)
and multiple trusted device tokens. All credentials are valid; the hub
verifies whichever one signed the assertion.

### New routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/webauthn/begin` | Start registration → `PublicKeyCredentialCreationOptions` |
| POST | `/auth/webauthn/finish` | Complete registration; store credential; issue session token |
| POST | `/auth/webauthn/assert/begin` | Start assertion (login) → `PublicKeyCredentialRequestOptions` |
| POST | `/auth/webauthn/assert/finish` | Complete assertion; verify; issue session token |
| POST | `/auth/device-token/redeem` | Exchange a device token for a short-lived session token |
| GET | `/me/credentials` | List passkeys (id, friendly_name, aaguid, created_at, last_used_at) |
| PATCH | `/me/credentials/:id` | Rename a passkey |
| DELETE | `/me/credentials/:id` | Remove a passkey |
| GET | `/me/devices` | List trusted devices |
| DELETE | `/me/devices/:id` | Revoke a trusted device |

The existing `/auth/register` + `/auth/login` keypair flow is not
removed — it stays as the fallback path.

### AppState additions

```rust
// hub/src/state.rs
pub struct AppState {
    // existing fields ...
    pub webauthn: Arc<Webauthn>,
    pub webauthn_reg_challenges: DashMap<String, RegistrationState>,   // session_id → state
    pub webauthn_auth_challenges: DashMap<String, AuthenticationState>,
}
```

`rp_id` = hub's public domain (e.g. `voxply.videogamezone.eu`).
On `localhost` it is `"localhost"`. Configurable via `VOXPLY_PUBLIC_URL`.

---

## Client changes

### Web (`apps/web`)

The browser's `navigator.credentials` API handles the ceremony
directly.

**New package:**
```
pnpm --filter voxply-web add @simplewebauthn/browser
```

**New platform module (`apps/web/src/platform/webauthn.ts`):**
```ts
export async function startRegistration(options: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON>
export async function startAssertion(options: PublicKeyCredentialRequestOptionsJSON): Promise<AuthenticationResponseJSON>
```

**Auth flow in `WelcomeScreen` / `AddHubModal`:**
1. User enters hub URL → `GET /hub-info` (`webauthn_enabled: true`).
2. "Sign in with passkey" button → assert/begin → biometric tap →
   assert/finish → session token.
3. First time on this device → begin → biometric tap → finish.
4. Store in `localStorage`: session token + hub URL only.
   No seed, no keypair material.

**Identity key** — the Ed25519 signing key still needs to live
somewhere on the web client. Preferred approach (PRF extension,
Chrome 116+ / Safari 17+): derive the key from the passkey via the
`prf` WebAuthn extension so it never touches `localStorage`. Fallback
for older browsers: generate once, AES-wrap with a random key stored
in `localStorage`. The session token authenticates you to the hub;
the wrapped key authenticates your messages. Upgradeable to pure-PRF
later without breaking identity.

---

### Desktop (`apps/desktop`, Tauri)

Desktop has no browser WebAuthn API, but every supported OS has a
native equivalent.

| OS | Platform authenticator | Tauri access |
|---|---|---|
| Windows 10 1903+ | Windows Hello (PIN, face, fingerprint) | `windows` crate — `SecurityCredentialsUI` or WebAuthn API via `webauthn.dll` |
| macOS 12+ | Touch ID / Face ID (on supported hardware) | `Security.framework` via `tauri-plugin-biometric` or a custom `LAContext` Tauri command |
| Linux | Hardware key only (no universal platform authenticator) | `libfido2` via a Tauri command; graceful fallback to seed-phrase if no key present |

**Recommended Tauri command pattern:**

```rust
// src-tauri/src/auth/webauthn.rs
#[tauri::command]
pub async fn webauthn_assert(hub_url: String, options_json: String) -> Result<String, String> {
    // on Windows: call webauthn.dll AuthenticatorGetAssertion
    // on macOS: use Security.framework + LAContext biometric gate
    // on Linux: use libfido2 CTAP2 over USB/NFC
    // returns: assertion JSON to POST to /auth/webauthn/assert/finish
}
```

The hub-side protocol is identical — the Tauri command is just the
platform shim that drives the local authenticator instead of
`navigator.credentials.get`.

For **identity key storage** on desktop, the existing
`~/.voxply/identity.json` can stay as-is for now. The WebAuthn
layer replaces the *authentication ceremony* (proving to the hub
that you own the key), not the key storage itself. A follow-up can
move the identity file into the OS keychain (`keyring` crate on
all three platforms) once WebAuthn ships.

---

### Android (`apps/android`, Tauri Android)

Android 9+ (API 28+) supports passkeys via the **Credential Manager**
API (`androidx.credentials`).

**Tauri Android plugin pattern:**

```kotlin
// apps/android/android/src/main/java/eu/voxply/WebAuthnPlugin.kt
@TauriPlugin
class WebAuthnPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun assertCredential(invoke: Invoke) {
        val optionsJson = invoke.getString("optionsJson") ?: return
        val credentialManager = CredentialManager.create(activity)
        val request = GetCredentialRequest(listOf(
            GetPublicKeyCredentialOption(optionsJson)
        ))
        // launch coroutine, call credentialManager.getCredential(activity, request)
        // return assertion JSON to hub
    }
}
```

`CredentialManager` handles passkey sync via Google Password Manager
automatically. Users registered on one Android device see their
passkey appear on other Android devices signed into the same Google
account.

For **identity key storage** on Android, replace the current
plaintext file with `EncryptedSharedPreferences` (backed by Android
Keystore) as a first step, independently of WebAuthn.

---

## "Trust this device"

After a successful WebAuthn assertion, the client can request a
**device token** — a long-lived opaque token (30-day TTL by default,
configurable by the hub operator) stored in platform-secure storage.
On subsequent opens the client redeems the device token silently for
a fresh session token, skipping the biometric tap entirely.

### Flow

```
1. WebAuthn assertion succeeds → session_token received
2. Client: "Trust this device?" dialog (opt-in)
3. User taps Yes → POST /auth/device-token/create (authenticated)
                  ← { device_token, expires_at }
4. Client stores device_token in platform-secure storage:
     Web:     localStorage  (acceptable — revocable token, not the key)
     Desktop: OS keychain via `keyring` crate
     Android: EncryptedSharedPreferences (Android Keystore-backed)

On next open:
5. Client reads device_token from storage
6. POST /auth/device-token/redeem { token }
     ← { session_token }  (or 401 if expired/revoked)
7. On 401: fall back to WebAuthn assertion flow
```

### Hub-side token lifecycle

- Tokens are stored **hashed** (SHA-256) in `device_tokens`.
- `redeem` verifies the hash, checks `expires_at` and `revoked`,
  rotates the token (issues a new one, invalidates the old), and
  returns a short-lived session token.
- Rotation-on-use means a stolen token can only be used once before
  the legitimate device detects the mismatch and re-prompts.
- `GET /me/devices` lets users see all trusted devices and revoke any
  from Settings (e.g. "Log out everywhere").

### Settings UI additions (all clients)

Under **Settings → Account**:

- **Passkeys** — list of registered credentials (friendly name,
  device type icon from AAGUID, last used). Add / rename / remove.
- **Trusted devices** — list of active device tokens (device name,
  created, last used, expires). Revoke individually or "Revoke all".

---

## Identity key — summary across clients

| Client | Today | v1 with WebAuthn | Future |
|---|---|---|---|
| Web | Seed in `localStorage` | AES-wrapped key in `localStorage` (PRF fallback) | PRF extension — key in enclave |
| Desktop | `~/.voxply/identity.json` plaintext | Same file (WebAuthn only changes auth ceremony) | `keyring` crate — OS keychain |
| Android | Plaintext file | `EncryptedSharedPreferences` | Android Keystore-backed |

---

## Migration path

Existing users (seed-phrase identity) keep working — `/auth/register`
+ `/auth/login` are not removed. They can add a passkey at
**Settings → Account → Add passkey** while logged in, which calls
`POST /auth/webauthn/begin` on their current session and links the new
credential to their existing `public_key`. From that point they can
authenticate with the passkey on any client.

---

## HTTPS requirement

WebAuthn is blocked on plain HTTP except `localhost`. The pilot hub
(`voxply.videogamezone.eu`) terminates TLS at Cloudflare — it works.
Any hub that wants passkeys needs TLS; add a note to `hosting.md`
and a startup warning when `webauthn_enabled = true` but TLS is off.

---

## Effort estimate

| Area | Effort |
|---|---|
| Hub: DB migrations + 10 new routes + `webauthn-rs` wiring | ~2 days |
| Hub: integration tests (register, assert, multi-credential, device token) | ~1 day |
| Web: `@simplewebauthn/browser` + `WelcomeScreen` wiring + identity key wrapping | ~1.5 days |
| Web: Settings → Passkeys + Trusted devices UI | ~0.5 day |
| Desktop: Tauri command shims (Windows Hello + macOS Touch ID + libfido2) | ~2 days |
| Android: `CredentialManager` Tauri plugin + `EncryptedSharedPreferences` | ~1.5 days |
| Docs + `hub_info` capability flag + `hosting.md` TLS note | ~0.5 day |

**Total: ~9 days** (was 5 for web-only).

---

## Open questions

- Should `rp_id` be derived from `VOXPLY_PUBLIC_URL` automatically,
  or always require an explicit `VOXPLY_WEBAUTHN_RP_ID` setting?
  (Reverse-proxy deployments may have a different public hostname.)
- Device token TTL: 30 days default — should this be per-hub
  operator configurable, or fixed?
- Should the seed-phrase flow be formally deprecated on a timeline
  once passkey coverage is high, or kept indefinitely as a fallback?
- Conditional UI (autofill-triggered passkey prompts) for the hub
  URL field — nice to have, low priority.
- Linux desktop: if no hardware key is present, should we fall back
  to seed-phrase, or gate the feature behind a "hardware key required"
  message?
