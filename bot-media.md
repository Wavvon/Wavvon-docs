# Bot media capabilities

Bots that can push audio and video into Wavvon channels, enabling
music playback, karaoke backing tracks, dance-move reference streams,
and similar experiences — without adding media logic to the hub.

Companion to [`bot-mini-apps.md`](docs/bot-mini-apps.md). Mini-apps
handle the interactive UI layer; bot media handles the AV layer.

## Motivation

The reference use case is a Just Dance party:

- A **voice bot** pushes the music track as Opus frames → everyone in
  the voice channel hears it
- A **video bot** streams a reference dancer as screen-share frames →
  everyone sees the moves in the screen-share viewer
- A **mini-app** overlays score, countdown, and combo streak
- The mini-app optionally accesses the device camera for real-time
  pose-detection scoring (opt-in, operator-gated)

Each capability is independently useful: voice bots alone cover music
bots and karaoke backing tracks; video bots alone cover live demo
streams and lecture recordings; camera access alone covers any
mini-app that wants pose, gesture, or face data.

## Voice bots

### How it works

The hub already has a `/voice/ws` WebSocket endpoint (built for web
clients) that accepts binary Opus frames in the wire format:

```
upload:   [seq:u16 BE][ts:u32 BE][opus payload]
download: [sender_id:u16 BE][packet_type:u8][seq:u16 BE][ts:u32 BE][opus payload]
```

A voice bot joins this path and pushes frames exactly like a web
client. The hub fans the frames out to all UDP (desktop/android) and
WS (web) participants in the channel. No new relay logic is needed.

### New auth path

Today `/voice/ws` authenticates with a user session token + channel
ID. Bots need a parallel path:

1. Bot calls `POST /bots/{id}/voice/join` with `{ "channel_id": "…" }`.
2. Hub verifies the bot's keypair signature, checks the bot is
   registered on this hub, and returns a short-lived voice token.
3. Bot opens `/voice/ws?token=<voice-token>` and begins sending frames.
4. Hub registers the bot as a voice participant (visible in
   `GET /voice/participants` and in `voice_participant_joined` WS
   events) with a display name from the bot's registration.
5. Bot calls `DELETE /bots/{id}/voice/leave` (or closes the WS) to
   leave; hub removes it from the participant list.

The VXRG UDP register flow is skipped for bots — they always use the
WS path.

### Bot perspective

```
POST /bots/{id}/voice/join  { channel_id }
  → { voice_token, voice_ws_url }

ws = new WebSocket(voice_ws_url)
ws.binaryType = "arraybuffer"

// send 20ms Opus frames at 48 kHz
const frame = encodeOpus(pcmBuffer)  // 960 samples
const packet = new Uint8Array(6 + frame.length)
new DataView(packet.buffer).setUint16(0, seq++)
new DataView(packet.buffer).setUint32(2, ts)
packet.set(frame, 6)
ws.send(packet)
ts += 960
```

The bot is responsible for encoding audio to Opus at 48 kHz mono or
stereo. Existing libraries: `opusscript` (WASM, same as the web
client), `audiopus` (Rust), `pyogg` (Python).

### Karaoke / music bot pattern

```
1. User types !play <song> in chat
2. Bot fetches/decodes the audio track to raw PCM
3. Bot joins voice channel via POST /bots/{id}/voice/join
4. Bot streams Opus frames over /voice/ws at real-time pace
5. If mini-app is active, bot broadcasts { type: "track_position_ms", ms }
   every 500ms so the mini-app can sync lyrics
6. User types !skip → bot calls DELETE /bots/{id}/voice/leave, moves queue
```

## Video bots

### How it works

The hub already has a screen-share relay: clients send binary chunk
envelopes and the hub fans them to channel subscribers. A video bot
uses the same path to push pre-encoded video frames (JPEG, WebP, or
a simple proprietary format) as if it were sharing its screen.

### New auth path

Mirrors the voice bot path:

1. Bot calls `POST /bots/{id}/screenshare/start` with `{ "channel_id": "…" }`.
2. Hub returns a `stream_token` and adds the bot to `hub_streams`.
3. Bot sends binary chunk envelopes over `/ws` (authenticated as the
   bot) in the existing screen-share wire format.
4. Clients receive `stream_subscribed` and render in `ScreenShareViewer`
   — no client changes needed.
