# Voxply Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
shipped features, design questions — lives in the wiki at
[`docs/`](docs/README.md).

## 🔨 Next up

_(nothing queued — see Wishlist for candidates)_

## 🚢 Pre-launch checklist

Work through these in order before shipping. Goal: reach a state where the
only remaining work is polish and responding to user feedback.

### Blockers (must fix before any public release)

- [ ] **Windows code-signing** — CI wired and docs written; cert procurement
  pending (SignPath.io OSS application). Without cert, users still see SmartScreen
  "Windows protected your PC" wall. See [`code-signing.md`](docs/code-signing.md).

- [x] **Fix server panics in games.rs** — replaced ~10 bare `.unwrap()` calls
  on `Mutex::lock()` and `serde_json::to_string()`.
  A poisoned mutex or bad serialization no longer crashes the hub process.

- [ ] **Deploy the demo hub** — flip `DEMO_HUB_URL` constant so "Try a demo
  hub" works. New users downloading the desktop app currently have no quick
  way to experience Voxply without also running a server themselves.

### Server

- [x] **Health-check endpoint** — `GET /health` returning version, uptime, and
  DB status. Now live for ops monitoring and load balancer probes.

- [x] **Rate-limit auth endpoints** — brute-force protection on
  `POST /auth/login` and `/auth/challenge` live.

- [x] **Document game permissions gap** — notice added to admin UI; operators
  now know `set_game_permissions` has no effect yet.

### Client

- [x] **Hub join error messages** — replaced raw error strings with
  user-readable messages.

- [x] **First-run experience** — WelcomeScreen component guides new users
  through identity creation and hub joining.

- [x] **Discovery dead-end** — notice added so hubs know tagging is live but
  global directory is coming soon.

### Discovery

- [x] **Public hub directory (minimal)** — `GET /federation/listing` endpoint +
  HubBrowser client UI + listing toggle in admin panel live.

### Documentation

- [x] **User-facing getting-started guide** — `docs/getting-started.md` live
  with what is Voxply, download link, hub joining, key concepts.

- [x] **Hub operator guide** — `docs/hub-operator-guide.md` live with env vars,
  bootstrap, backup/restore, upgrade path, hardening.

- [x] **Games SDK reference** — `docs/games-sdk.md` live with postMessage API,
  event types, shared-KV, voice zones for third-party developers.

## 🚧 Blocked

- **Demo hub** — code is ready (`DEMO_HUB_URL` constant + conditional button). Blocked on ops: a Voxply-operated hub instance needs to be deployed and the constant flipped to its URL before the "Try a demo hub" button goes live.

## 📌 Wishlist (undesigned)

Things we want to build but haven't committed to a design yet. Designed
items live in the wiki — see
[`future-features.md`](docs/future-features.md),
[`gaming.md`](docs/gaming.md).

### Carry-over

- **Gaming Tier 3** — MMO + persistent shared world; stretch goal.
  Proximity voice is already a general platform primitive; only the
  persistent-world layer is undesigned.

## 🚀 Recently shipped

- **InvitesSection create-invite controls (desktop + android/desktop)** — Max-uses number input and expiry select had no labels; added `aria-label` to both.

- **IdentityBackupSection passphrase/label inputs (all 3 clients with this component)** — Export passphrase, confirm passphrase, backup label, and import passphrase inputs gained `htmlFor`/`id` (desktop) or `aria-label` (web + android/desktop) so screen readers announce the purpose of each credential field.

- **PairingSection device label (desktop)** — "Device label" input lacked `htmlFor`/`id`; fixed to match the android/desktop fix applied earlier.

- **Stable attachment keys (all 4 clients)** — `PendingAttachments` and `MessageAttachments` replaced `key={i}` with `key={a.name}` so removing an attachment doesn't cause React to reuse the wrong DOM node for remaining items.

- **Label/control sweeps — AudioProfileSection, ExternalBotSection (desktop), ForumComposer/HubAdminPage/RecoveryContacts (web), RecoveryContacts/PairingSection (android/desktop), ScreenShareViewer volume (android/web)** — All remaining unlinked form labels gained `htmlFor`/`id` or `aria-label` associations.

