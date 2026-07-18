# Hub-hosted identity vault

The third recovery layer, split out of
[identity-recovery.md](identity-recovery.md) (Part 1: the .wavvon-backup
file; Part 2: recovery contacts) per the ~focused-doc convention.

**Status**: design — no code yet. Extends the Part 1 `.wavvon-backup`
envelope and the personal-axis storage model ([home-hub.md](home-hub.md)).
This is the provider-independent successor to what passkey PRF promised
([webauthn-auth.md](webauthn-auth.md)): recovery on a fresh device with
**no file to keep and no passkey provider in the loop** — just *reach a
home hub + remember one handle and one passphrase*.

## What it is, in one sentence

The Part 1 `.wavvon-backup` envelope (the passphrase-wrapped master seed)
is stored on the user's home hub(s) as personal-axis state, retrievable and
decryptable on a device that holds **no key material at all**.

The file backup answers "I kept a file." The phrase answers "I kept 24
words." The vault answers "I kept **nothing** but a passphrase, and I can
reach a hub." It is the only recovery tier needing no artifact the user
must physically retain.

## Scope honesty — read this first

This recovers the **master seed**: the whole identity, not just standing on
one hub. Its threat model is **strictly weaker** than the phrase or the
file, because the ciphertext sits on a hub instead of in the user's sole
custody.

- **Opt-in only.** No user gets a vault unless they deliberately create
  one. Nothing in the identity flow depends on it.
- **The hub holds brute-forceable ciphertext of your master seed.** A hub
  operator (or anyone who dumps the DB) can run an offline dictionary
  attack against your passphrase forever. The KDF is the only wall. This is
  the exact concentration risk [home-hub.md](home-hub.md) deferred — see
  [Conflicts flagged](#conflicts-flagged).
- **Who should use it**: users who will not reliably keep 24 words or a
  file, who choose a strong passphrase, and ideally who self-host at least
  one home-hub slot so the ciphertext lives on a hub they control.
- **Who should not**: high-value targets who can manage a phrase/file; any
  user picking a weak passphrase; anyone whose only home hubs are run by
  parties they would not trust with an offline-crackable seed copy.

Everything below makes the passphrase the *only* secret and leaks as little
as possible to the hub — but it cannot change the fact that the ciphertext
is off-device.

## Problem 1 — the locator (fetch with no key material)

At recovery the user knows three things: a **hub URL**, a **recovery
handle** (a chosen, memorable, non-secret string), and a **passphrase**.
They have no signing key, so the fetch cannot be authenticated. The hub
must serve the right blob without learning the handle or the passphrase.

**Derivation** (all labels are versioned identity-crate constants, pinned
forever like `MASTER_HKDF_INFO` / the PRF salt label; bump the version to
evolve):

```
salt     = SHA-256(b"wavvon/id-vault/salt/v1" || nfkc_casefold(handle))[..16]
mk       = PBKDF2-SHA256(passphrase, salt, iters_v1, dkLen=32)   // iters_v1 = 100_000
enc_key  = HKDF-SHA256-Expand(mk, b"wavvon/id-vault/enc/v1", 32) // AES-256-GCM key
locator  = hex( HKDF-SHA256-Expand(mk, b"wavvon/id-vault/loc/v1", 32) )
```

- The client computes `locator` and `enc_key` **entirely locally** from
  `handle + passphrase`, then `GET /vault/{locator}` and decrypts the
  returned envelope with `enc_key`. The hub sees only an opaque 256-bit
  `locator` and ciphertext — never the handle, never the passphrase.
- **One KDF pass, two domain-separated outputs.** `enc_key` and `locator`
  are HKDF-split from a single expensive `mk`, deliberately: it denies the
  operator a *cheaper* side to attack. If the locator had its own weaker
  KDF, a DB-dumper would brute-force the passphrase against the locator
  (fast) instead of the ciphertext (slow). Sharing one `mk` makes every
  guess cost the full KDF regardless of which output it targets.
- **Params are pinned per vault-protocol version, not free per blob.** The
  file backup stores KDF params in the envelope because you *hold* the
  file. The vault can't: you must derive the locator *before* you can fetch
  and read any stored params — a chicken-and-egg. So `iters_v1` and the
  salt/enc/loc labels are fixed by the `v1` protocol version. Raising cost
  = a new version `v2` (Argon2id, below); the client tries the current
  version's locator, then falls back to prior versions on 404 (a small,
  bounded set). The envelope still records its params for inspection, but
  they are *determined* by the version, not chosen.

