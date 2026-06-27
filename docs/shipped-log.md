# Shipped log

Full historical record of shipped work, moved out of [ROADMAP.md](../ROADMAP.md)
to keep the roadmap slim. Newest entries first. Forward-looking work lives in
the roadmap; design rationale lives in [decisions.md](decisions.md).

## Entries

- **Forum per-post read cursors (all 4 clients)** — `post_reads` table, `INSERT OR REPLACE` mark-read endpoint (`POST /channels/:cid/posts/:id/read`), `unread_reply_count` subquery on list/get; unread dot + count shown per thread row in all 4 clients. Design in [`forum.md`](forum.md).

- **Custom skins discovery gallery (all 4 clients)** — `skins` table in Wavvon-discovery with Ed25519 signature verification and SHA-256 content-addressed IDs; `GET /api/skins` (search/paginate) + `POST` (publish) + `DELETE` (author-signed removal); `SkinsGallery` component with search, base filter, and "Load more" in the Appearance tab of all 4 clients. Design in [`custom-themes.md`](custom-themes.md).

- **Database abstraction layer** — `wavvon-store` supertrait crate + `wavvon-store-sqlite` impl; `StoreError` enum mapping to HTTP codes; `AppState` gains `store: Arc<dyn HubStore>` alongside existing `db: SqlitePool` for incremental migration. Design in [`store-trait-design.md`](store-trait-design.md).

- **Custom user skins (all 4 clients)** — Fifth "Custom" slot in the theme picker. `skinValidation.ts` (token allow-list, forbidden-substring guard, `validateSkin`, `applySkinTokens/clearSkinTokens`, export/import helpers) shared across all clients. `SkinEditor` component: name field, base-theme selector, token groups (Surfaces / Text / Accent / Status / Border & Effects / Shadows / Radius), live preview via `setProperty`, per-token reset, Reset all, Export `.wavvonskin`, Import with validation. Desktop and android/wavvon-desktop persist via `load_appearance`/`save_appearance` Tauri commands (`~/.wavvon/appearance.json`); web and android/wavvon-web via `localStorage` key `wavvon:appearance`. Design in [`custom-themes.md`](custom-themes.md).

- **Block/ignore settings panel + DM-block server sync** — `BlockIgnoreSection` wired into all 4 clients (desktop, web, android/wavvon-web, android/wavvon-desktop); `toggleBlockUser` calls `PUT /identity/dm-blocks` on the active hub in all 4 clients so the server enforces DM blocking. Design in [`block-mute-ignore.md`](block-mute-ignore.md).

- **android/wavvon-desktop recovery contacts parity** — six Tauri commands (`list_recovery_contacts`, `set_recovery_contacts`, `remove_recovery_contact`, `list_admin_recovery_requests`, `approve_recovery_request`, `deny_recovery_request`) added to lib.rs with proper bearer auth; `RecoveryContactsSection.tsx` rewritten to use `invoke()` with correct field names (`pubkey`/`added_at`); workspace Cargo.toml fixed (added `wavvon-desktop/src-tauri` member, missing deps); `VoiceSettings` initializers updated for new audio profile fields.

- **android/wavvon-web recovery contacts parity** — `platform/commands/hubAdmin.ts` (recovery contact CRUD + admin queue commands), `RecoveryContactsSection.tsx` (contact list editor, K-of-N threshold, collapsible how-it-works guide, admin rotation-request queue with approve/deny), wired into `SettingsPage.tsx` Account tab alongside `IdentityBackupSection`. Types match actual server field names (`pubkey`/`added_at`).

- **E2E group DM member management** — hub `POST /conversations/:id/members` (add) and `DELETE /conversations/:id/members/:pubkey` (self-leave) routes; `DmEvent::MemberChanged` and `WsServerMessage::DmMemberChanged` wire the event to WS subscribers; `rotate_group_sender_key` Tauri command generates a fresh chain key (bumped version) for the remaining membership set; App.tsx handles `dm-member-changed` by refreshing conversations, deselecting if removed, and triggering key rotation.

- **Identity backup for android/wavvon-web** — `IdentityBackupSection` component (PBKDF2-SHA256 100k iterations + AES-256-GCM via `crypto.subtle`, same format as the web client) added to the Account tab of `SettingsPage`. Reads/writes the IndexedDB `IdentityRecord`; cross-client backup files are interchangeable between the web and android/wavvon-web clients.

