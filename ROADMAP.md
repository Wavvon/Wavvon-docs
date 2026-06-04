# Voxply Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
shipped features, design questions — lives in the wiki at
[`docs/`](docs/README.md).

## 🔨 Next up

_(nothing — all pre-launch blockers are resolved)_

## 🚧 Blocked

- **Demo hub** — code is ready (`DEMO_HUB_URL` constant + conditional button). Blocked on ops: a Voxply-operated hub instance needs to be deployed and the constant flipped to its URL before the "Try a demo hub" button goes live.

## 📌 Wishlist (undesigned)

Things we want to build but haven't committed to a design yet. Designed
items live in the wiki — see
[`future-features.md`](docs/future-features.md),
[`gaming.md`](docs/gaming.md).

### Carry-over

- **E2E group DMs** — Signal-style sender-key scheme (v2 of
  e2e-encryption.md); blocks until 1:1 E2E is proven stable in production.
- **Gaming Tier 3** — MMO + persistent shared world; stretch goal.
  Proximity voice is already a general platform primitive; only the
  persistent-world layer is undesigned.

## 🧭 Designed, not started

- **Hub server operations** — backup & restore, data retention policy,
  Prometheus `/metrics` endpoint, hub key rotation ceremony. Design in
  [`hub-operations.md`](docs/hub-operations.md).
- **Hub admin tooling** — web admin panel at `{hub-url}/admin`, admin CLI
  (`voxply-hub admin ...`), farm console (multi-hub management). Design in
  [`hub-admin-panel.md`](docs/hub-admin-panel.md).
- **Discovery enhancements** — hub uptime tracking (server-side `/info`
  probing), farm browsing (separate catalog + `/farms` page), global
  search (`/api/search` fan-out across catalogs), anonymous aggregate
  analytics (catalog-only counts, registered vs. active hubs). Design in
  [`discovery-v2.md`](docs/discovery-v2.md).
- **Hub creation from discovery** — signed config templates catalog
  (`/api/templates`, author self-submission), hub first-run bootstrap from
  `VOXPLY_TEMPLATE_URL` / bootstrap token, web creation wizard at
  `discovery.voxply.app/new`. Design in
  [`hub-creation-wizard.md`](docs/hub-creation-wizard.md).
- **Hub moderation enhancements** — federated ban lists (signed, opt-in
  per source), auto-moderation webhook (fail-open, circuit-breaker), and
  content reporting (hub-local admin queue). Design in
  [`moderation-enhancements.md`](docs/moderation-enhancements.md).
- **Client quality-of-life** — global message search (hub FTS5 fan-out),
  message drafts (localStorage), custom emojis (per-hub inline-base64
  library), events/calendar (native type + RSVP), polls (hub-tallied,
  live WS totals), thread collapse/expand + jump-to-thread, and OS
  notification grouping (per-hub debounce). Design in
  [`client-qol.md`](docs/client-qol.md).

## 🚀 Recently shipped

- **Video in voice channels** — WebRTC mesh, active-speaker management
  (top-3, 3s linger), `VideoGrid` (equal grid ≤4, active-speaker+thumbnails
  5+, self-view overlay), `BackgroundProcessor` (MediaPipe none/blur/image),
  camera toggle + background picker in voice bar, hub signaling envelopes.
  Scale: mesh works up to ~20; SFU hook designed-in for large events.
  Design in [`video-voice.md`](docs/video-voice.md).
- **Voice advanced settings** — Standard / Music / Custom audio quality
  profiles. `EffectiveVoiceConfig` resolved at pipeline start; Denoiser
  bypass; VAD gate per-profile; custom Opus bitrate, app mode, channels,
  frame size, complexity. Settings persisted to `voice.json`.
  Design in [`voice-advanced-settings.md`](docs/voice-advanced-settings.md).
- **Windows Authenticode signing** — CI signing wired in `release.yml`;
  activates once `WINDOWS_CERT_THUMBPRINT` secret is set (cert
  procurement via SignPath.io OSS tier still pending).
- **Missions system** — API routes in Voxply-discovery, Missions panel +
  PoW claim flow in desktop, spark balance + cosmetic catalog with
  entitlement blobs. Design in [`missions.md`](docs/missions.md).
- **Per-participant voice volume** — `sender_id` in UDP fan-out,
  per-sender gain pipeline, volume slider in channel sidebar, persistence
  to `voice_gains.json`. Design in [`voice-volume.md`](docs/voice-volume.md).
- **Proximity voice** — voice zones in hub (WS protocol, in-memory state,
  `manage_voice` permission), client-side attenuation (4 models), game SDK
  calls (`voxply:createVoiceZone`, `voxply:setVoicePosition`). Design in
  [`proximity-voice.md`](docs/proximity-voice.md).
- **Gaming Tier 2 client SDK** — `voxply:game:ready/start/send/end/
  snapshot/sharedKvGet|Set/setJoinPolicy` postMessage calls, incoming
  event delivery to iframe, Activities live-session badge, session
  create/join/leave Tauri commands. Full Tier 2 now complete.

## ⚠️ Known issues

- **Group DMs are plaintext** — hub operator can read group DM content; 1:1 DMs are E2E encrypted. Warning shown before entering group DMs. E2E group DMs (sender-key scheme) are in the wishlist.
- **Windows installer unsigned** — users see SmartScreen "Windows protected your PC" warning; workaround: "More info → Run anyway". Permanent fix once EV cert is procured (see code-signing.md).

## 💤 Won't do

- **Load-aware DM routing across a user's hubs** — failover only; load-balancing needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable cross-platform; live meter covers it
