# Video in Voice Channels

Real-time webcam video alongside the existing UDP voice pipeline. Participants
who enable their webcam establish WebRTC peer connections with each other; the
hub relays signaling but never touches media. **Audio stays on the existing
Opus/UDP pipeline** — WebRTC carries video only.

---

## Decision 1 — WebRTC mesh + active speaker management, not a mandatory SFU

**Decision**: clients establish `RTCPeerConnection` directly with each other
(mesh). The hub is a pure signaler. No SFU is required to run a hub.

To handle groups larger than ~4 without bandwidth collapse, only the
**1–3 currently active speakers** have their video tracks enabled at any
moment. All other connections stay alive but remote video tracks are paused
(`track.enabled = false`). Upload bandwidth is one stream per participant
regardless of group size.

**Alternative — mandatory SFU**: all media flows through a Selective Forwarding
Unit. Rejected: running a media server alongside every hub contradicts the
"runs on a home box" ethos. SFU is an optional operator add-on (Decision 4).

**Alternative — hub-relayed video chunks**: extending screen-share v1 relay.
Rejected: 30 fps video per participant is orders of magnitude more data than
screen-share. Hub CPU/memory cost is prohibitive.

**Tradeoff**: in mesh, each participant uploads one stream regardless of group
size; the active-speaker gate keeps downloads bounded at 1–3 streams. Signaling
scales as O(N²) connections but that is a handful of WS messages, not media.

### Scale tiers

| Group size | Behaviour |
|---|---|
| 1 – 4 | Full grid — all streams active |
| 5 – ~20 | Active speaker + thumbnails — top-3 active, rest paused |
| 20+ | Active speaker only — 1 dominant, pinnable |
| Any + SFU | SFU mode — one upload, N downloads managed by the SFU |

---

## Decision 2 — Reuse screen-share v2 signaling shape

**Decision**: video signaling uses the same WS offer/answer/ICE-trickle pattern
as screen-share v2. New envelope family (`video_*`) to avoid lifecycle
ambiguity; hub dispatch logic is identical.

**Alternative — tag video tracks on existing screen-share peer connections**.
Rejected: screen share and webcam have different lifecycles (share starts/stops
per stream; webcam is per participant per voice session). Clean separation is
worth the extra envelope types.

---

## Decision 3 — Audio stays on UDP; WebRTC carries video only

**Decision**: `getUserMedia({ video: true, audio: false })`. The existing
Opus/UDP pipeline handles all audio.

Reasons: RNNoise denoise, VAD, PTT, self-mute, per-participant gain, and
proximity attenuation all live on the UDP side. Duplicating them in WebRTC
is unnecessary and a regression path. The Opus pipe is proven; WebRTC audio
would lose features.

**Tradeoff**: slight A/V sync drift is possible (two transports). Acceptable
for casual hangouts. The active-speaker view naturally ties video focus to the
audio pipeline via the existing `voice_participant_speaking` WS events.

---

## Decision 4 — SFU is an optional operator add-on, not v1 scope

**Decision**: v1 ships mesh-only. Hub operators running large events (concerts,
conferences) can deploy a compatible SFU (mediasoup, LiveKit, Pion) and set
`WAVVON_SFU_URL` in their hub env. Hub advertises `sfu_url` in `GET /info`;
clients detect it and switch transport automatically. SFU integration is
**not built in v1** — the hook is designed-in so it can be added without
client changes.

---

## Active speaker detection

Driven by the existing `voice_participant_speaking` WS event — no new protocol.

1. Maintain a recency-sorted list of who is speaking.
2. The top `MAX_ACTIVE_VIDEO = 3` speakers have their video tracks enabled.
3. When a speaker goes silent: video stays active for `LINGER_MS = 3000` before
   pausing, preventing flicker on short pauses.
4. **Manual pin**: user can pin any participant → their video is always active
   regardless of speaking state. One pin counts toward the 3-stream limit.
5. Self-view is always shown locally; it is never counted toward the limit.

Proximity voice integration: in a concert zone the performer's audio is always
"speaking" (proximity attenuation makes them loudest) → their video is always
the active stream. No extra plumbing needed.

---

## Background effects

Client-side canvas pipeline using `@mediapipe/selfie_segmentation`.
Raw webcam frames never leave the device — segmentation runs in WebGL
in the browser.

```
getUserMedia({ video: true, audio: false })
  → hidden <video> element
  → requestAnimationFrame loop
  → SelfieSegmentation.send(frame)
  → onResults(mask):
       none  → passthrough (raw frame)
       blur  → CSS blur behind mask
       image → virtual background image behind mask
  → outputCanvas.captureStream(30)
  → RTCPeerConnection.addTrack()
```

Three modes: **None** (raw), **Blur** (Gaussian blur), **Image** (user-supplied
or built-in virtual background).

---

## Hub changes

### AppState additions

```rust
/// channel_id → pubkeys currently with video enabled
pub video_channels: RwLock<HashMap<String, HashSet<String>>>,
```

### New WS client → hub envelopes

