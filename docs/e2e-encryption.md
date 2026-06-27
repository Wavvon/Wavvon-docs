# End-to-End Encrypted Direct Messages

DMs today are plaintext in the hub's SQLite (`dm_messages.content`,
`hub/src/db/migrations.rs:432-443` in Wavvon-server). The hub operator
can read every conversation. This doc designs E2E encryption that lets
hubs **store and relay** without **decrypt**. v1 covers 1:1 text DMs
and their attachments only.

---

## Threat model

| Protects against | Does NOT protect against |
|---|---|
| Hub operator reading message content | Metadata — who↔who, when, frequency, sizes |
| DB dump from a compromised hub | Hub-injected fake plaintext (signature catches it for ciphertexts; legacy plaintext is unsigned) |
| Subpoena of hub data at rest | Recipient private key compromise |
| Hub-to-hub federation interception (encrypted payload crosses the wire) | Endpoint compromise (malware on either device) |

The hub still routes, queues, and broadcasts. Sender/recipient pubkeys,
conversation IDs, timestamps, and attachment sizes are all visible to it.
Hiding metadata is out of scope; that's a different design (cover traffic,
mix networks) and not pursued in v1.

---

## Key material

Each user already has an Ed25519 **identity key** for signing
(`identity/src/lib.rs:23-127` in Wavvon-server). For E2E we add an
**X25519 DH key** for key agreement, deterministically derived from the
same seed — no new key storage.

| Key | Curve | Use | Storage |
|---|---|---|---|
| `identity_key` | Ed25519 | Sign messages, certs, profiles | `~/.wavvon/identity.json` (existing) |
| `dh_key` | X25519 | ECDH for message encryption | Derived on demand from identity seed |

### Derivation

Standard `ed25519_sk_to_x25519` (the same trick as libsodium's
`crypto_sign_ed25519_sk_to_curve25519`):

1. Take the 32-byte Ed25519 seed (`signing_key.to_bytes()`).
2. `SHA-512(seed)` → 64 bytes; first 32 bytes become the X25519 scalar
   candidate.
3. Apply X25519 clamping (`scalar[0] &= 248; scalar[31] &= 127; scalar[31] |= 64`).
4. That clamped scalar is the X25519 private key; `X25519(scalar, basepoint)`
   gives the public DH key.

**Caveats** (document, do not paper over):

- This couples the DH key to the identity key. A compromise of the
  identity seed is a compromise of the DH key. They share the same secret.
- The conversion is well-studied and safe for this exact pair (Ed25519
  signing + X25519 DH from the same seed). Do **not** generalise to "any
  signing key derives an encryption key" — the safety is specific to this
  curve pair and clamping recipe.
- Subkeys (`SubkeyCert`) do not derive their own DH keys. See "Multi-device"
  below — DH key always comes from the **master** seed.

### Publication

New endpoint on each home hub:

```
PUT /identity/:pubkey/dh-key
    body: { dh_pubkey_hex, signature_hex }
    signature signs: "wavvon/dh-key/v1\0" + pubkey + dh_pubkey
→ 200 | 401 (auth) | 400 (sig mismatch)

GET /identity/:pubkey/dh-key
→ { dh_pubkey_hex, signature_hex, published_at } | 404
```

Public read (no auth) so anyone can fetch a DH key to start a
conversation. Write is authenticated (the user must be signed in) **and**
signature-verified against `pubkey` — the hub stores it as-is and any
relying client re-verifies. Storage is a new `dh_keys` row keyed by
`pubkey`. Replicated across the user's home hub list, same shape as
`home_hub_designations`.

The signing pattern follows the existing wire types in
`identity/src/wire.rs:32-66` (Wavvon-server) — domain-separated prefix,
length-prefixed strings, identity-key signature.

---

## 1:1 message encryption (v1: static ECDH + AES-GCM)

For Alice → Bob in conversation `conv_id`:

| Step | Operation |
|---|---|
| 1 | Alice fetches Bob's published DH pubkey from his home hub (or cache) |
| 2 | `shared = X25519(alice_dh_priv, bob_dh_pub)` |
| 3 | `key = HKDF-SHA256(shared, salt=conv_id, info="wavvon/dm-key/v1")` |
| 4 | `nonce = random(12)` |
| 5 | `ct = AES-256-GCM(key, nonce, plaintext_json)` where `plaintext_json` is `{ content, attachments? }` |
| 6 | `sig = Ed25519.sign(identity_key, canonical_bytes)` (see §"Message authentication") |
| 7 | Send `{ ciphertext_hex, nonce_hex, dh_pubkey_hex, signature_hex }` to the hub |

