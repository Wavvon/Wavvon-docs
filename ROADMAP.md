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

### Hub / server operations

- **Hub backup & restore** — `voxply-hub backup` exports DB + identity +
  settings to a portable archive; `restore` replays on a new machine.
  Essential for self-hosters migrating or recovering hardware.
- **Data retention policy** — per-channel setting to auto-delete messages
  older than N days. Nightly SQLite job; no protocol change.
- **Prometheus `/metrics` endpoint** — online users, messages/min, voice
  sessions, federation lag, storage used. Stub already hinted in codebase.
- **Hub key rotation** — signed rotation ceremony: old key signs new key +
  a transition period so federation trust is preserved across the change.

### Hub moderation & safety

- **Federated ban lists** — hub admins subscribe to a shared blocklist
  from a trusted hub or curated source. Opt-in, signed with the same
  Ed25519 primitive as badges.
- **Auto-moderation webhook** — hub POSTs each message to an external URL
  before storing; service returns allow/block. Same dispatch shape as bot
  slash commands.
- **Content reporting** — `POST /messages/:id/report` → lands in an admin
  moderation queue; reporter and reason stored; admin reviews and acts.

### Admin tooling

- **Hub web admin panel** — standalone page at `{hub-url}/admin` gated by
  admin token (no keypair needed). Real-time stats, user management table,
  channel manager, audit log viewer, bot/webhook management, federation
  status, backup/restore triggers. Usable without the desktop client.
- **Hub admin CLI** — subcommands on the existing binary:
  `voxply-hub admin stats | users | channels | backup | restore | tokens`.
  Operates directly on the local DB for server operators.
- **Farm console** — single pane of glass across all hubs on a farm:
  aggregate member counts, cross-hub ban propagation, resource allocation
  per hub, global audit log.

### Hub creation from discovery

- **Hub config templates** — signed JSON blobs in Voxply-discovery
  (`GET /templates`, author self-submission). Template specifies initial
  channels, roles, settings, welcome message, suggested bots. Same
  signed-listing primitive as games and bots.
- **Hub first-run bootstrap** — on first launch with no DB, hub reads
  `VOXPLY_TEMPLATE_URL` env var, fetches + validates the template, applies
  it, then auto-registers with discovery. Zero extra commands for the
  operator.
- **Hub creation wizard on discovery** — multi-step flow at
  `discovery.voxply.app/new`: pick template → customise → deploy via
  managed farm (one click), Docker (pre-filled command), or binary.
  Generates a signed 24-hour bootstrap token the hub redeems on first
  launch.

### Discovery enhancements

- **Hub uptime tracking** — discovery pings registered hubs periodically
  and shows uptime history on each hub's listing.
- **Farm browsing** — dedicated tab: browse available managed farms,
  pricing tiers, open capacity, and the farm's join flow.
- **Global search** — find hubs, bots, games, and templates from one
  search box across all discovery catalog types.
- **Anonymous aggregate analytics** — total hubs listed, approximate
  active user counts, most popular tags. Counts only, no user-level data.

### Client quality-of-life

- **Global message search** — search across all connected hubs. Hub-side
  FTS5 is already in place for forum channels; extend to regular channels.
- **Message drafts** — save unsent message per channel, persisted across
  restarts.
- **Custom emojis** — per-hub emoji library, hub admin uploads; members
  react and use in messages.
- **Events / calendar** — scheduled events with title, time, description,
  RSVP. Shows in channel sidebar; sends a notification at event start.
  Natural companion to proximity voice for concerts and meetups.
- **Polls** — native `POST /channels/:id/polls` route + voting UI; no
  bot dependency.
- **Thread view improvements** — collapse/expand threads inline, "jump to
  thread" from anywhere in the message list.
- **Notification grouping** — batch OS notifications by hub when many
  arrive quickly; single notification per hub with message count.

### Carry-over

- **E2E group DMs** — Signal-style sender-key scheme (v2 of
  e2e-encryption.md); blocks until 1:1 E2E is proven stable in production.
- **Gaming Tier 3** — MMO + persistent shared world; stretch goal.
  Proximity voice is already a general platform primitive; only the
  persistent-world layer is undesigned.

## 🧭 Designed, not started

_(nothing pending)_

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