```
video_enable   { channel_id }
video_disable  { channel_id }
video_offer    { channel_id, to_pubkey, sdp }
video_answer   { channel_id, to_pubkey, sdp }
video_ice      { channel_id, to_pubkey, candidate }
```

### New WS hub → client envelopes

```
video_participant_enabled   { channel_id, pubkey }           — broadcast
video_participant_disabled  { channel_id, pubkey }           — broadcast
video_participants          { channel_id, pubkeys: [string] } — snapshot on voice join
video_offer_in    { channel_id, from_pubkey, to_pubkey, sdp }    — targeted
video_answer_in   { channel_id, from_pubkey, to_pubkey, sdp }    — targeted
video_ice_in      { channel_id, from_pubkey, to_pubkey, candidate } — targeted
```

### Dispatch rules

- `video_enable`: add to `video_channels`, broadcast `video_participant_enabled`.
- `video_disable`: remove from `video_channels`, broadcast `video_participant_disabled`.
- `video_offer/answer/ice`: relay to `to_pubkey` with `from_pubkey` added.
  Same targeted-pubkey routing as screen-share v2 signals — no new hub logic.
- On `VoiceJoin`: send `video_participants` snapshot so the joiner learns who
  has video on.
- On `leave_voice`: if this pubkey is in `video_channels`, remove it and
  broadcast `video_participant_disabled`.

### New permission

`use_video` — hub admins can restrict webcam to specific roles. Default: any
channel member who is in voice may enable video.

### /info addition

```json
{ "sfu_url": null }
```

Populated from `WAVVON_SFU_URL` env var. `null` = mesh mode (default).

---

## Client implementation

### `useVideo` hook

Manages the full RTCPeerConnection lifecycle.

```typescript
interface PeerEntry {
  conn: RTCPeerConnection;
  stream: MediaStream | null;
}

// state exposed
videoEnabled: boolean          // my webcam is on
processedStream: MediaStream   // after background processing (what we send)
remoteStreams: Map<string, MediaStream>  // pubkey → received stream
activeSpeakers: string[]       // top-3 currently speaking
pinnedPubkey: string | null
backgroundMode: "none" | "blur" | "image"
backgroundImage: string | null
```

**Key rules:**

- When `video_participant_enabled` arrives for pubkey X: if my pubkey is
  lexicographically less than X's, I initiate the offer (prevents both
  sides racing).
- On `video_offer_in`: create answer, send `video_answer`.
- On `voice_participant_speaking { speaking: true }`: update `activeSpeakers`,
  call `setTrackEnabled(pubkey, true/false)` on affected connections.
- On voice leave: send `video_disable`, close all peer connections.

### `VideoGrid` component

```
props:
  streams:    Map<pubkey, { stream, displayName, speaking, pinned }>
  selfStream: MediaStream | null
  selfName:   string
  onPin:      (pubkey) => void
  onUnpin:    () => void
```

**Layouts:**
- 0 streams and video off → hidden, no impact on chat layout
- 1–4 active streams → equal-size grid tiles
- 5+ active → 1 large active-speaker tile + scrollable thumbnail row
- Self-view → small corner overlay, always shown when video on

Each tile: `<video autoPlay playsInline muted={isSelf}>` + name badge +
mute indicator + pin button on hover.

### `BackgroundProcessor` class

Wraps `@mediapipe/selfie_segmentation`. Accepts a raw `MediaStream`, returns
a processed `MediaStream` from `canvas.captureStream(30)`. Compositing runs
in a `requestAnimationFrame` loop; segmentation is async on a WebGL backend.

### Voice controls additions

- **Camera button** (🎥) in the voice bar — toggles video on/off.
- **Background button** (🖼) beside the camera button when video is on —
  opens a small picker (None / Blur / Image).

`VideoGrid` renders in the channel content area when
`remoteStreams.size > 0 || videoEnabled`. The existing voice participant list
is unchanged — video is additive.

---

## lib.rs changes

`WsServerMessage` gains the six new video variants. The WS handler emits a
Tauri event for each:

| WS message | Tauri event |
|---|---|
| `video_participant_enabled` | `video-participant-enabled` |
| `video_participant_disabled` | `video-participant-disabled` |
| `video_participants` | `video-participants` |
| `video_offer_in` | `video-offer-in` |
| `video_answer_in` | `video-answer-in` |
| `video_ice_in` | `video-ice-in` |

Sending is done via the existing `send_hub_ws_raw` Tauri command — no new
commands needed.

---

## Permissions

- Browser `getUserMedia` permission: prompted on first camera enable, cached.
- Hub `use_video` permission: `video_enable` is rejected by the hub if the
  user lacks it.
- Video requires being in voice: hub only accepts `video_enable` from pubkeys
  currently in `voice_channels[channel_id]`.

---

## What's deferred

- **SFU integration** — `sfu_url` hook is designed-in; client switching logic
  is not yet built.
- **Simulcast** (multiple resolution layers for SFU forwarding) — deferred to
  when SFU ships.
- **Video-only mode** (video without joining audio) — deferred; voice
  membership is required for v1.
- **Mobile/Android** — follows after desktop ships.
- **Video recording** — out of scope.
- **Bandwidth adaptation** — always sends one resolution; future work.
