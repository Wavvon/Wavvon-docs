# SDK E2E DMs: a program in an encrypted conversation

> **Status (2026-11-17): built in the Rust SDK** (Wavvon-sdk-rust#20, `Client::dms()`,
> smoke-tested against a real hub) **and the Go SDK** (Wavvon-sdk-go#16, `Client.DMs()`,
> smoke-tested against a real hub and against the Rust SDK, 1:1 and group); Python
> follows. Ships with voice in the SDKs
> that get voice ([sdk-voice.md](sdk-voice.md)): Rust first
> ([Wavvon-sdk-rust#19](https://github.com/Wavvon/Wavvon-sdk-rust/issues/19)),
> then Go and Python. It needs no WebTransport, so TypeScript, C# and Java can
> carry it too. Parent: [sdk.md](sdk.md) §8. The scheme is
> [e2e-encryption.md](e2e-encryption.md); the bytes are
> [wire-format.md](wire-format.md). This page says which parts a program must
> implement and what is pinned by vectors.

No hub change is needed to *use* E2E DMs from a program: the hub stores and
relays envelopes and verifies their signatures, exactly as for the clients.
Server work is needed only to give the SDKs shared vectors and reusable
primitives (§6).

## 1. Prerequisites

- **The DH key**, derived and published as in [sdk-voice.md](sdk-voice.md)
  §2, on every hub the program talks on (peers look it up on the hub they
  share with it). Same key for DMs and voice.
- **A peer's DH key**: `GET /identity/{pubkey}/dh-key`, verify the
  `DhKeyRecord` signature against `pubkey`, then consult the pin store: new,
  same or changed (decisions.md, "A peer's DH key is pinned on first use").
  A **changed** key is surfaced as a typed `DhKeyChanged { pinned, fetched }`
  error and nothing is encrypted to it; the program decides whether to accept
  (re-pin) it. A **404** is `RecipientHasNoKey`. A 429/5xx/timeout is retried
  ([sdk.md](sdk.md) §5) and never read as either.
- **No silent downgrade.** The SDK never sends a DM in the clear because
  encryption was impossible. Plaintext is a separate, explicit call
  (`send_plaintext`, signing the federated plaintext v2 bytes where the hub
  advertises it); whether to make it is the program's choice.

## 2. Transport

- Create: `POST /conversations` (`createConversation`). List and fetch:
  `listConversations`, `getConversation`.
- Send: `POST /conversations/{id}/messages` with `{ encrypted_envelope }`
  (1:1) or `{ group_encrypted_envelope }` (group). Attachments travel inside
  the ciphertext, never beside it ([attachments.md](attachments.md) §8).
- Receive: the WebSocket `dm` event announces a new message; for an
  encrypted one its `content` is the placeholder `[encrypted]`, so the SDK
  fetches `GET /conversations/{id}/messages` (`listConversationMessages`,
  keyset-paged) and decrypts `encrypted_envelope` / `group_encrypted_envelope`
  from the rows. A socket keeps its set of conversations live from
  `dm_member_changed` ([ws-protocol.md](ws-protocol.md)), so a conversation
  opened after connect delivers `dm` events with no reconnect. The Rust SDK
  turns the event into `Dms::poll(conv)`, which returns the messages it has
  not handed out yet, and keeps the plaintext of what it decrypted in a
  bounded in-memory cache: a ratchet message key is spent by its first read,
  so reading history again would otherwise fail.
- Plaintext JSON inside every ciphertext: `{"content": "...",
  "attachments": [...]}`, `attachments` omitted when empty.

## 3. 1:1 conversations

Both clients **send** the double-ratchet envelope (`v: 2`); a program sends
the same. It must **receive** both v2 and the older static v1, which still
sits in histories.

- **v1 receive** (`dm-ciphertext/v1`): `shared = X25519(own DH scalar,
  envelope.dh_pubkey_hex)`; `key = HKDF-SHA256(shared, salt = conv_id UTF-8,
  info "wavvon/dm-key/v1")`; AES-256-GCM open with `nonce_hex`.
- **v2 send and receive** (`dm-ciphertext/v2`): the session init, `KDF_RK`,
  `KDF_CK`, `derive_nonce`, the skip cache (bounded at 1000) and the receive
  algorithm exactly as in e2e-encryption.md, "1:1 DM Encryption — v2". On
  the wire the v2 envelope also carries `nonce_hex: ""` so the hub's struct
  round-trips; `message_index` and `prev_count` are u32.
- **Verify** every envelope before decrypting: Ed25519 over the version's
  signing bytes, by `sender_pubkey`, or, when `signer_cert` is present, by the
  cert's subkey after verifying the `SubkeyCert` against `sender_pubkey`
  (cert-chained attribution from a paired device). The hub checked it too;
  the SDK does not rely on that.
- A ratchet cannot decrypt its own outbound messages. Keeping a readable copy
  of what the program sent is the program's business, not the SDK's.

## 4. Group conversations

Sender keys per e2e-encryption.md, "Group DMs — v2":

- **Own chain**: random 32-byte `chain_key`, `version = 1`, `iteration = 0`.
  Per message N: `msg_key = HKDF(chain_key, salt = N BE, info
  "wavvon/group-msg/v1")`, next chain key with info `"wavvon/group-chain/v1"`,
  nonce = N BE zero-padded to 12 bytes, AES-256-GCM. Signed
  `group-dm-ciphertext/v1`.
- **Distribute**: wrap `chain_key || iteration_be` per member with
  `HKDF(X25519(own, member DH), salt = conv_id, info
  "wavvon/group-key-dist/v1")` and a random nonce; `PUT
  /conversations/{id}/sender-keys` signed over the `group-key-dist/v1` bytes
  (recipients sorted, no count prefix).
- **Receive**: `GET /conversations/{id}/sender-keys`, unwrap with the
  sender's DH key, advance from the held iteration to the message's; a
  message before the held iteration cannot be read, by design.
- **Rotate** (`version + 1`, fresh chain, re-distribute) on
  `dm_member_changed` and right after the program itself adds a member. The
  Rust SDK does the first when the program passes the event to
  `Dms::handle_event` (it never acts on a stream it does not own), and
  `rotate_group_key` is the same step called directly. A member who cannot
  be given the key (no DH key, a changed one) is reported in
  `Distribution::skipped`, never dropped silently. Keep a peer's chains per version so messages before a rotation
  stay readable. Membership changes the program makes are signed
  (`dm_member_change_signing_bytes`) where the hub advertises
  `dms.group.signedmembers`.
- Distribution to members on other hubs is deferred hub-side
  (e2e-encryption.md, "What's deferred"); the SDK inherits that limit.

## 5. State the SDK keeps

One store interface (get, put, delete by key), the one sdk-voice.md uses for
DH pins, with an in-memory default. It holds: DH pins, v2 ratchet sessions per
conversation, own group chains and peers' chains per `(conv_id, sender,
version)`. Persistence is the program's choice. Losing the ratchet sessions
(an in-memory store across a restart) leaves the conversations they belong to
unreadable from then on, the same as a client that wipes its storage; the SDK
reports a decryption failure per message and does not try to repair it.

## 6. Reuse and vectors

**Rust reuses from `wavvon-identity`** (Wavvon-server `crates/identity/src/`,
0.6.0 and later): `Identity::dh_keypair`, `DhKeyRecord` (`signing_bytes`,
`verify`), `dm_envelope_signing_bytes`, `dr_envelope_signing_bytes`,
`group_dm_envelope_signing_bytes`, `sender_key_dist_signing_bytes`,
`dm_member_change_signing_bytes`, `federated_plaintext_dm_v2_signing_bytes`,
`SubkeyCert::verify`, `verify_signature`, and the `dm` module: `dm_key_v1`,
`dm_v1_seal`/`dm_v1_open`, `dr_root_key`, `dr_kdf_rk`, `dr_kdf_ck`,
`dr_derive_nonce`, `dr_message_seal`/`dr_message_open`, `dr_initiator_init`,
`dr_responder_init`, `dr_dh`, `group_msg_key`, `group_next_chain_key`,
`group_nonce`, `group_message_seal`/`group_message_open`,
`group_key_wrap`/`group_key_unwrap`. The module is pure: nonces and ephemeral
scalars are arguments. Keeping sessions (the skip cache, the DH-ratchet step
on a new remote key) is still the caller's job. The desktop shell and
`packages/core` keep their own implementations, as for voice, and assert the
same vectors.

**Vectors** in `crates/identity/wire-vectors.json`, asserted by every
DM-capable SDK. Signing bytes and signatures: `master_dh_pubkey`,
`dh_key_record`, `dm_envelope`, `dr_envelope`, `group_dm_envelope`,
`sender_key_dist`, `dm_member_change`, `federated_plaintext_dm_v2`,
`subkey_cert`. The encryption itself, added 2026-11-16 from the clients'
existing behaviour (layout in [wire-format.md](wire-format.md)):

| Vector | Pins |
|---|---|
| `dm_key_v1` | two fixture seeds, `conv_id` → derived key; fixed nonce + plaintext JSON → ciphertext |
| `dr_session` | static seeds and both ephemeral scalars → `rk0`, initiator `rk`/`cks`, message key, nonce, ciphertext of message 0; the responder's `rk`/`ckr`/`cks`, its reply ciphertext, and the initiator's DH-ratchet step on that reply |
| `group_ratchet` | `chain_key` (`0x11…`), iteration 2 → `message_key`, `next_chain_key`, nonce, ciphertext |
| `group_key_wrap` | seeds, `conv_id`, nonce, `chain_key`, iteration → wrapped ciphertext |

## 7. Deferred

X3DH prekeys and group double ratchet (deferred in e2e-encryption.md for
everyone); a session-reset handshake for a lost ratchet; cross-hub sender-key
distribution.