**What an attacker who knows the victim's handle can do: almost nothing.**
The handle is not a secret and must never be relied on as one. Knowing it
lets the attacker compute `salt` — also not secret. To fetch the blob they
still need `locator`, which requires a full KDF pass over the *passphrase*.
So a network attacker who knows the handle but not the passphrase cannot
fetch the blob (cannot compute the locator) and cannot confirm the handle
exists (Problem 3). A DB-dumping operator holds `(locator, ciphertext)` but
no handle→blob map: `locator = HKDF(PBKDF2(passphrase, f(handle)))` binds
*both* handle and passphrase, neither stored; even to *identify* the
victim's row they must brute-force handle+passphrase jointly, and that same
guess decrypts it. Honest bound: **security rests entirely on the
passphrase**; the handle is a memorable addressing seed and per-user salt,
nothing more.

## Problem 2 — offline brute-force

The operator holds passphrase-keyed ciphertext. This is the irreducible
cost of the feature; bound it, don't pretend to eliminate it.

- **KDF hardness** is the only real defense. `v1` ships PBKDF2-SHA256 at
  100k iterations (matches the shipped `.wavvon-backup` file, WebCrypto-
  native, no JS crypto deps). The self-describing envelope + versioned
  labels give a clean path to **Argon2id as `v2`** (WASM build) — memory-
  hard, far better against GPU/ASIC dictionary attacks. The vault is the
  strongest motivation yet to land Argon2id, precisely because its
  ciphertext is off-device.
- **Passphrase strength at creation** matters *more* here than for the
  file, because the file is in the user's custody and the vault is not.
  Creation keeps the advisory (non-gating) meter of the file flow but
  raises the language: an explicit "this is stored on a hub; a weak
  passphrase can be cracked offline" warning plus a one-tap generated
  high-entropy passphrase suggestion. Still advisory — a hard complexity
  gate trains sticky-note passphrases (Part 1).
- **Server-side rate-limiting does NOT protect against the operator** —
  they have the DB and never touch the endpoint. Endpoint rate-limiting
  (Problem 3) only bounds a *remote* guesser, and even that guesser must
  pay a full KDF pass per candidate locator, so the endpoint is never a
  *cheaper* passphrase oracle than local cracking — it is strictly more
  expensive (network + PoW). Rate-limiting buys anti-harvesting and
  anti-DoS, not passphrase secrecy.

**The promise vs. the file**: the file's ciphertext is exposed only if the
user's storage is breached; the vault's is exposed to every home-hub
operator, always. Same crypto, wider exposure. That is the whole trade.

## Problem 3 — enumeration / harvesting

Retrieval is unauthenticated, so it must not let an attacker enumerate
blobs or confirm a handle/passphrase pair cheaply.

- **256-bit locator space** makes blind enumeration infeasible.
- **A valid locator already costs a full KDF pass**, so `GET` is not a
  cheap oracle: 200-vs-404 tells a guesser their candidate was right, but
  they paid PBKDF2 to ask — identical cost to trying to decrypt locally.
  The endpoint grants no passphrase-guessing leverage beyond offline work.
- **PoW gate**, reusing the identity crate `pow` helpers
  (`compute_security_level`/`verify_security_level` in `identity/src/pow.rs`,
  Wavvon-server): `GET /vault/challenge` returns a hub nonce + difficulty;
  the client solves PoW over `(locator, hub_nonce)` and submits it with the
  fetch. Caps mass harvesting and random-locator scanning at a CPU cost per
  attempt.