- **Gaming Tier 1 capabilities enforcement** — hub `PUT /admin/games/:id/permissions` stores capability grants; `GET /admin/games` returns them; desktop `list_admin_games` and `set_game_permissions` Tauri commands wired end-to-end; admin UI in all four clients shows live capability toggles and explains their effect; `GameModal` enforces grants via `hasCapability()` before calling `game_post_message`, `game_get_recent_messages`, or `game_list_channel_users`.

- **Android multi-device pairing UI** — full device-pairing flow for android/wavvon-web: `identity/master.ts` (HKDF-SHA256 master key derivation matching the Rust crate), `identity/wire.ts` (wire format helpers byte-identical to Rust signing_bytes), `platform/commands/pairing.ts` (all eight pairing commands — getPairedIdentity, startPairingOffer, pollPairingStatus, completePairing, fingerprintPubkey, parsePairingOffer, claimPairingOffer, savePairedIdentity), `PairingSection.tsx` (E-side and N-side flows), `SettingsPage.tsx` full-screen overlay (Profile / Account / Appearance / Devices tabs). Gear button in ChannelSidebar now opens settings.

- **Unified screen-share modal (desktop)** — `ScreenSharePicker` replaced by `ScreenShareModal`; new `list_capture_sources` Tauri command (xcap + image + base64) enumerates monitors and application windows with 160×90 PNG thumbnails; modal shows Screens/Windows tab strip, thumbnail grid with selection ring, and audio/webcam settings section; `useScreenShare` passes `chromeMediaSourceId` to `getDisplayMedia` to bypass the OS picker entirely. Design in [`screen-share-modal.md`](screen-share-modal.md).

- **Banner channel upload seamless flow** — `POST /channels/:channel_id/upload` now returns `{"id": ...}` in the response; new `patch_channel_banner_file` Tauri command PATCHes `banner_file_id` onto the channel; `CreateChannelModal` accepts a `File` prop and `App.tsx` orchestrates the 3-step flow (create channel → upload file → patch banner_file_id) without any extra steps from the user.

- **Farm hub_spawned tracking fix** — farm's `handle_agent_socket` now parses `hub_spawned` messages from connected server agents and writes `process_port` + `server_id` to the `hubs` table; clears both on `hub_stopped`. `ServerEntry` includes `running_hub_count` so the fleet console shows live hub counts per server.

- **Android client QoL — global search, drafts, thread view, custom emoji picker** — `SearchBar` component (Ctrl+K shortcut) wired into android/wavvon-web `App.tsx`; `drafts.ts` utility ported and connected (load on channel switch, save on input change, clear on send); `EmojiPicker` loads hub custom emojis via `hubFetch("/emojis")`; `ContentArea` gains `expandedThreads`/`threadReplies` with localStorage persistence and inline reply rendering; `SortableChannelItem` renders draft badge; `reply_count` added to `Message` type.

- **Web client: message drafts, thread view, custom emoji picker** — `drafts.ts` utility ported verbatim from desktop; web `App.tsx` loads draft on channel switch, saves on input change, clears on send; `SortableChannelItem` gains `activeHubId` prop and renders the `channel-draft-badge`; `ContentArea` gains `expandedThreads`/`threadReplies` state with per-channel localStorage persistence, `toggleThread` fetches replies via `hubFetch`; `EmojiPicker` component created loading hub emojis from `hubFetch("/emojis")`, wired into the channel composer toolbar; `reply_count` added to `Message` type.

- **Admin panel auth — desktop + farm complete** — Farm crate now has
  `POST /farm/admin/totp/setup`, `/confirm`, `/disable` endpoints plus TOTP
  verification on admin login. Server agent binary (wavvon-server crate)
  reverse-connects via WebSocket to farm, manages hub processes on remote nodes.
  Farm hub routing delegates `create_hub` to connected agent if available,
  else local spawn. Desktop FarmSettingsPage gains two tabs: Servers (register
  form, one-time token display, agent list with status/last-seen) and Security
  (TOTP setup/confirm/disable). Hub server side (from prior session) already had
  8 endpoints, 3 new DB tables, session cookies, role-gating, and login HTML.
  Design in [`admin-panel-auth.md`](admin-panel-auth.md).
  *Superseded: hub web admin panel removed — see [decisions.md](decisions.md)
  ("Hub admin panel removed"). The farm-side pieces (server agent, TOTP on the
  farm console) remain.*

- **TOML config files for hub and farm** — `hub.toml` / `farm.toml` next to the binary replace scattered env vars. Load order: defaults → config file → `WAVVON_*` env vars (highest priority). `hub.toml.example` and `farm.toml.example` document every option. Hub operator guide updated.

