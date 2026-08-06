# Voice Transport v2 — WebTransport + E2E encryption

> **Status:** SHIPPED 2026-08-07 (server `3d49c11`, clients `2ab799e`;
> see [shipped-log.md](shipped-log.md)). Replaces
> the raw-UDP relay (desktop) and the WebSocket Opus relay (web) with a
> single WebTransport (QUIC) transport carrying E2E-encrypted audio.
> Supersedes [voice-networking-design.md](voice-networking-design.md)
> Phase 1.5 and Phase 2 (Phase 1's token-gated bind shipped and its
> token/flow is reused here). Alpha rule applies: the old transports
> are DELETED, not kept as fallbacks — no two versions.

## Why

- **One transport instead of two.** Today the hub relays voice twice —
  raw UDP for desktop (`hub/src/main.rs` relay loop) and binary frames
  over a dedicated WebSocket for web (`hub/src/routes/voice_ws.rs`).
  Two code paths, two client stacks, sentinel-address bookkeeping.
- **Web gets real-time-grade voice.** The WS relay is TCP: one lost
  packet stalls everything behind it. WebTransport datagrams are
  unreliable/unordered — the right semantics — and supported by all
  current browsers (Chrome/Edge/Firefox; Safari since 18.2).
- **Encryption.** Today Opus payloads cross the wire and the relay in
  cleartext (threat-model bullet). v2 gives transport encryption for
  free (QUIC = TLS 1.3) **and** E2E per-packet AEAD so the hub operator
  cannot listen (same privacy model as encrypted DMs).
- QUIC bonuses recorded for later: connection migration (mobile),
  SNI/URL-based single-port routing at the farm (not in scope).

## Transport

### Endpoint

The hub binds a WebTransport server (`wtransport` crate) on the
existing voice UDP port (`WAVVON_VOICE_UDP_PORT`, default 3001) —
QUIC runs over UDP, so port semantics and firewall guidance are
unchanged. Session URL:

```
https://<host>:<port>/voice?token=<hex>
```

`token` is the single-use register token minted at `voice_join`
(today's `udp_register_token`, renamed `voice_token` in the
`voice_joined` reply — alpha, no compat). Accepting a session consumes
the token and binds the session to `(channel_id, pubkey)` — the
same `voice_pending_binds` map; VXRG/VXRA and `voice_addr_map` are
deleted. Session close = unbind (WS `leave_voice` still authoritative
for roster).

### Certificates

- If `WAVVON_TLS_CERT`/`WAVVON_TLS_KEY` are set, the WT endpoint uses
  that certificate; browsers connect with normal CA validation.
- Otherwise the hub generates a **rotating self-signed ECDSA P-256
  cert, 14-day validity** (rcgen — same dependency as LAN mode's
  `lan::load_or_create_self_signed`), regenerated on startup and at
  ~10 days by a maintenance task. Its SHA-256 digest is published in
  `/info` as `voice_cert_hash`; browsers pass it via WebTransport
  `serverCertificateHashes` (which requires exactly this: ECDSA,
  ≤14-day validity); the desktop client pins the same hash.
- `/info` gains `voice_wt_url` (absolute `https://host:port/voice`,
  built from the advertise host — same source as `voice_udp_addr`,
  which it replaces) and `voice_cert_hash` (hex, null when a CA cert
  is in use). `voice_joined` carries both too, so clients need no
  second `/info` fetch (this also fixes the desktop bug of hardcoding
  `:3001` — `voice_cmd.rs` must use these fields).

## Datagram wire format

Uplink (client → hub), header cleartext, payload sealed:

```
[key_id: u32 BE][ctr: u64 BE][ts: u32 BE][AES-256-GCM ciphertext+tag]
```

- `key_id` — the sender-key generation this packet is sealed under.
- `ctr` — per-sender-key monotonic packet counter, starts at 0, never
  reused under the same key. Replaces the old wrapping `seq:u16`
  (which wrapped in ~22 min — nonce-hostile) and provides ordering.
- `ts` — Opus timestamp (48 kHz samples), as today; jitter-buffer
  food, not consumed by the relay.

Downlink (hub → client): the relay prepends routing bytes verbatim,
exactly as today:

```
[sender_id: u16 BE][packet_type: u8][uplink packet unchanged]
```

`packet_type`: `0x00` normal, `0x01` whisper (unchanged). The legacy
8-byte no-type header (`protocol.rs:83-96`) is deleted.

### AEAD

- Cipher: **AES-256-GCM** (already the project cipher: DMs, backups;
  WebCrypto-native on web).
- Nonce (12 B): `salt[4] || ctr_be[8]` — `salt` is a random 4-byte
  value distributed with the sender key (SRTP/TLS-style).
