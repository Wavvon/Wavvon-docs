# Voice

Real-time voice over Opus, with RNNoise denoise and voice activity
detection. Since voice transport v2 (2026-08, design in
[voice-transport-v2.md](voice-transport-v2.md)) there is **one
transport for every client**: WebTransport (QUIC) datagrams, carrying
E2E-encrypted packets that the hub relays without being able to read.
The native capture/encode/playback pipeline lives in the `voice/`
crate in Wavvon-client; the hub-side relay is
`hub/src/voice_wt.rs` in Wavvon-server.

## Pipeline (desktop)

```
mic capture (cpal)
   ↓
RNNoise denoise + VAD
   ↓
soundboard clip mix
   ↓
Opus encode
   ↓
AEAD seal (AES-256-GCM, per-sender key)      voice/src/crypto.rs
   ↓
WebTransport datagram → hub relay (fan-out, header-only)
   ↓
AEAD open → Opus decode → per-sender gain → playback (cpal)
```

## Files

Native pipeline (`voice/` crate, Wavvon-client, used by the desktop
shell):

| Stage              | File |
|--------------------|------|
| Pipeline orch.     | `voice/src/pipeline.rs` |
| Audio capture      | `voice/src/capture.rs` |
| Denoise + VAD      | `voice/src/denoise.rs` |
| Opus codec         | `voice/src/codec.rs` |
| Packet AEAD        | `voice/src/crypto.rs` |
| WT transport       | `voice/src/transport.rs` |
| Wire protocol      | `voice/src/protocol.rs` |
| Audio output       | `voice/src/playback.rs` |
| Device enumeration | `voice/src/devices.rs` |

Key wrap/unwrap and the `voice_key_*` signaling live with each app:
`apps/desktop/src-tauri/src/voice_keys.rs` and
`apps/web/src/platform/voiceKeys.ts`.

## Why WebTransport (and not raw UDP or WebRTC)

- **One stack.** Raw UDP was desktop-only; browsers needed a separate
  TCP WebSocket relay that degraded under loss (head-of-line
  blocking). WebTransport datagrams give both clients the same
  unreliable/unordered semantics on one hub endpoint.
- **Encryption on the wire for free** (QUIC = TLS 1.3), plus E2E AEAD
  on top so the relay itself can't listen.
- **Not WebRTC**: voice is hub-relayed by design (the relay topology
  already solves NAT — every client dials out to one public
  endpoint), so SDP/ICE/DTLS-SRTP machinery buys nothing here.
  Screen-share v2 carries WebRTC where P2P actually pays.

## Why RNNoise + VAD

- RNNoise is small, real-time, and good enough for voice.
- VAD avoids transmitting silence (saves bandwidth + reduces background
  noise on the channel).

## Hub-side relay

The hub binds a WebTransport server on the voice port (default 3001,
`WAVVON_VOICE_UDP_PORT` — QUIC runs over UDP). `voice_join` (main WS)
returns `voice_token` (single-use, 30 s TTL), `voice_wt_url`, and
`voice_cert_hash`; the client opens a WT session at
`<voice_wt_url>?token=…`. Accepting the session consumes the token and
binds it to `(channel, pubkey)` — audio is never relayed to or from an
unbound session (this inherits the anti-spoofing invariant of the old
VXRG design, now enforced at the QUIC handshake).

Certificates: hubs with `WAVVON_TLS_CERT`/`KEY` use their real cert;
otherwise the hub auto-generates a self-signed ECDSA cert (≤14-day
validity, rotated at ~10 days, hot-swapped) whose SHA-256 digest is
published in `/info` — browsers pass it via WebTransport
`serverCertificateHashes`, desktop pins the same hash. No CA needed
for voice.

Relay behavior: each inbound datagram gets `[sender_id:u16]
[packet_type:u8]` prepended and is fanned out to the channel's other
sessions (whisper = `0x01`, targeted set). The payload is opaque to
the hub — header-only forwarding.

## E2E encryption

Per-packet AES-256-GCM under per-sender **sender keys**, distributed
over the authenticated main WS via `voice_key_offer` /
`voice_key_received` / `voice_key_request` — wrapped to each
participant with static-static X25519 (the DM DH machinery; paired
devices use the canonical DH scalar exactly like DMs). Keys rotate on
participant leave, so a departed member can't decrypt later audio.
Nonces are `salt[4] || ctr[8]` with a per-key monotonic u64 counter;
receivers keep per-sender replay watermarks. Full construction + test
vectors: [voice-transport-v2.md](voice-transport-v2.md) and
[wire-format.md](wire-format.md).

The hub operator cannot listen to voice — same privacy model as
encrypted DMs ([threat-model.md](threat-model.md)).

## Web client

`VoiceWtSession` in `apps/web/src/platform/voice.ts` (Wavvon-client):
`getUserMedia` capture, `opusscript` encode/decode at 960 samples /
20 ms / 48 kHz, per-sender `GainNode` playback with proximity
attenuation, WebTransport datagrams for transport, crypto from
`packages/core` (`voicePacketSeal/Open`, `voiceKeyWrap/Unwrap` —
vector-pinned to the identity crate). RNNoise is not in the browser
path; the WASM codec and the browser audio graph remain the practical
ceiling.

> Note: there's no separate "voice channel" type. Every Wavvon channel
> is both text and voice — joining voice is something a user does
> *in* a channel, not a property of the channel itself. See
> [decisions.md](decisions.md).

## Self-mute / self-deafen

Client-side. Self-mute stops capture; self-deafen stops decoding incoming
streams. Neither involves the hub — it's purely UI state. (Hub-side
mute, e.g. moderator mute, is a different mechanism — see roles and
moderation.)

## What's not done

- Cross-hub voice (alliance-wide voice rooms)
- Voice E2E on **paired desktop devices** — desktop pairing doesn't
  provision the canonical DH scalar yet (pre-existing gap, also
  affects desktop DMs; fix points marked in `voice_keys.rs` /
  `dm.rs`, tracked in [client-parity.md](client-parity.md))
- Jitter buffer on the web receive path (per-packet playback today)
- Multiple audio output device routing (assign different
  speakers/headsets per participant or per channel; device enumeration
  is already in `voice/src/devices.rs`)