- **Label/control association — HubBotsSection, ChannelBansModal, LobbySettingsSection (desktop + android/desktop)** — "Create bot" name input, "Ban a user" user select (+ aria-label on reason input), and "Welcome message" textarea all gained proper `htmlFor`/`id` or `aria-label` associations.

- **Label/control association — FarmSettingsPage (desktop) + ChannelSettingsModal Talk power (desktop + android/desktop)** — Desktop FarmSettingsPage was missing the same `htmlFor`/`id` pairs already fixed on the web; ChannelSettingsModal Talk power number input was unlinked in both desktop and android/desktop.

- **maxLength on form inputs** — Channel name (64), channel description (280), role name (64), poll question (200), and poll options (100) gained `maxLength` constraints in desktop, web, and android/desktop so unbounded input can't reach the server.

- **Label/control association sweep — BotAdminSection, ForumComposer, BotWizard, FarmSettingsPage, AlliancesSection** — Webhook URL input in BotAdminSection (desktop + android/desktop), Title/Body in ForumComposer (desktop + android/desktop), bot display name in BotWizard (desktop + android/desktop), farm name/description/max-per-user/max-total/suspend-reason in FarmSettingsPage (web), and push-target-URL/join-code inputs in AlliancesSection invite tab (desktop + android/desktop) all gained matching `htmlFor`/`id` pairs.

- **Fix identity key no-op after hub add (desktop + android/desktop)** — `if (!publicKey) setPublicKey(null)` was a dead statement that left `publicKey` unset for first-time users who added a hub before identity initialized; replaced with an actual `get_my_public_key` invoke.

- **Remove localhost default from Add Hub URL inputs (web + android/web)** — `hubUrl` state in `App.tsx` and `WelcomeScreen` was initialized to `"http://localhost:3000"`, pre-filling the add-hub form with a development address invisible to end users. Changed to empty string.

- **Admin form label/control association sweep (desktop + android/desktop)** — HubAdminPage (hub name, description, antispam, max depth, discovery fields) and WebhooksSection (channel select, display name, avatar URL) gained `htmlFor`/`id` pairs in both clients.

- **Web form label/control association sweep** — EventComposer (title, description, location, start, end), DndSettingsSection (quiet-hours start/end), and SettingsPage (display name, avatar URL) all gained `htmlFor`/`id` pairs so screen readers announce labels when controls are focused.

- **Settings selects and DND time inputs label association** — Language, microphone, speaker, and media-output `<select>` elements in desktop and android/desktop SettingsPage, plus DND quiet-hours `<input type="time">` in android/desktop DndSection, all gained `id`/`htmlFor` pairs for proper screen-reader label announcement.

- **CertificationsSection label/input linkage + DiscoverPage badge keys** — Number inputs for cert min-age and validity now have `htmlFor`/`id` pairs (web + android/desktop) so screen readers announce the label on focus; DiscoverPage badge list replaced `key={i}` with a stable composite key.

- **Icon-only button accessibility sweep (all clients)** — WhisperPanel close/delete-list, AllianceInvitesSection/AlliancesSection dismiss-error, SortableItems volume-close, ForumPostDetail clear-reply, and GameModal permissions-dismiss buttons all gained `aria-label` + `title`.

- **PollComposer stable option keys (desktop + web)** — `options` state changed from `string[]` to `{id,value}[]` with a `useRef` counter; `key={i}` → `key={opt.id}`, preventing React from clobbering input values when an option is removed from the middle of the list.

- **Stable DM message keys (all 4 clients)** — `id?: string` added to `DmMessage`; all `getDmMessages` mapping sites now pass through the server UUID; `ContentArea` DM renders use `key={m.id ?? \`${m.timestamp}-${m.sender}\`}` instead of the array index, preventing React from reusing stale DOM nodes when messages are deleted.

- **android/voxply-web nav semantics + message list ARIA** — `ChannelSidebar` `<div className="sidebar">` promoted to `<nav aria-label="Channels">`; Settings gear button gains `aria-label`; `ContentArea` messages container gains `role="list" aria-label="Messages"`; each message `<div>` gains `role="listitem"`.

- **GameModal dialog semantics + android/web ContentArea aria-labels** — `GameModal` gains `role="dialog" aria-modal` + `aria-label={game.name}` + `aria-label="Close"` on close button in desktop, web, and android/desktop; android/voxply-web `ContentArea` message-action buttons (Reply, Copy link, Edit, Delete), search button, member-toggle button, and reply-banner close all gain `aria-label` to match their `title` text.

