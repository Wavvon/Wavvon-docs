# SDK voice: a program in a voice channel

> **Status (2026-11-17): built in the Rust SDK** (Wavvon-sdk-rust#21,
> smoke-tested against a real hub) **and the Go SDK** (Wavvon-sdk-go#17, the `voice`
> package, smoke-tested against a real hub and in one room with the Rust SDK, each
> side reading the other's frames); tracking issue
> [Wavvon-sdk-rust#19](https://github.com/Wavvon/Wavvon-sdk-rust/issues/19).
> Rust went first and settled the API; Python (Wavvon-sdk-python#14) followed.
> **Since 2026-11-21 voice rides a WebRTC data channel**
> ([voice-transport-v3.md](voice-transport-v3.md)), which unblocked the three
> SDKs that had no WebTransport client: TypeScript (Wavvon-sdk-js#24), C#
> (Wavvon-sdk-dotnet#12) and Java (Wavvon-sdk-java#12) have voice too. All six
> send and receive Opus; PCM is an opt-in extra where a language has one. Use
> cases: a radio program streaming freely licensed audio into a room (the
> `radio/` program in Wavvon-demo-bot, built on the Rust SDK), and a program
> standing at a position in a proximity room. Parent: [sdk.md](sdk.md) §8.

A program in voice does exactly what the two clients do. No hub change is
needed: the hub has no program-specific voice path and blocks nothing for a
program that a person would pass. Everything below is client-side work in
each SDK, built on wire formats and vectors that already exist.

## 1. Join sequence

All signalling rides one chat WebSocket (`/ws`). The Rust SDK opens a socket
of its own for the room, so `client.events()` and the voice session never
share one and the room's messages are never repeated in `events()`. It must be the same socket throughout: the hub
records the voice room on that connection (`cs.voice_channel`), refuses
position updates from any other, and runs `leave_voice` when it closes.

1. **Publish the DH key** (once per hub, before the first join; §2).
2. **`voice_join { channel_id }`.** Gates in Wavvon-server
   `crates/hub/src/routes/ws/handlers/voice.rs` `handle_voice_join`: no
   mini-app session, hub and channel voice-mute, channel `voice.join`. A
   rejected join answers `error` with context `voice_join`.
3. **`voice_joined`** carries `channel_id` (may differ from the request for a
   spawner room: use this one from now on), `sender_id: u16`, `participants`
   (`public_key`, `sender_id`), `voice_token` (32 random bytes hex, single
   use, **30 s TTL**) and `may_speak`.
4. **WebRTC offer.** One peer connection with one negotiated data channel
   `voice` (`negotiated: true, id: 0, ordered: false, maxRetransmits: 0`);
   send `voice_rtc_offer { token, sdp }` on the same socket and apply the
   `voice_rtc_answer { sdp }` that comes back. The hub is ICE-lite, so the
   client trickles nothing. Hub side: Wavvon-server
   `crates/hub/src/routes/ws/handlers/voice.rs` `handle_voice_rtc_offer`
   consumes the token and binds `(channel, pubkey)`. While waiting for the
   answer, keep every other event: a dropped `voice_key_received` is a deaf
   listener. Details in [voice-transport-v3.md](voice-transport-v3.md).
5. **Key offer** to every other participant from `voice_joined` (§2).
6. **Packets**, one per data-channel message. Uplink `key_id_be[4] || ctr_be[8] || ts_be[4] ||
   AES-256-GCM(opus)`; downlink is the same prefixed by `sender_id_be[2] ||
   packet_type[1]` (`0x00` normal, `0x01` whisper). Layout and vectors in
   [wire-format.md](wire-format.md), "Voice packet seal".
7. **Leave**: `voice_leave { channel_id }`, then close the peer connection.
   Closing the peer connection alone does not leave the roster.

While in the room the SDK handles `voice_participant_joined` / `_left`,
`voice_roster_update` (sender_id to pubkey), `voice_key_request`,
`voice_key_received`, `voice_talk_granted`, `voice_move`, the zone events
(§4), and sends `voice_speaking { channel_id, speaking }` on each start and
stop of transmission. That message is the hub's only activity signal for the
AFK sweep (`afk_worker.rs`).

A WebSocket drop means the hub has already run `leave_voice`. The SDK surfaces
it, re-joins after the socket returns (fresh token, fresh key generation,
`ctr` from 0), and never silently resumes on the dead session.

## 2. Voice E2E for a program

There is no cleartext voice. A participant whose DH key cannot be resolved is
skipped by every key distributor (the clients' deliberate reading of a 404),
so **a program without a published DH key is both deaf and mute**: nobody
wraps a key to it, and nobody can unwrap the key it offers, because unwrapping
needs the sender's published X25519 key.

What the SDK implements, all from the existing `wavvon-identity` crate
(Wavvon-server `crates/identity/src/voice.rs`, `wire.rs`):

- **DH key.** X25519 secret = SHA-512(Ed25519 seed)[0..32], clamped. Publish
  with `PUT /identity/{own_pubkey}/dh-key` `{dh_pubkey_hex, signature_hex}`,
  signature over `DhKeyRecord::signing_bytes` (`"wavvon/dh-key/v1\0"`, then
  length-prefixed pubkey hex and DH pubkey hex). Check with a `GET` first; a
  published key equal to the derived one is left alone.
- **Sender key.** On join: `SK[32] || salt[4]` random, `key_id = 1`, `ctr` from
  0, never reused under one key.
- **Wrap** per recipient (`voice_key_wrap`): X25519(own scalar, recipient DH
  pub), HKDF-SHA256(salt = channel_id UTF-8, info `wavvon/voice-key/v1`),
  AES-256-GCM over `SK || salt || key_id_be`, random 12-byte nonce. Sent as
  `voice_key_offer { channel_id, bundles: [{recipient_pubkey, ciphertext_hex,
  nonce_hex}] }`.
- **Recipient DH lookup**: `GET /identity/{pubkey}/dh-key`, verify the
  record's signature against that pubkey, then pin it (decisions.md, "A peer's
  DH key is pinned on first use"); a changed key skips that peer. A 404 skips
  the peer; a 429/5xx/timeout is retried per [sdk.md](sdk.md) §5, never read
  as "no key".
- **Unwrap** on `voice_key_received` (`voice_key_unwrap`), keyed by
  `from_pubkey`; keep every generation by `key_id` until the sender leaves.
  A new key for a `(sender, key_id)` restarts its counter watermark; the
  watermark otherwise advances only for a packet that opened, so a forged
  packet cannot lock the real sender out. A rejoin never reuses a `key_id`.
- **Rotate** on `voice_participant_left`: `key_id + 1`, fresh `SK`/salt, `ctr`
  back to 0, re-offer to everyone remaining. Answer `voice_key_request` with an
  offer to the newcomer only.
- **Receive**: map `sender_id` to pubkey from the roster, look up `(pubkey,
  key_id)`, enforce the per-`(sender_id, key_id)` `ctr` watermark, open.
  Unknown sender, unknown key or replay: drop.

**Vectors**: all needed already exist in Wavvon-server
`crates/identity/wire-vectors.json`: `master_dh_pubkey` (seed to X25519),
`dh_key_record`, `voice_key_wrap`, `voice_packet_ctr0`, `voice_packet_ctr7`.
Each voice-capable SDK asserts all five in its conformance test; the Rust SDK
gets the implementations from `wavvon-identity` and asserts them anyway. None
need adding. The downlink prefix is three plain bytes and gets no vector.

**A program with a DH key gets encrypted DMs.** Both clients encrypt a DM to
any recipient with a published key, so E2E DMs ship in the same release as
voice. What the SDK implements for them, and which vectors are still missing,
is [sdk-dm.md](sdk-dm.md). A DM-only program is a first-class use case, not a
side effect (decisions.md, "SDK voice and E2E DMs: the SDK offers the
mechanism, the program sets the policy").

## 3. Audio

**What the clients send** (verified 2026-11-16): Opus, **mono, 20 ms frames,
48 kHz** clock, bitrate left to the encoder, application `voip` (`audio` for
the music profile). Web: `voiceEncodeWorker.ts` and `opusConfig.ts` (mono is
enforced there, with the reason). Desktop: `crates/voice/src/codec.rs`. `ts`
counts 48 kHz samples, +960 per frame, advancing across suppressed frames too;
`ctr` advances only on frames actually sent.

**What the SDK must send**: exactly **20 ms** Opus packets. The desktop
decoder's output buffer holds 20 ms (`VoiceDecoder::new`), so a 40 or 60 ms
packet fails to decode on every desktop listener. The SDK reads the
packet's TOC byte and refuses any other duration, since nobody could hear it.
Channel count is the program's choice; both clients decode to mono today. Keep packets
under ~1000 bytes (one unfragmented data-channel message); for music, 64-96 kbps mono with
application `audio` is ample.

**API shape** (§6): `send_opus(packet)` for pre-encoded 20 ms Opus, which
needs no native library (a radio source that is already Ogg Opus is demuxed
and passed through); `send_pcm(&[f32; 960])` behind an optional feature that
links libopus. Receive yields per-speaker events `{ from_pubkey, sender_id,
ts, ctr, whisper, opus }`, with decoded 48 kHz mono PCM when the PCM feature is
on (one decoder per sender).

**Pacing** is the SDK's: `send_*` awaits its 20 ms slot on a monotonic clock,
so a program reading a file or stream faster than real time is held back
rather than flooding the relay. A program that falls behind by more than a
few frames is re-anchored, `ts` jumping by the missed slots. **Jitter
buffering** on receive is the program's: the SDK delivers packets as they
arrive with `ts` and `ctr`, decoded or not.

**Mute and deafen are local**: the hub has no self-mute state. Mute stops
sending and sends `voice_speaking false`; deafen stops delivering received
audio but keeps key distribution running, so undeafening is instant.
**Talk power**: with `may_speak: false` the relay drops the program's
packets; `send_*` returns a typed `MayNotSpeak` error rather than sending
into nothing, and `voice_talk_granted` lifts it. A hub voice-mute refuses the
join itself.

**`voice_move`** (a moderator, or the AFK sweep with `auto: true`) is a request
the client carries out; the hub moves no one. The SDK surfaces it as an event
and does not move on its own.

## 4. Proximity

The zone list arrives in `voice_zone_state` right after `voice_joined`, then
`voice_zone_created` / `voice_zone_destroyed`. A position is
`voice_position_update { zone_id, position: [f64; 2 or 3] }`, accepted only
from the socket in voice, in a zone of that room, and for `creator_only`
zones only from the creator (`handle_voice_position_update`).

The hub drops, **silently**, an update less than 30 ms after the previous one,
an unknown zone, and a refused `creator_only` sender. So the SDK: checks the
zone exists and the arity matches its `coordinate_system`; coalesces to the
latest position and sends at most one every 50 ms (margin over 30 ms, since
WebSocket frames can arrive bunched), always sending the trailing one. The
room map's zone is 2D, 0..100 on each axis.

Creating a zone (`voice_zone_create`) needs channel `channels.manage` and
being in voice; standing in an existing one needs neither. Attenuation is
computed by each listener; a program that listens and wants it applies the
model in [proximity-voice.md](proximity-voice.md) itself (no SDK helper yet).

## 5. Permissions, capabilities, hub changes

A program needs channel `voice.join` (or a voice-only presence grant), talk
power where the channel sets a threshold, and `channels.manage` only to create
zones. No `apps.register` is needed for voice. Mini-app scoped sessions cannot
join, by design; a program's normal session can.

Capability gate: `channels.voice` and `voice.webrtc`; a hub without the
second (older than voice transport v3) is `UnsupportedByHub`.

**No hub change is required.** The silent drops in `handle_voice_position_update`
for an unknown zone and a refused `creator_only` sender now answer `error` with
context `voice_position_update` (Wavvon-server#416; the rate limit drop stays
silent). The SDKs surface it as `VoiceEvent::PositionRefused { reason }` (Rust)
and `voice.PositionRefused` (Go): an event, never a fatal error and never a
policy.

## 6. Rust API (the reference)

Cargo features: `voice` (`str0m`, Opus passthrough, no C dependency) and
`voice-pcm` (adds `audiopus`, which builds libopus).

```rust
let voice = client.join_voice(&channel_id).await?;  // DH publish, join, WT, offer
voice.may_speak();                                   // bool, updated live
voice.send_opus(&packet).await?;                     // one 20 ms packet, paced
voice.send_pcm(&frame_960_mono).await?;              // feature voice-pcm
voice.set_muted(true); voice.set_deafened(false);
voice.set_position(&zone_id, &[40.0, 60.0])?;        // coalesced, >= 50 ms apart
while let Some(ev) = voice.next().await { match ev? {
    VoiceEvent::Audio(a) => {}   // from, sender_id, ts, ctr, whisper, opus, pcm
    VoiceEvent::Roster(_) | VoiceEvent::Speaking { .. } | VoiceEvent::Zones(_)
    | VoiceEvent::Position { .. } | VoiceEvent::PositionRefused { .. }
    | VoiceEvent::TalkGranted | VoiceEvent::MoveRequested { .. }
    | VoiceEvent::Rejoining | VoiceEvent::Unknown { .. } => {}
}}
voice.leave().await?;
```

`Voice` is cheap to clone, and `next` takes `&self`, so one task can send
while another reads. `set_position` is synchronous (it checks the zone and
arity, then the newest position goes out at most every 50 ms). A `voice_*`
message the SDK does not model is `VoiceEvent::Unknown`; chat traffic that
reaches the room's socket is ignored, not surfaced. `VoiceEvent::KeySkipped`
reports a peer that could not be given the key. `create_zone` and
`destroy_zone` exist for programs holding `channels.manage`.

**Go** (Wavvon-sdk-go#17, package `voice`): `voice.Join(ctx, client, channelID)`
returns a `*Voice` with `Events() <-chan Event` (an unbounded queue behind it),
`SendOpus`, `SendPCM`, `SetPosition`. The cert-hash pin is a `tls.Config` with
`VerifyPeerCertificate` comparing SHA-256 of the leaf DER (system verification
off only in that branch). Crypto is stdlib (`crypto/ecdh` X25519, AES-GCM,
HKDF written out); the seed-to-X25519 step is SHA-512 and a clamp, asserted by
`master_dh_pubkey`. `SendOpus` is pure Go; PCM needs cgo and libopus behind the
`opus` build tag (`gopkg.in/hraban/opus.v2`). Transport is `pion/webrtc`.

**Python** (Wavvon-sdk-python#14): transport is `aiortc`, which gathers every
candidate before `setLocalDescription` returns, so the offer is complete when
sent. asyncio holds 20 ms pacing on slot arithmetic, not on sleeps: a late
wake-up is caught up inside the three-frame lag window. Crypto is
`cryptography` (X25519 from raw bytes, HKDF, AESGCM). PCM is the `opus` extra
(`opuslib`, which needs the libopus shared library); the default install
carries Opus passthrough only. API: `client.join_voice(channel)` returns a
`Voice` with `async for` events, `send_opus`, `send_pcm`, `set_position`.

**TypeScript, C#, Java** (Wavvon-sdk-js#24, Wavvon-sdk-dotnet#12,
Wavvon-sdk-java#12): Opus passthrough only, no PCM. JS uses `werift` (pure
TypeScript, an optional peer dependency, Node 22+); .NET uses SIPSorcery, which
sends the channel reliable and ordered whatever `maxRetransmits` says, harmless
for 20 ms frames on a healthy link; Java uses `webrtc-java` (JNI over
libwebrtc), an optional dependency a program adds for voice.

## 7. Smoke test

Against ONE running hub (`WAVVON_SMOKE_HUB`), per the SDK smoke convention, and
one real web client driven by Playwright (the clients `run-web` skill) with
Chrome's fake microphone and `--mute-audio`, so nothing plays through the
speakers. Every assertion must need a decoded frame, never a roster row:

1. The program creates a voice channel, joins, sends 5 s of a 440 Hz tone (or
   a fixed Opus clip without `voice-pcm`). The browser joins the same room;
   its inbound packet-loss readout for the program's `sender_id` must become
   non-null, which needs unwrap, open and decode.
2. Reverse: the browser's fake microphone transmits; the program must decode
   at least 100 frames from the browser's pubkey.
3. Rotation: the browser leaves and re-joins; the program's next frames carry
   `key_id 2` and still decode.
4. Proximity: the program creates a zone (role with `channels.manage`), sends
   ten positions within 100 ms; the browser's `voice_position_updated` events
   end at the last one.
5. Run step 1 once with the DH publish skipped, to prove the stage detects a
   silent program.

## 8. Radio: licensing

The SDK carries audio; it judges none. The demo program and its docs stream
only material that may be redistributed: public domain, CC0, or Creative
Commons terms that allow it (with attribution posted in the channel when the
licence asks). Not commercial radio, not licensed music streams: rebroadcasting
them needs licences no hub operator or program author is presumed to hold, and
E2E means the hub operator cannot even see what is played. Responsibility sits
with whoever runs the program.

## 9. Deferred

An attenuation helper; a receive jitter buffer; video and screen share.

DH pins live behind a small store interface (get, put). The SDK ships an
in-memory default; a program that wants pins across restarts plugs in its own
storage. The DM ratchet state uses the same store ([sdk-dm.md](sdk-dm.md) §5). Policy (AFK handling, what to do on a changed key beyond skipping,
stereo or mono) is the program's: the SDK exposes events and mechanisms and
decides nothing on its behalf.
