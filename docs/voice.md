# Voice

Real-time voice over Opus, with RNNoise denoise and voice activity
detection. Two transports share one wire format and one hub fan-out:
**UDP** for the native clients (desktop, Android) and a **WebSocket
relay** for the browser, which cannot open raw UDP sockets. The native
capture/encode/playback pipeline lives in the `voice/` crate in
Wavvon-client; the hub-side UDP relay and the WS relay both live in the
`hub/` crate in Wavvon-server. All four clients participate in the same
voice channels.

## Pipeline

```
mic capture (cpal)
   ↓
RNNoise denoise + VAD
   ↓
Opus encode
   ↓
UDP packet (hub/ crate UDP relay in Wavvon-server)
   ↓
Opus decode
   ↓
playback (cpal)
```

## Files

All paths below are in the `voice/` crate of Wavvon-client (the native
UDP pipeline used by the desktop and Android shells):

| Stage              | File |
|--------------------|------|
| Pipeline orch.     | `voice/src/pipeline.rs` |
| Audio capture      | `voice/src/capture.rs` |
| Denoise + VAD      | `voice/src/denoise.rs` |
| Opus codec         | `voice/src/codec.rs` |
| UDP transport      | `voice/src/transport.rs` |
| Wire protocol      | `voice/src/protocol.rs` |
| Audio output       | `voice/src/playback.rs` |
| Device enumeration | `voice/src/devices.rs` |

## Why UDP, not WebRTC

- Predictable latency under loss (we control retransmission policy: none).
- Smaller dependency footprint.
- We already have hub identity for auth — we don't need DTLS-SRTP machinery.

## Why RNNoise + VAD

- RNNoise is small, real-time, and good enough for voice.
- VAD avoids transmitting silence (saves bandwidth + reduces background
  noise on the channel).

## Hub-side relay

The hub's UDP listener (default port 3001) receives encrypted/signed Opus
frames from users currently in voice on a channel and fans them out to
the other connected users on that channel. Frames are not transcoded;
the hub is just an SFU-style relay.

**Address learning (networked voice Phase 1, hub v0.2.2):** the relay
learns each participant's real address from a token-gated UDP bind, not
from anything the client reports. `voice_joined` carries a single-use
`udp_register_token` (30 s TTL); the client sends `VXRG` + token to the
voice port (retrying until the hub acks with `VXRA`), and the hub binds
the packet's actual source address. Audio is never relayed to or from an
address that has not completed this bind — which also closes the
spoofed-source reflection vector. Design and rationale:
[voice-networking-design.md](voice-networking-design.md).

## Web voice — the WebSocket relay

Browsers cannot send raw UDP, so the hub exposes a second voice path
alongside UDP: a `/voice/ws` WebSocket endpoint (`hub/src/routes/voice_ws.rs`
in Wavvon-server). A web client authenticates with its session token +
`channel_id`, receives a `voice_ws_ready` JSON frame carrying its assigned
`sender_id` and the current participant list, then exchanges **binary Opus
frames in the same wire format as UDP clients** — `[seq:u16 BE][ts:u32 BE]
[opus…]` on upload, `[sender_id:u16 BE][packet_type:u8][seq:u16 BE][ts:u32
BE][opus…]` on download.

The hub fan-out routes every relayed frame to **both** transports for the
channel: UDP for desktop/Android participants and WS for web participants.
`AppState` gained `voice_ws_senders` (the per-channel WS sender registry)
and `voice_udp_socket`; `leave_voice` and `get_voice_participants` are
`pub` so the WS handler shares the same participant bookkeeping as UDP.

The web client side is `VoiceWsSession` in
`apps/web/src/platform/voice.ts` (Wavvon-client). It captures the
microphone via `getUserMedia`, encodes/decodes with `opusscript` (a WASM
Opus codec — there is no native Opus crate in the browser), framing at
960 samples / 20 ms per frame at 48 kHz via a `ScriptProcessorNode`, and
plays decoded frames back. RNNoise/VAD denoise is not in the browser path;
the WASM codec and the browser audio graph are the practical ceiling for
v1.

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

- E2E encryption between voice participants (today the hub sees frames
  as it relays them — see [`threat-model.md`](threat-model.md))
- Cross-hub voice (alliance-wide voice rooms)
- **Per-user gain** — designed in [`voice-volume.md`](voice-volume.md);
  requires adding `sender_id` to fan-out packets and splitting the receive
  pipeline by sender
- **Proximity / spatial attenuation** — designed in
  [`proximity-voice.md`](proximity-voice.md); requires per-user gain first
- Multiple audio output device routing (assign different speakers/headsets
  per participant or per channel; device enumeration is already in
  `voice/src/devices.rs`)