- **Predictable hub ownership** — removed "first user to connect becomes admin" behaviour. Server operators now set the owner explicitly via `wavvon-hub admin users set-owner <pubkey>` (CLI) or through the web admin panel at `/admin/panel` → Ownership tab. The web panel gained a new Ownership section with a pubkey form. `GET/POST /admin/owner` endpoints added, protected by the existing web admin token.
  *Superseded: the `/admin/panel` web panel was removed — see [decisions.md](decisions.md). Ownership is now set at hub-creation time through the client wizard, or via the CLI.*

- **Android CI fully fixed** — workflow had been failing on every push since the repo was created; root causes: `tags:` indentation error (YAML treated it as an event, not a push filter), stale lockfiles in wavvon-desktop + wavvon-web, npm version mismatch requiring `npm install` over `npm ci`, missing `@tauri-apps/cli` + `tauri` script, `gen/android/` never initialised (`tauri android init` added to CI), and `intl-messageformat` peer dep not being installed. All fixed; CI now builds signed APKs on every push to main.

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

- **android/wavvon-web nav semantics + message list ARIA** — `ChannelSidebar` `<div className="sidebar">` promoted to `<nav aria-label="Channels">`; Settings gear button gains `aria-label`; `ContentArea` messages container gains `role="list" aria-label="Messages"`; each message `<div>` gains `role="listitem"`.

- **GameModal dialog semantics + android/web ContentArea aria-labels** — `GameModal` gains `role="dialog" aria-modal` + `aria-label={game.name}` + `aria-label="Close"` on close button in desktop, web, and android/desktop; android/wavvon-web `ContentArea` message-action buttons (Reply, Copy link, Edit, Delete), search button, member-toggle button, and reply-banner close all gain `aria-label` to match their `title` text.

- **Icon-only button aria-label + ScreenSharePicker/GamePicker dialog semantics** — `Attachments` remove button gains `aria-label="Remove"` in all four clients; `Lightbox` close button gains `aria-label="Close"` in desktop and android/desktop; `GamePicker` gains `role="dialog"` + `aria-labelledby` in desktop/web/android-desktop; `ScreenSharePicker` gains `FocusTrap`, Escape handler, `role="dialog"`, and `aria-label="Camera"` on the device select in desktop; android/desktop `ScreenSharePicker` gets the same role and select label.

- **role="dialog" + aria-modal parity across all four clients** — `AddHubModal`, `CreateChannelModal`, `EditDescriptionModal`, `BotWizard`, and `FarmSettingsPage` sub-dialogs across desktop, web, android/desktop, and android/web all gain `role="dialog" aria-modal="true" aria-labelledby`; `BotWizard` also gains `FocusTrap` + Escape handler in both clients that were missing it; `FarmSettingsPage` `SuspendDialog` and `DeleteHubDialog` gain `FocusTrap` in both clients.

- **android/wavvon-web full accessibility parity** — `FocusTrap` component created; `AddHubModal` and `ReactionPicker` now trap keyboard focus and close on Escape; `ScreenShareViewer` migrated from single-stream find() to sharerMap grouping by `sharer_pubkey` (multi-sharer support); four focus-ring `box-shadow` gaps fixed (`.recovery-input`, `.user-list-filter input`, `.palette-input`, `.reaction-picker-search`); `App.tsx` gains `assertive` (hub connect/disconnect) and `polite` (voice join/leave) `aria-live` regions.

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
  `ForumComposer`) were already complete. Design in [`forum.md`](forum.md).
- **Block / ignore / DND persistence** — `load_ignored_users` / `save_ignored_users` and
  `load_dnd_settings` / `save_dnd_settings` Tauri commands added; App.tsx seeds both
  states from disk on startup. Phase 1+2 client-side block/ignore is now fully persistent.
  Design in [`block-mute-ignore.md`](block-mute-ignore.md).
- **Multi-stream screen share overlay** — floating, draggable, resizable `ScreenShareOverlay`
  replaces the inline viewer; multiple co-op streams tile in a CSS grid. Hub cap removed —
  unlimited concurrent sharers per channel. Design in [`decisions.md`](decisions.md).
- **E2E group DMs** — sender-key scheme; hub endpoints + Tauri commands +
  desktop client all complete. Design in [`e2e-encryption.md`](e2e-encryption.md).