- **Icon-only button aria-label + ScreenSharePicker/GamePicker dialog semantics** — `Attachments` remove button gains `aria-label="Remove"` in all four clients; `Lightbox` close button gains `aria-label="Close"` in desktop and android/desktop; `GamePicker` gains `role="dialog"` + `aria-labelledby` in desktop/web/android-desktop; `ScreenSharePicker` gains `FocusTrap`, Escape handler, `role="dialog"`, and `aria-label="Camera"` on the device select in desktop; android/desktop `ScreenSharePicker` gets the same role and select label.

- **role="dialog" + aria-modal parity across all four clients** — `AddHubModal`, `CreateChannelModal`, `EditDescriptionModal`, `BotWizard`, and `FarmSettingsPage` sub-dialogs across desktop, web, android/desktop, and android/web all gain `role="dialog" aria-modal="true" aria-labelledby`; `BotWizard` also gains `FocusTrap` + Escape handler in both clients that were missing it; `FarmSettingsPage` `SuspendDialog` and `DeleteHubDialog` gain `FocusTrap` in both clients.

- **android/voxply-web full accessibility parity** — `FocusTrap` component created; `AddHubModal` and `ReactionPicker` now trap keyboard focus and close on Escape; `ScreenShareViewer` migrated from single-stream find() to sharerMap grouping by `sharer_pubkey` (multi-sharer support); four focus-ring `box-shadow` gaps fixed (`.recovery-input`, `.user-list-filter input`, `.palette-input`, `.reaction-picker-search`); `App.tsx` gains `assertive` (hub connect/disconnect) and `polite` (voice join/leave) `aria-live` regions.

- **FocusTrap on Android ScreenSharePicker/GameModal/GamePicker + web ReactionPicker; voice announcements wired** — four overlay components were trapping no keyboard focus and ignoring Escape; all now wrap in FocusTrap with Escape handlers. Android `voicePoliteAnnouncement` state (added previous turn) is now populated by `voice-participant-joined` and `voice-participant-left` events so screen readers hear participant changes.

- **Multi-sharer ScreenShareViewer parity + Android aria-live + web PinnedMessagesModal FocusTrap** — web and Android ScreenShareViewer were only rendering the first screen/webcam stream globally; both now group by sharer_pubkey matching desktop. Android App.tsx was missing aria-live regions entirely; added assertive (disconnect/reconnect) and polite (voice) regions. Web PinnedMessagesModal had role="dialog" but no FocusTrap or Escape handler; both added.

- **Accessibility parity sweep (web + Android) + ChannelSidebar landmark fix** — focus-ring `box-shadow` added to `.recovery-input`, `.user-list-filter input`, `.reaction-picker-search`, and `.palette-input:focus-visible` in both web and Android clients (same fix previously applied to desktop); `channel.sidebar.label` i18n key added to all four locales; desktop `ChannelSidebar` `<nav>` was using `member.list.title` ("Members") — now correctly uses `channel.sidebar.label` ("Channels").

- **Per-sharer independent overlay windows + accessibility focus rings** — `ScreenShareOverlay` now renders one independently draggable/resizable floating window per concurrent sharer (composite ref routes `appendChunk`/`stopStream`/`attachStream` by stream_id→pubkey); five input variants (global search, recovery, palette, reaction picker, member filter) that overrode the global `:focus-visible` rule now carry the consistent `box-shadow: 0 0 0 3px var(--ring)` ring on keyboard focus.

- **Markdown rendering, link previews, keyboard shortcuts, code quality** — `MessageContent` migrated to `marked` + `DOMPurify`; `LinkPreviewCard` + `fetch_link_preview` Tauri command + hub `GET /link-preview` endpoint; `@` mention autocomplete, `Alt+↑/↓` unread channel navigation, `Escape` dismiss shortcuts; `useMessages` and `useChannels` extracted from App.tsx (composition root pattern); `tests/common.rs` shared hub test helper; all remaining `unwrap()` in `hub/src` replaced with `?`/`ok_or`; remaining Tauri commands migrated to `Result<T, AppError>`. Ships in hub, desktop, and web.