Bob decrypts symmetrically: rederives `shared = X25519(bob_dh_priv, alice_dh_pub_from_envelope)`,
derives the same key, AES-GCM-opens with the nonce.

### Why static ECDH (and what it costs)

| Property | Static ECDH (v1) | Double Ratchet (v2) |
|---|---|---|
| Confidentiality at rest | yes | yes |
| Forward secrecy (past msgs safe if key leaks later) | **no** | yes |
| Post-compromise security | no | yes |
| Implementation surface | ~200 LoC | several thousand LoC, state machine, key store |
| Group support | not natively | per-sender ratchet |

v1 ships static ECDH. v2 swaps in Signal's Double Ratchet. The envelope
shape already carries `dh_pubkey_hex` per message, which is the same slot
the ratchet's ephemeral key would live in — the protocol version bump is
the migration trigger, no schema change.

---

## Message authentication

AES-GCM authenticates the ciphertext under the derived key, but two
parties share the key — Bob can't distinguish "Alice sent this" from
"someone with the key forged it". For DMs that's only Alice, but the
hub is the relay and we don't want a malicious hub injecting valid-looking
plaintexts after a key compromise. The Ed25519 signature on the envelope
binds the ciphertext to Alice's identity key, which the hub does not have.

**Canonical bytes** (domain-separated, length-prefixed, matches the
pattern in `identity/src/wire.rs` in Wavvon-server):

```
"wavvon/dm-ciphertext/v1\0"
|| len_prefixed(conv_id)
|| len_prefixed(ciphertext_hex)
|| len_prefixed(nonce_hex)
|| len_prefixed(dh_pubkey_hex)
```

### Envelope (stored verbatim by the hub)

```json
{
  "sender_pubkey":   "...",
  "conv_id":         "...",
  "ciphertext_hex":  "...",
  "nonce_hex":       "...",
  "dh_pubkey_hex":   "...",
  "signature_hex":   "..."
}
```

The hub verifies the signature before storing (so it can't be used as a
write-amplification target for garbage). The hub does **not** verify the
ciphertext makes sense — it can't; only the recipient can.

---

## Group DMs — v2: sender-key symmetric ratchet

Group DMs (`conv_type = 'group'`, ≥3 members) use a **sender-key** scheme
modelled on Signal's group messaging. Each sender holds one symmetric
ratchet chain per `(conv_id, sender_pubkey)`; the chain key is wrapped
once per group member under their published DH key and stored on the hub.

**Why not pairwise ECDH**: N(N−1)/2 key agreements and re-encrypting
every message N−1 times. Sender-key costs one key distribution per send
rotation, and each message is encrypted exactly once regardless of group
size.

---

### Sender state

Each sender tracks `(chain_key: [u8; 32], iteration: u32, version: u32)`
per `(conv_id, sender_pubkey)` in a local file
`~/.wavvon/group_sender_keys.json`:

```json
{
  "my_keys": {
    "<conv_id>": { "version": 1, "chain_key_hex": "...", "iteration": 5 }
  },
  "peer_keys": {
    "<conv_id>": {
      "<sender_pubkey>": { "version": 1, "chain_key_hex": "...", "iteration": 3 }
    }
  }
}
```

`version` increments on every key rotation. `iteration` counts messages
sent with the current `chain_key` generation.

---

### Per-message ratchet

Before encrypting message N:

```
msg_key[N]        = HKDF-SHA256(chain_key, salt=N.to_be_bytes(), info="wavvon/group-msg/v1")
chain_key[N+1]    = HKDF-SHA256(chain_key, salt=N.to_be_bytes(), info="wavvon/group-chain/v1")
nonce[N]          = N.to_be_bytes() zero-padded to 12 bytes
ciphertext[N]     = AES-256-GCM(msg_key[N], nonce[N], plaintext_json)
```

Same crate (`aes-gcm` + `hkdf` + `sha2`) as 1:1 DMs — no new dependencies.

**Forward secrecy**: a recipient who receives the chain key at iteration K
can decrypt messages K, K+1, K+2, … but not messages 0…K−1. A new member
added later receives the chain key at the current iteration and cannot
read prior messages.

---