- **Whisper UI** — `useWhisper` hook with inbound event tracking and
  list persistence. `WhisperPanel` in the voice bar with User/Channel/Saved
  Lists tabs, target checkboxes, one-click activate, save-as-list form.
  Inbound whisper badge on participant rows in the channel sidebar.
  Design in [`whisper.md`](whisper.md).
- **Hub server operations** — backup/restore CLI, data retention sweep,
  Prometheus `/metrics`, hub key rotation (`wavvon-hub rotate-key` +
  `GET /key-rotation`). Design in [`hub-operations.md`](hub-operations.md).
- **Hub admin tooling** — web admin panel at `/admin/panel` (token-gated,
  embedded HTML), `wavvon-hub admin` CLI subcommands, farm heartbeat +
  fleet console. Design in [`hub-admin-panel.md`](hub-admin-panel.md).
  *Superseded: the `/admin/panel` web panel was removed — see [decisions.md](decisions.md)
  ("Hub admin panel removed"). The admin CLI and farm console remain.*
- **Hub moderation enhancements** — federated ban lists (`GET /federation/banlist`,
  6h background sync), auto-mod webhook (500ms, fail-open, HMAC-SHA256),
  content reporting (`POST /messages/:id/report`, admin review queue).
  Design in [`moderation-enhancements.md`](moderation-enhancements.md).
- **Discovery: full suite** — hub uptime tracking, global search, farm
  browsing catalog, anonymous aggregate analytics, hub config template
  catalog, hub creation wizard (`/new`). Design in
  [`discovery-v2.md`](discovery-v2.md) and
  [`hub-creation-wizard.md`](hub-creation-wizard.md).
- **Hub first-run bootstrap** — `WAVVON_TEMPLATE_URL` / `WAVVON_BOOTSTRAP_TOKEN`
  on empty-DB first launch; applies channels, roles, hub name from template.
  Design in [`hub-creation-wizard.md`](hub-creation-wizard.md).
- **Client quality-of-life** — global message search (FTS5), message drafts,
  custom emojis per hub, events/calendar (`EventCard`, `EventsPanel`),
  native polls (`PollCard`, live bars), thread collapse/expand, notification
  grouping (3s per-hub debounce). Design in [`client-qol.md`](client-qol.md).
- **Events / calendar** — `hub_events` + `event_rsvps` tables, full REST,
  `EventCard`, `EventsPanel`, Tauri commands. Design in [`client-qol.md`](client-qol.md).
- **Native polls** — `polls` + `poll_votes`, live broadcast, `PollCard`,
  Tauri command. Design in [`client-qol.md`](client-qol.md).
- **Video in voice channels** — WebRTC mesh, active-speaker management
  (top-3, 3s linger), `VideoGrid` (equal grid ≤4, active-speaker+thumbnails
  5+, self-view overlay), `BackgroundProcessor` (MediaPipe none/blur/image),
  camera toggle + background picker in voice bar, hub signaling envelopes.
  Scale: mesh works up to ~20; SFU hook designed-in for large events.
  Design in [`video-voice.md`](video-voice.md).
- **Voice advanced settings** — Standard / Music / Custom audio quality
  profiles. `EffectiveVoiceConfig` resolved at pipeline start; Denoiser
  bypass; VAD gate per-profile; custom Opus bitrate, app mode, channels,
  frame size, complexity. Settings persisted to `voice.json`.
  Design in [`voice-advanced-settings.md`](voice-advanced-settings.md).
- **Windows Authenticode signing** — CI signing wired in `release.yml`;
  activates once `WINDOWS_CERT_THUMBPRINT` secret is set (cert procurement
  never completed; signing has since been deferred — see code-signing.md).
- **Per-participant voice volume** — `sender_id` in UDP fan-out,
  per-sender gain pipeline, volume slider in channel sidebar, persistence
  to `voice_gains.json`. Design in [`voice-volume.md`](voice-volume.md).
- **Proximity voice** — voice zones in hub (WS protocol, in-memory state,
  `manage_voice` permission), client-side attenuation (4 models), game SDK
  calls (`wavvon:createVoiceZone`, `wavvon:setVoicePosition`). Design in
  [`proximity-voice.md`](proximity-voice.md).
- **Gaming Tier 2 client SDK** — `wavvon:game:ready/start/send/end/
  snapshot/sharedKvGet|Set/setJoinPolicy` postMessage calls, incoming
  event delivery to iframe, Activities live-session badge, session
  create/join/leave Tauri commands. Full Tier 2 now complete.