- **Markdown rendering, link previews, keyboard shortcuts, hook extraction, typed errors** — `MessageContent` migrated to `marked` + `DOMPurify` (allow-listed tags, `rel=noopener noreferrer` on all links); `LinkPreviewCard` + lazy `fetch_link_preview` Tauri command; `@` mention autocomplete in channel composer; `Alt+↑/↓` jumps to next/prev unread channel; `Escape` dismisses context menu / palette / reply target; `useNotificationPrefs`, `useUnreadCounts`, `useTypingIndicators`, `useHubConnections` extracted from App.tsx (tsc clean after each); `AppError` enum added to lib.rs, `send_message`, `edit_message`, `delete_message`, `add_reaction`, `remove_reaction`, `get_messages` migrated to `Result<T, AppError>`.

- **File uploads, message pinning, user profiles, polls, events, notification prefs** — full stack: `POST /channels/:id/upload` multipart endpoint + `RemoteAttachment` wire type; `POST/DELETE /channels/:id/pins` + pinned-message broadcast; `GET /users/:pubkey/profile` server route; poll and event REST endpoints (`polls`, `poll_votes`, `hub_events`, `event_rsvps` tables); per-hub notification preference storage. Desktop and web clients wired end-to-end: `uploadFile` Tauri command, `PinnedMessagesModal`, `UserProfileCard`, `PollCard`/`PollComposer`, `EventCard`/`EventsPanel`/`EventComposer`, `getNotifPref`/`setNotifPref`. WS handler extended for `message_pinned`, `message_unpinned`, `poll_created`, `poll_updated`, `poll_deleted`.

- **Web client feature batch** — file/image upload (`uploadFile` platform call, `RemoteAttachment` type, multipart POST), message pinning (`PinnedMessagesModal`, pin/unpin in message toolbar for admins, 📌 button in channel header), user profile cards (`UserProfileCard` opens on sender name click), native polls (`PollCard` with animated vote bars, `PollComposer` modal), events/calendar (`EventCard`, `EventsPanel`, `EventComposer` modal), per-hub browser notification preferences (`getNotifPref`/`setNotifPref` helpers, settings UI in Notifications tab). WS handler extended for `message_pinned`, `message_unpinned`, `poll_created`, `poll_updated`, `poll_deleted`.

- **Web client chat feature parity** — typing indicators (`typing_start`/`typing_stop` WS events, debounced send, per-channel "X is typing…" display), unread counts (`GET /channels/unread` seeded on hub load, `POST /channels/:id/read` on channel select), and `reactions_updated` WS event handling now wired in the web client. All 7 chat features (WS auto-reconnect, message edit/delete, unread+read, typing, reply-to, invite links, emoji reactions) are now live in the web client.
- **Rate limiting + RateLimiters refactor** — per-user 30 msg/60 s guard on `POST /messages` and DMs; all AppState rate-limit fields consolidated into a `RateLimiters` struct, fixing all 34+ test setups.
- **Admin audit log in desktop React settings** — `HubAuditLogSection` React component added to the desktop settings panel.
- **Web client parity** — SearchBar, WelcomeScreen, SettingsPage (hub settings + user profile), UserContextMenu, and MobileShell added to the web client, closing the highest-priority component gaps.
- **Pre-launch hardening** — server panic fixes (games.rs), `GET /health`, auth
  rate limiting, `GET /federation/listing` hub directory + HubBrowser client UI +
  listing toggle in admin, WelcomeScreen first-run experience, friendlier hub-join
  errors, discovery dead-end notice, game permissions notice, Windows signing CI
  wired, three new docs (getting-started, hub-operator-guide, games-sdk).
- **Cert/badge, game management, discovery Tauri commands** — all remaining
  missing commands wired: `get_cert_settings`, `list_issued_certs`, `save_cert_settings`,
  `issue_cert`, `revoke_cert`, `fetch_my_certs`, `list_badges`, `list_pending_badges`,
  `accept_badge`, `decline_badge`, `remove_badge`, `grant_badge`, `list_admin_games`,
  `fetch_game_manifest`, `install_game`, `uninstall_game`, `set_game_permissions`,
  `set_game_channels`, `game_list_channel_users`, `game_post_message`,
  `game_get_recent_messages`, `game_kv_get`, `game_kv_set`, `get_discovery_settings`,
  `set_discovery_tags`. Hub also gained `GET /admin/settings/certs` and nsfw support
  on `GET/PATCH /admin/settings/tags`.