### Key distribution (wrapping)

When sender Alice distributes her chain key to recipient Bob:

```
shared   = X25519(alice_dh_priv, bob_dh_pub)           // same as 1:1 ECDH
wrap_key = HKDF-SHA256(shared, salt=conv_id, info="wavvon/group-key-dist/v1")
nonce    = random(12)
wrapped  = AES-256-GCM(wrap_key, nonce, chain_key[32] || iteration[4 BE])
```

The 52-byte payload (32 key + 4 iteration + 16 GCM tag) is hex-encoded
and stored in `group_sender_key_distributions` on the hub.

---

### Key rotation

| Event | Action |
|---|---|
| First send in group | Generate a fresh `chain_key`; `version = 1`; wrap for all members; push to hub |
| Member removed | Each remaining sender MUST rotate (new `chain_key`, `version += 1`) before the next message; re-distribute to new membership set |
| Member added | Existing senders wrap their current chain key for the new member at the current iteration and push the blob |

In v2 (current) group conversations have static membership — no add/remove
routes exist yet. The rotation mechanism is designed in but not triggered.
When member management lands, the hub will emit a `DmMemberChanged` WS
event; the client handles it by calling `rotate_group_sender_key`.

---

### Canonical signing bytes

For the complete byte-level layout, primitive encoding helpers, and test
vectors for **all** envelope types (including multi-device envelopes:
SubkeyCert, PairingOffer, PairingClaim, RevocationEntry, HomeHubList) see
[wire-format.md](wire-format.md).

**Group message envelope** (Ed25519 over):

```
"wavvon/group-dm-ciphertext/v1\0"
|| len_prefixed(conv_id)
|| len_prefixed(sender_key_version as decimal string)
|| len_prefixed(iteration as decimal string)
|| len_prefixed(ciphertext_hex)
|| len_prefixed(nonce_hex)
```

**Key distribution** (Ed25519 over):

```
"wavvon/group-key-dist/v1\0"
|| len_prefixed(conv_id)
|| len_prefixed(sender_key_version as decimal string)
|| for each recipient sorted by recipient_pubkey:
     len_prefixed(recipient_pubkey)
     len_prefixed(wrapped_key_hex)
```

---

### Wire types

```
GroupEncryptedEnvelope {
    sender_pubkey, conv_id,
    sender_key_version: u32, iteration: u32,
    ciphertext_hex, nonce_hex, signature_hex
}

SenderKeyRecipientBlob {
    recipient_pubkey,
    wrapped_key_hex,   // AES-GCM(ECDH wrap_key, chain_key || iteration_be)
    wrap_nonce_hex,
    iteration: u32
}

PushSenderKeyRequest {
    sender_key_version: u32,
    recipients: Vec<SenderKeyRecipientBlob>,
    signature_hex      // Ed25519 over key-distribution canonical bytes
}

GroupSenderKeyEntry {   // returned from GET /conversations/:id/sender-keys
    sender_pubkey, sender_key_version: u32, iteration: u32,
    wrapped_key_hex, wrap_nonce_hex, created_at
}
```

---

### Hub-side changes

| Change | File |
|---|---|
| New `group_sender_key_distributions` table | `hub/src/db/migrations.rs` |
| `PUT /conversations/:id/sender-keys` — validate sig, upsert blobs | new handler in `hub/src/routes/dms.rs` |
| `GET /conversations/:id/sender-keys` — return my received blobs | new handler in `hub/src/routes/dms.rs` |
| `SendDmRequest` accepts `group_encrypted_envelope` | `hub/src/routes/dm_models.rs` |
| `send_dm` validates group envelope signature, stores under `is_group_encrypted=1` | `hub/src/routes/dms.rs` |
| `FederatedDmRequest` carries `group_encrypted_envelope` | `hub/src/routes/dm_models.rs` |
| `dm_messages` gains `is_group_encrypted INTEGER NOT NULL DEFAULT 0` | `hub/src/db/migrations.rs` |

Hub schema for the new table:

```sql
CREATE TABLE IF NOT EXISTS group_sender_key_distributions (
    id                 TEXT PRIMARY KEY,
    conv_id            TEXT NOT NULL,
    sender_pubkey      TEXT NOT NULL,
    recipient_pubkey   TEXT NOT NULL,
    sender_key_version INTEGER NOT NULL,
    iteration          INTEGER NOT NULL,
    wrapped_key_hex    TEXT NOT NULL,
    wrap_nonce_hex     TEXT NOT NULL,
    created_at         INTEGER NOT NULL,
    UNIQUE(conv_id, sender_pubkey, recipient_pubkey, sender_key_version)
)
```

