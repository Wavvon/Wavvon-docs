# Identity & Auth

Wavvon has no accounts and no passwords. Identity is an Ed25519 keypair
held by the device. Everything else (membership, permissions, history)
hangs off the public key.

## Where identity lives

- **Generation**: `identity/src/lib.rs` in Wavvon-server (Ed25519 + BIP39 phrase)
- **Recovery phrase**: `identity/src/recovery.rs` in Wavvon-server (24 words)
- **Storage on the desktop client**: a JSON file in Tauri's app-data dir,
  written by the Rust side in `desktop/src-tauri/src/lib.rs` in Wavvon-desktop.

The recovery phrase **is** the secret — entering it on a device replaces
that device's identity. There is currently one identity per device.

## How auth works against a hub

Challenge-response, signature-based:

1. Client requests a challenge from the hub.
2. Hub returns a random nonce.
3. Client signs the nonce with its Ed25519 private key.
4. Client posts the signature + public key.
5. Hub verifies and issues a session token.

Code path: `hub/src/auth/handlers.rs` and
`hub/src/auth/middleware.rs` (both in Wavvon-server).

## Authorization (after auth)

A user's pubkey is matched to their hub-local membership row, which
carries their roles. Roles bundle permissions; see
`hub/src/permissions.rs` in Wavvon-server for the permission set and
`hub/src/routes/roles.rs` in Wavvon-server for role CRUD.

Common permissions: `manage_hub`, `manage_channels`, `manage_roles`,
`manage_users`, `send_messages`, `attach_files`, etc.

## Hub-to-hub auth (federation)

Same primitive, different actor: each hub also has its own Ed25519
keypair. When Hub A talks to Hub B, A signs requests as itself; B
verifies. See `hub/src/federation/client.rs` and
`hub/src/federation/handlers.rs` (both in Wavvon-server).

## Recovery flow

1. User generates an identity → 24-word phrase shown once.
2. User pastes phrase on a new device (or the same device after wipe).
3. The phrase deterministically yields the Ed25519 keypair. Same phrase
   ⇒ same pubkey ⇒ same identity to every hub.

## Master key and devices

Shipped. The phrase's entropy is the canonical seed (it is also subkey 0,
so a single-key identity keeps its pubkey) and derives a master key by
HKDF. Further devices pair: each gets its own subkey, certified by the
master in a `SubkeyCert`, and a lost device is revoked by the master. A hub
seats every device of an identity as one user. See
[multi-device.md](multi-device.md).

## Anti-spam: proof of work

Shipped. A hub admin sets `min_security_level`; `/auth/verify` checks the
level a client claims (`security_level` + `security_nonce`) and, below the
minimum, confines the session to the lobby when the lobby is on or refuses
it with 403 when it is off. The hub owner is exempt. The level is the number
of leading zero bits of `SHA-256(utf8(pubkey_hex) || nonce as u64 LE)`
(Wavvon-server: `identity/src/pow.rs`, gate in `hub/src/auth/handlers.rs`).
The lobby flow is in [lobby-survey.md](lobby-survey.md).