- AAD: the 16-byte uplink header. The key is per-sender-per-channel,
  so cross-channel replay fails on key lookup; within a channel,
  receivers keep a per-`(sender_id, key_id)` highest-`ctr` watermark
  and drop `ctr` at-or-below it (small reorder window allowed).
- The relay never holds a content key: header-only forwarder, same
  privacy model as DMs.

## E2E key distribution

Reuses the **already-shipped hub signaling** that was specified for
"V4 voice encryption" and never wired on clients
(`chat_models.rs`: `VoiceKeyOffer{channel_id, bundles}`,
`VoiceKeyBundle{recipient_pubkey, ciphertext_hex, nonce_hex}`,
`VoiceKeyReceived{channel_id, from_sender_id, from_pubkey, …}`,
`VoiceKeyRequest{channel_id, new_sender_id, new_pubkey}`; hub test
`voice_encryption_flow.rs`).

- **Sender key**: each participant generates `SK[32] || salt[4]`,
  `key_id` starting at 1.
- **Wrap** (one bundle per recipient): static-static X25519 between
  sender and recipient identity-derived DH keys (recipient key from
  the existing `GET /identity/{member}/dh-key`), then
  HKDF-SHA256(ikm=shared, salt=`channel_id` bytes,
  info=`wavvon/voice-key/v1`) → AES-256-GCM over the 40-byte
  plaintext `SK[32] || salt[4] || key_id_be[4]`, random 12-byte wrap
  nonce. Same construction as the group-DM `wrap_chain_key`
  (`dm.rs:558`), different HKDF info tag.
- **No signature envelope**: static-static DH authenticates the
  sender implicitly (only the claimed sender's static X25519 can
  derive the shared secret); bundles travel over the authenticated
  WS. A malicious hub can drop/misroute (it already can — it's the
  relay) but cannot read or forge a bundle.
- **Flows**:
  - *Join*: joiner generates its key and sends `voice_key_offer`
    covering all current participants; the hub notifies existing
    participants via `voice_key_request` (the `handlers/voice.rs:398`
    TODO), and each replies with an offer targeting the newcomer.
  - *Leave*: every remaining sender rotates (`key_id + 1`, fresh
    `SK`/`salt`) and re-offers — the departed member cannot decrypt
    future audio.
  - *Unknown `(sender, key_id)` on receive*: drop the packet.
    <!-- ponytail: no key re-request message; worst case is silence-until-
    next-rotation after a lost WS frame (TCP ⇒ ~never). Add a re-request
    message if it ever shows up in practice. -->

### Identity-crate additions (canonical, mirrored TS + desktop)

New in `server/crates/identity`, with fixed test vectors in
`wire_vectors.rs` and [wire-format.md](wire-format.md), mirrored in
`packages/core` (TS — note: the group sender-key code was never
mirrored to TS; voice-key code MUST be) and asserted by the desktop
`dm.rs`-adjacent implementation:

- `voice_key_wrap / voice_key_unwrap` — the construction above.
- `voice_packet_seal / voice_packet_open` — header build + AEAD.
- Domain tag: `wavvon/voice-key/v1` (HKDF info; no NUL — HKDF-info
  convention, matching `wavvon/group-key-dist/v1`).

## What gets deleted

- Hub: the raw-UDP relay loop + VXRG/VXRA + `voice_addr_map` +
  `voice_consumed_tokens` + sentinel addresses; the whole
  `routes/voice_ws.rs` web relay; `voice_ws_senders`; the parallel
  whisper SocketAddr target set (pubkey-keyed sessions make one set
  enough).
- Desktop: `transport.rs` UDP socket (replaced by a wtransport
  client), the VXRG register task, the legacy 8-byte header parse,
  the `:3001` hardcode.
- Web: the `VoiceWsSession` socket layer (capture/encode/playback
  stays; only the transport + crypto change) and the server's
  `/voice/ws` route it spoke to. Web now sends `voice_join` over the
  main WS like desktop and receives `voice_joined` (roster fields
  already equivalent to the deleted `voice_ws_ready`).

## Farm

Unchanged contract — voice never proxies through the farm; clients
dial the node directly using `voice_wt_url`. The farm/agent spawn bug
(no per-hub `WAVVON_VOICE_UDP_PORT` in the child env → fatal bind
collision) is fixed as part of this work: allocate + persist a voice
port per hub next to `process_port`, pass it at spawn.

## Security notes

- Operator eavesdropping: closed (E2E AEAD; relay sees headers only).
- On-path sniffing: closed (QUIC/TLS 1.3 under everything).
- Replay: per-key `ctr` watermark; nonce uniqueness by construction.
- Spoofed-source amplification: gone with UDP — WT sessions are
  authenticated at CONNECT by the single-use token.
- Ceilings accepted: no skipped-key store (drop on unknown key until
  next rotation); no jitter buffer added on web (pre-existing);
  ScriptProcessorNode capture on web kept as-is (separate concern).