`ciphertext_json` on `dm_messages` is reused: when `is_encrypted=1` it
holds `EncryptedDmEnvelope`; when `is_group_encrypted=1` it holds
`GroupEncryptedEnvelope`. Both flags are never 1 simultaneously.

---

### Client-side changes

| Change | Where |
|---|---|
| `push_group_sender_key(conv_id)` Tauri command | `desktop/src-tauri/src/lib.rs` |
| `fetch_group_sender_keys(conv_id)` Tauri command | same |
| `encrypt_group_dm(conv_id, content)` Tauri command | same |
| `decrypt_group_dm(conv_id, envelope)` Tauri command | same |
| Local chain-key state file `~/.wavvon/group_sender_keys.json` | managed by Tauri commands |
| Group DM send path uses `encrypt_group_dm` | `desktop/src/App.tsx` |
| `get_dm_messages` decrypts group envelopes inline | `desktop/src-tauri/src/lib.rs` |
| Group DM banner replaced by lock icon once all keys are available | `desktop/src/components/ContentArea.tsx` |

---

### What's deferred

- Key rotation on membership change (needs member add/remove routes first)
- Federation of key distributions to remote recipient hubs
  (v2 delivers to members on the same hub; cross-hub distribution is handled
  by the same outbox/retry path as DM messages once that is extended)
- Double Ratchet (v3) — adds per-message ephemeral keys for post-compromise security
- Encrypted search (client-side post-decrypt, same constraint as 1:1)

---

---

## Hub-side changes

The hub is **storage and relay**. No key material lives on the hub.

All hub-side paths below live in Wavvon-server.

| Change | File | Note |
|---|---|---|
| `dm_messages.is_encrypted` BOOLEAN DEFAULT 0 | `hub/src/db/migrations.rs` | Additive `ALTER TABLE` — legacy rows stay 0 |
| `dm_messages.ciphertext_json` TEXT NULL | same | Holds the envelope JSON for encrypted msgs; `content` stays NULL when encrypted |
| New table `dh_keys (pubkey PK, dh_pubkey_hex, signature_hex, published_at)` | same | One row per user; replicated across the home hub list like `home_hub_designations` |
| `GET/PUT /identity/:pubkey/dh-key` routes | new `hub/src/routes/dh_keys.rs` | Mirrors the existing identity-keyed write+read shape |
| `send_dm` accepts encrypted envelopes | `hub/src/routes/dms.rs:132-288` | New `SendDmRequest` variant; on encrypted, verifies signature, persists envelope, leaves `content` NULL |
| `list_dm_messages` returns the envelope when `is_encrypted=1` | same file, ~290 | `content` field becomes `Option<String>`; client decodes ciphertext locally |
| Federated DM delivery carries the envelope | `FederatedDmRequest` in `hub/src/routes/dm_models.rs` | New optional `encrypted_envelope` field; existing `content/signature` stays for legacy plaintext peers |

**Hub validation**: on encrypted send, the hub verifies the Ed25519
signature on the envelope before INSERT. Garbage envelopes get a 400.
This is the same defense pattern as `home_hub_designations` writes.

**What breaks**: search. `messages` channel search and DM search both
operate on `content`. Encrypted DMs are search-invisible to the server;
they would have to be searched client-side after decrypt, which we don't
build in v1. Document the gap; users see "encrypted messages aren't
indexed" in the search UI.

---

## Client-side changes

| Change | Where |
|---|---|
| `Identity::dh_keypair() -> X25519KeyPair` | `identity/src/lib.rs` in Wavvon-server (extends the existing `Identity`) |
| Tauri command `publish_dh_key` | `desktop/src-tauri` in Wavvon-desktop — runs on first launch post-upgrade, or after identity creation |
| Tauri command `fetch_dh_key(pubkey, hub_url)` | with a local cache, 24 h TTL, evict on signature-verify failure |
| DM send path: encrypt when recipient DH key is known | `desktop/src/...` in Wavvon-desktop, DM send handler |
| DM send path: warn-then-send-plaintext otherwise | UI banner: "Recipient hasn't published an encryption key — this message will not be encrypted." User confirms or cancels |
| DM receive path: detect `is_encrypted`, decrypt locally | same handler that processes `dm_messages` and the `DmEvent::Message` WS stream |
| Lock-icon UI | Per-message indicator. Closed lock = E2E. Open lock = plaintext. Tooltip explains. Mixed conversations are allowed |
| Group DM banner | "Group DMs are not encrypted yet." Always shown above a group conversation; removed when v2 ships |