- **Uniform responses**: found and not-found return the same shape with
  best-effort constant-time lookup; no "handle exists" signal, and no
  distinction between "wrong passphrase" and "no such blob" (mirrors the
  Part 1 importer's single failure message).

Don't oversell timing uniformity — the honest floor is KDF cost + locator
entropy + PoW; uniform responses are defense in depth on top.

## Data model (additive-only, Wavvon-server `hub/`)

Slots in beside the existing personal-axis tables (`prefs_blobs`,
`home_hub_designations`, `subkey_certs` in `hub/src/db/migrations.rs`).
Additive `CREATE TABLE IF NOT EXISTS` only.

```sql
CREATE TABLE IF NOT EXISTS identity_vault_blobs (
    locator       TEXT PRIMARY KEY,   -- hex, HKDF(mk,"loc") — opaque, passphrase-derived
    master_pubkey TEXT NOT NULL,      -- owner; authorizes update/delete/purge (master-signed)
    envelope_json TEXT NOT NULL,      -- the .wavvon-backup envelope (version/kdf/cipher/created_at/label)
    sequence      BIGINT NOT NULL,    -- monotonic per master_pubkey; rollback defense
    updated_at    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identity_vault_owner
    ON identity_vault_blobs(master_pubkey);
```

- **`master_pubkey` is stored, reads are anonymous.** Writes are
  master-signed (the user has their key when *creating* a backup), exactly
  like `put_prefs`. The owner index enables a per-identity **quota** (cap a
  handful of rows to bound passphrase-rotation churn and storage abuse),
  **purge-by-key** (below), and replication bookkeeping. The anonymous
  `GET` returns *only* the envelope — never `master_pubkey`/`sequence` — so
  a recovery reader learns nothing about whose blob it is.
- **Metadata leak, disclosed**: storing `master_pubkey` means the hub knows
  "user X has a crackable seed copy here." Same class of leak as
  `prefs_blobs`/`home_hub_designations` already keyed by `master_pubkey`
  ([home-hub.md](home-hub.md) threat table); the new increment is the
  *seed* copy specifically. Accepted for quota + authenticated lifecycle;
  the fully-unlinkable alternative is in [Alternatives](#alternatives-considered).

## Wire types (identity crate, byte-for-byte across clients)

New signed envelopes in `identity/src/` (Wavvon-server), versioned tags per
crate convention (`b"wavvon/<name>/v1\0"`, [wire-format.md](wire-format.md)):

```
VaultWrite  { locator, master_pubkey, envelope_json, sequence, signature }
    // master signs  b"wavvon/id-vault-write/v1\0"  || locator || sha256(envelope_json) || sequence
VaultDelete { locator, master_pubkey, sequence, signature }
    // master signs  b"wavvon/id-vault-delete/v1\0" || locator || sequence
VaultPurge  { master_pubkey, issued_at, signature }
    // master signs  b"wavvon/id-vault-purge/v1\0"  || master_pubkey || issued_at
```

`envelope_json` is the canonical `.wavvon-backup` envelope
(`format`/`version:2`/`kdf`/`cipher`/`created_at`/`label`) produced exactly
as `IdentityBackupSection.tsx` produces it today — same primitives, same
struct. The vault-specific twist is off-envelope: the deterministic `salt`
and the HKDF split, both derived client-side, neither stored.

## API shapes (Wavvon-server `hub/src/routes/vault.rs`, new)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/vault/challenge` | none | `{ hub_nonce, difficulty }` for the retrieval PoW |
| GET  | `/vault/{locator}`  | PoW  | `{ envelope_json }` or uniform 404. Header `X-Vault-PoW: <nonce>` |
| PUT  | `/vault/{locator}`  | master-signed | Body `VaultWrite`. Verify sig; owner must match any existing row; `sequence` strictly increasing; enforce quota. Upsert. |
| DELETE | `/vault/{locator}` | master-signed | Body `VaultDelete`. Remove one blob. |
| POST | `/vault/purge`      | master-signed | Body `VaultPurge`. Remove **all** rows for `master_pubkey`, regardless of locator. |

`PUT`/`DELETE` reuse the `put_prefs` verify pattern (`blob.verify()` on the
master signature, monotonic `sequence` — `routes/identity.rs`). `GET`
carries no identity. `POST /vault/purge` needs only the **master key**, not
the passphrase — so a user who still holds their key (via another device or
the phrase) can wipe their vault from a hub even after forgetting the
passphrase, closing the "inert crackable ciphertext lingers" gap whenever
the key survives.

## Recovery UX — fresh device, no key

New welcome-screen path beside "Restore from backup file" / "Enter recovery
phrase" / "Add a hub": **"Restore from a home hub."**

1. **Enter** the hub URL, the recovery handle, and the passphrase.
2. Client `GET /vault/challenge`, solves the PoW, derives `salt → mk →
   enc_key → locator` locally, `GET /vault/{locator}` with the PoW header.
3. **On 200**: AES-GCM-decrypt the envelope with `enc_key` → master seed →
   write the local identity, then bootstrap personal-axis state from the
   embedded home-hub-list hint per [home-hub.md](home-hub.md). The device
   is now the master-holding identity (same end state as a file import —
   reuse the fingerprint-compare conflict modal from Part 1 if a different
   identity already exists locally).
4. **On 404 or AEAD failure**: one uniform message — "Couldn't restore from
   that hub with that handle and passphrase." Never distinguish wrong
   passphrase from no-such-blob; never confirm the handle exists.

The user must remember at least **one** home-hub URL that holds the vault,
plus the handle and passphrase. At creation the client suggests writing the
handle down near (not with) the passphrase — the handle is non-secret but
must be reproduced exactly.

## Create / update / delete UX (web-first)

**Settings → Security**, directly below the file backup and recovery-phrase
blocks:

- **Create**: choose/confirm a passphrase (stronger advisory warning +
  generate-suggestion, per Problem 2) and a recovery handle. Client derives
  the locator/enc_key, encrypts the same envelope the file export builds,
  master-signs a `VaultWrite`, and **writes to every reachable home hub**
  (write-to-all, [home-hub.md](home-hub.md)). Show which hubs hold it.
- **Update on passphrase change**: the change *moves* the blob (new
  passphrase → new salt/locator/enc_key). While the user is present with
  the old and new passphrase, the client writes the new locator to all hubs
  **and** `DELETE`s the old one. If the delete can't reach a hub, the old
  blob lingers under the *old* passphrase — flag it and retry;
  `POST /vault/purge` (key-authorized) is the backstop.
- **Delete**: `VaultDelete` (this hub) or `POST /vault/purge` (all vault
  rows on this hub). Surfaced as "Remove my hub-stored backup."

Desktop parity follows web per policy; the crypto belongs in `src-tauri/`
there so the seed never enters the webview, mirroring the file backup.

## Lifecycle: replication, migration, staleness

- **Multi-home-hub replication**: the locator is deterministic, so every
  home hub stores the *same* locator → the same blob. Write-to-all-
  reachable, read-from-any-remembered, identical to the prefs blob. Any one
  remembered hub suffices for recovery.
- **Home-hub migration**: adding a hub uploads the current vault to it;
  removing a hub should `DELETE`/`purge` the vault there (best-effort,
  client-driven, same as designation propagation in
  [home-hub.md](home-hub.md)).
- **Staleness — the sharp edge**: the master **seed never changes**, so an
  old vault blob on a hub you left keeps decrypting to your live seed under
  whatever passphrase it used. Removal is best-effort; a hub that ignores
  your delete, or that you can't reach, **retains a crackable seed copy
  indefinitely.** State plainly: *leaving a hub does not guarantee your
  ciphertext leaves with you.* `purge` is the strongest wipe available, but
  a malicious operator can simply keep a copy. Inherent to off-device
  ciphertext; the price of the feature.

## Conflicts flagged

- **[home-hub.md](home-hub.md) "What's deferred" defers exactly this** —
  "Backup auto-sync to the home hub list … concentrates the highest-value
  secret on hubs the threat model already flags … Revisit only with a
  strong argument." This design **is** that revisit. The strong argument:
  strictly opt-in, passphrase-only secret with a memory-hard KDF path, a
  handle+passphrase locator that leaks neither to the hub, anonymous
  PoW-gated reads, key-authorized purge. Residual concentration risk is
  disclosed, not solved. Part 1's "What's deferred" note is marked
  superseded-by-this-part, not deleted; home-hub.md's personal-axis table
  gains the vault as a new opaque-ciphertext row pointing here.
- **Deterministic salt vs. the file's random salt**: the shipped
  `.wavvon-backup` uses a random 16-byte salt (fine — you hold the file);
  the vault *must* use a handle-derived deterministic salt to solve the
  fetch chicken-and-egg. Same envelope struct, different salt source — not
  a regression (per-handle salt is still unique and un-rainbow-table-able
  at these costs) but a real deviation worth naming so implementers don't
  "fix" it back to random.

## Alternatives considered

- **Fully unlinkable (locator-as-sole-capability, no `master_pubkey`
  stored)**: the hub holds only `(locator, ciphertext)` and cannot tell
  whose it is. Rejected as the default because it loses per-identity quota,
  authenticated delete, and key-authorized purge — and the linkage it hides
  is already largely present (the hub keys prefs/DMs/designations by the
  same master pubkey). Kept as a future hardening toggle for the
  metadata-conscious self-hoster.
- **Shamir-split across the home hub list** (k-of-n shares, no single hub
  holds a crackable blob): genuinely reduces any one operator's exposure,
  but needs ≥k hubs online to recover, a share-distribution protocol, and
  breaks the "remember one hub URL" recovery story. Deferred.
- **Server-side secret store (SVR/enclave-attested hardware brute-force
  wall)** — the model that makes a weak PIN safe. Rejected for a
  self-hosted federation: it presumes trusted attested hardware every
  operator runs, contradicting "any operator can run a hub on anything." A
  hub is a dumb store, not an HSM; we can't promise enclave guarantees
  across arbitrary self-hosts, so we don't pretend to.

## What's deferred

- **Argon2id (`v2`)** — the memory-hard KDF the envelope was built to grow
  into; ships when the WASM build lands. `v1` PBKDF2 first.
- **The unlinkable no-owner mode** — future self-hoster toggle (above).
- **Shamir across hubs** — above.
- **QR/short-code assisted recovery hand-off** — v1 is manual entry of hub
  + handle + passphrase.
- **Auto-suggesting a vault at onboarding** — creation stays a deliberate
  opt-in Settings action; no first-run nag beyond the existing recovery
  acknowledgment.

## Files this will touch (Part 3)

- `identity/src/` (Wavvon-server) — `VaultWrite`/`VaultDelete`/`VaultPurge`
  signed envelopes + versioned salt/enc/loc labels; a shared
  `vault_derive(handle, passphrase)` helper so every client agrees on the
  locator/enc_key bytes. PoW reuse from `identity/src/pow.rs`.
- `hub/src/routes/vault.rs` (new, Wavvon-server) — the five routes above.
- `hub/src/db/migrations.rs` (Wavvon-server) — `identity_vault_blobs`.
- Wavvon-web — Settings → Security "Store an encrypted backup on your home
  hubs" (create/update/delete), the welcome-screen "Restore from a home
  hub" flow, and the vault derivation in `packages/core` (mirrors the
  identity crate byte-for-byte).