- **Forum channels** — `forum_list_posts`, `forum_get_post`, `forum_create_post`,
  `forum_create_reply`, `forum_get_post_replies`, `forum_pin_post`, `forum_lock_post`
  Tauri commands wired; hub routes and UI components (`ForumPostList`, `ForumPostDetail`,
  `ForumComposer`) were already complete. Design in [`forum.md`](docs/forum.md).
- **Block / ignore / DND persistence** — `load_ignored_users` / `save_ignored_users` and
  `load_dnd_settings` / `save_dnd_settings` Tauri commands added; App.tsx seeds both
  states from disk on startup. Phase 1+2 client-side block/ignore is now fully persistent.
  Design in [`block-mute-ignore.md`](docs/block-mute-ignore.md).
- **Multi-stream screen share overlay** — floating, draggable, resizable `ScreenShareOverlay`
  replaces the inline viewer; multiple co-op streams tile in a CSS grid. Hub cap removed —
  unlimited concurrent sharers per channel. Design in [`decisions.md`](docs/decisions.md).
- **E2E group DMs** — sender-key scheme (Signal-style); hub endpoints + Tauri commands +
  desktop client all complete. Design in [`e2e-encryption.md`](docs/e2e-encryption.md).

- **Whisper UI** — `useWhisper` hook with inbound event tracking and
  list persistence. `WhisperPanel` in the voice bar with User/Channel/Saved
  Lists tabs, target checkboxes, one-click activate, save-as-list form.
  Inbound whisper badge on participant rows in the channel sidebar.
  Design in [`whisper.md`](docs/whisper.md).
- **Hub server operations** — backup/restore CLI, data retention sweep,
  Prometheus `/metrics`, hub key rotation (`voxply-hub rotate-key` +
  `GET /key-rotation`). Design in [`hub-operations.md`](docs/hub-operations.md).
- **Hub admin tooling** — web admin panel at `/admin/panel` (token-gated,
  embedded HTML), `voxply-hub admin` CLI subcommands, farm heartbeat +
  fleet console. Design in [`hub-admin-panel.md`](docs/hub-admin-panel.md).
- **Hub moderation enhancements** — federated ban lists (`GET /federation/banlist`,
  6h background sync), auto-mod webhook (500ms, fail-open, HMAC-SHA256),
  content reporting (`POST /messages/:id/report`, admin review queue).
  Design in [`moderation-enhancements.md`](docs/moderation-enhancements.md).
- **Discovery: full suite** — hub uptime tracking, global search, farm
  browsing catalog, anonymous aggregate analytics, hub config template
  catalog, hub creation wizard (`/new`). Design in
  [`discovery-v2.md`](docs/discovery-v2.md) and
  [`hub-creation-wizard.md`](docs/hub-creation-wizard.md).
- **Hub first-run bootstrap** — `VOXPLY_TEMPLATE_URL` / `VOXPLY_BOOTSTRAP_TOKEN`
  on empty-DB first launch; applies channels, roles, hub name from template.
  Design in [`hub-creation-wizard.md`](docs/hub-creation-wizard.md).
- **Client quality-of-life** — global message search (FTS5), message drafts,
  custom emojis per hub, events/calendar (`EventCard`, `EventsPanel`),
  native polls (`PollCard`, live bars), thread collapse/expand, notification
  grouping (3s per-hub debounce). Design in [`client-qol.md`](docs/client-qol.md).
- **Events / calendar** — `hub_events` + `event_rsvps` tables, full REST,
  `EventCard`, `EventsPanel`, Tauri commands. Design in [`client-qol.md`](docs/client-qol.md).
- **Native polls** — `polls` + `poll_votes`, live broadcast, `PollCard`,
  Tauri command. Design in [`client-qol.md`](docs/client-qol.md).
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

- **Windows installer unsigned** — users see SmartScreen "Windows protected your PC" warning; workaround: "More info → Run anyway". Permanent fix once EV cert is procured (see code-signing.md).

## 💤 Won't do

- **Load-aware DM routing across a user's hubs** — failover only; load-balancing needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable cross-platform; live meter covers it