5. Bot calls `DELETE /bots/{id}/screenshare/stop` to end the stream.

### Just Dance reference stream

The video bot decodes a reference dancer video file frame-by-frame and
pushes JPEG chunks at ~30 fps. The mini-app does not need to handle
video at all — participants see the reference dancer in the existing
screen-share viewer, and the mini-app overlays score/UI on top.

```
ffmpeg -i dancer.mp4 -vf fps=30 -q:v 5 frames/%04d.jpg

for frame in frames:
    chunk = build_screen_share_chunk(jpeg_bytes, seq, channel_id)
    ws.send(chunk)
    sleep(1/30)
```

Frame rate target: 30 fps for dance, 15 fps acceptable for slower
content. Encoding budget is the bot operator's concern.

### Limitations

- Video bots share the screen-share viewer with real screen shares.
  If a human also shares their screen in the same channel the client
  shows both; UX is workable but not designed for it.
- There is no audio track in the screen-share relay; the voice bot
  handles audio separately.
- Large JPEG streams at 30 fps can saturate upload bandwidth on a
  resource-constrained VPS. Bot operators should benchmark.

## Mini-app camera access

Mini-apps run in a sandboxed webview. By default the sandbox blocks
camera access. To enable it for pose detection, scoring, or any
camera-driven feature:

### Desktop / Android (Tauri WebviewWindow)

Add `permissions: ["camera"]` to the `WebviewWindowBuilder` config.
The OS will prompt the user once for camera permission scoped to the
Wavvon process.

### Web (sandboxed iframe)

Add `allow-camera` to the iframe's `sandbox` attribute and
`camera 'self'` to the CSP `permissions-policy`. The browser prompts
the user when the mini-app calls `getUserMedia`.

### Operator gate

Bots declare camera requirements in their registration:

```json
{ "requires_camera": true }
```

Hub operators can restrict camera-capable bots via `hub.toml`:

```toml
[bots]
allow_camera = true   # default false; opt-in per hub
```

When `allow_camera = false`, the hub strips the camera permission from
the `bot_app_open` message and the client does not grant it.

### Just Dance scoring

```js
// inside the mini-app
const stream = await navigator.mediaDevices.getUserMedia({ video: true })
const detector = await poseDetection.createDetector(
  poseDetection.SupportedModels.MoveNet
)
// compare detected keypoints to reference pose broadcast by bot
// { type: "reference_pose", keypoints: [...] }
```

All ML inference runs client-side in the mini-app (TensorFlow.js /
MediaPipe). No video data leaves the device. The bot receives only the
score delta the mini-app chooses to report.

## What we are not doing

- **Hub audio mixing** — the hub does not mix multiple voice bot
  streams with participant audio. Mixing is a client-side concern
  (already handled by the WebAudio API for web clients, and by the
  Opus decoder + mixer in desktop/android clients).
- **Hub video transcoding** — the hub relays screen-share chunks
  opaquely. Resolution, frame rate, and codec are the bot's choice.
- **Bot-to-bot AV relay** — bots communicate via channel messages, not
  direct AV streams.
- **DRM or content protection** — bots are responsible for having the
  right to stream the content they push.

## Open questions

- **Voice bot participant display** — should voice bot participants
  show in the voice roster with a bot badge? Probably yes; needs a
  `is_bot` flag in `voice_participant_joined`.
- **Multiple voice bots in one channel** — hub mixes all voice streams
  already; this should work transparently but needs a test.
- **Stream ownership in screen-share** — when a video bot holds a
  stream slot and a human tries to share their screen, who wins? Need
  a capacity or priority model.
- **Frame format standardisation** — JPEG chunks work today but a
  defined container (sequence number, timestamp, dimensions) would let
  clients render more cleanly. Deferred until there's a second
  implementor.

## Estimate

Voice bot auth path (`POST /bots/{id}/voice/join`, token minting,
participant registration): ~1.5 days.
Video bot auth path (`POST /bots/{id}/screenshare/start`, stream
registration): ~1 day.
Mini-app camera permission plumbing (all three clients + operator
gate): ~1 day.
Docs + reference bot examples (music bot, Just Dance skeleton): ~1 day.

**Total: ~4.5 days** (on top of the ~6 days for mini-apps, which are
a prerequisite for the camera and mini-app overlay pieces).