The DH keypair is derived on demand, not stored. The Ed25519 seed in
`~/.wavvon/identity.json` is the only secret on disk; that file already
needs to be protected.

---

## Migration / rollout

No flag day. No "upgrade conversation" ceremony.

| State | Behaviour |
|---|---|
| New client → recipient with published DH key | Encrypt. Lock icon closed. |
| New client → recipient with no published DH key | Warn user. Send plaintext if confirmed. Lock icon open. |
| New client → legacy client (no E2E support) | Same as "no DH key published" — plaintext. |
| Legacy client → anyone | Plaintext, exactly as today. |
| Reading old plaintext messages | Renders verbatim. No lock icon. |

A conversation may contain a mix of plaintext and encrypted messages
during the transition. The per-message lock icon makes the state explicit.
After everyone in a conversation has upgraded **and** published a DH key,
every new message will be encrypted automatically — no user action needed.

---

## Attachment encryption

Same scheme, same key. The `plaintext_json` we encrypt in §"1:1 message
encryption" already includes `attachments`. The attachment bytes (base64
in `Attachment.data_b64`, see `routes/chat_models.rs`) are part of the
plaintext blob and ride inside the same AES-GCM ciphertext.

Cap stays the same (`MAX_ATTACHMENTS_BYTES`, ~3 MB). AES-GCM expansion is
16 bytes, negligible against the cap. No separate attachment ciphertext
table.

---

## Open questions

| Question | Working answer |
|---|---|
| **Identity regeneration** — user wipes and regenerates their identity; the new DH key can't decrypt old messages encrypted to the old key. | Keep old DH private keys in `~/.wavvon/old_dh_keys.json` for decryption only. Never publish or encrypt with old keys. Eviction policy TBD (probably never — they're 32 bytes each). |
| **Multi-device** — Alice has two devices with different subkeys (`SubkeyCert`). Which DH key does Bob encrypt to? | Always the **master** seed's DH derivation. Master is the same across all of Alice's paired devices; subkeys do not derive their own DH keys. This matches the "two-axis state" rule — DH key is personal-axis, anchored to the master. |
| **Subkey-only devices** — what if a device was paired and only holds a subkey, not the master? | It receives the master's DH private key wrapped in the `PairingComplete` payload (the existing `wrapped_blob_key_hex` slot is the natural carrier; add a sibling `wrapped_dh_seed_hex` next to it). Document in `multi-device.md` cross-link. |
| **DH key rotation** for forward secrecy without a full ratchet | Out of scope for v1. v2 is the ratchet. A "rotate DH key" command that pushes a new key + signature would orphan past-messages on every recipient — not worth the half-measure. |
| **Hub-side abuse: encrypted blobs as a storage attack** | Same per-message size cap as plaintext today. No new attack surface beyond what plaintext DMs already allow. |

---

## What's deferred

- Group DM encryption (v2, sender-key sketch above)
- Forward secrecy / Double Ratchet (v2)
- Encrypted search (probably never; search becomes client-side post-decrypt if it returns at all)
- Voice/video/screenshare encryption — those are not in DMs yet; their own design will tackle SRTP / DTLS-SRTP when the time comes
- Encrypted typing indicators and read receipts — currently out-of-band signals; revisit if they leak useful content (typing doesn't, read receipts barely)
- Cover traffic / metadata hiding — not pursued

---

## Cross-references

- Identity model and Ed25519 seed: `identity/src/lib.rs:23-127` (Wavvon-server)
- Existing signed wire types (signing pattern this doc reuses): `identity/src/wire.rs:32-191` (Wavvon-server)
- Current plaintext DM storage and federation path: `hub/src/routes/dms.rs` (Wavvon-server)
- DM schema: `hub/src/db/migrations.rs:432-471` (Wavvon-server)
- Multi-device / master + subkey: [multi-device.md](multi-device.md)
- Home hub list (where DH keys are replicated): [home-hub.md](home-hub.md)
- Threat model (the broader view this doc slots into): [threat-model.md](threat-model.md)
