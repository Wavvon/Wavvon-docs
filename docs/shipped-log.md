# Shipped log

Full historical record of shipped work, moved out of [ROADMAP.md](../ROADMAP.md)
to keep the roadmap slim. Newest entries first. Forward-looking work lives in
the roadmap; design rationale lives in [decisions.md](decisions.md).

## Entries

- **Web: Profile tab redesigned as an identity-colored card
  (2026-07-12)**: the tab read as a plain form in an empty pane; it's
  now a real profile. The WYSIWYG editor card gained a banner whose
  gradient is derived deterministically from the account's Ed25519
  public key (`utils/identityColor.ts`) — identity-is-a-key made
  visible, every account its own consistent colors — with the avatar
  overlapping the banner, a large name, muted pronouns, the short
  pubkey, and bio/badges under hairline dividers
  (`.profile-card*` in the shared styles.css). Plus a subtitle and a
  responsive two-column layout (`.profile-two-col`): the editor card
  and the Badges & certifications panel sit side by side on wide
  screens (using the pane width) and stack on narrow ones. The boxed "Managing account" selector is
  replaced by an inline scope line reading "[profile] for [account]"
  (the account half only when more than one account exists). Verified
  in dark and light themes (clients `1377203`).

- **Hub + web: bio & pronouns + WYSIWYG profile editor (2026-07-12)**:
  members get per-hub `bio` (≤ 500 chars) and `pronouns` (≤ 40) —
  additive `users` columns, PATCH/GET /me and the public profile
  endpoint carry them, avatar-style clear-on-empty-string, 400 on
  oversize, three new integration tests (hub `2aa7c11`). Web-side the
  profile editor became the card itself: inline name/pronouns/bio
  inputs styled as the member card, click-to-edit avatar with a hover
  pencil (`avatar-edit-btn`/`profile-inline-input` in the shared
  styles.css), per-context **drafts** with "•" dirty markers in the
  context dropdown, and a single "Save changes" persisting every edited
  context (default → scoped storage, hubs → their own sessions). The
  default profile and first-join auto-apply carry bio/pronouns;
  UserProfileCard displays both, and the editor card has an always-present badges section under the bio (per-hub badges in hub contexts, identity-wide curated badges in the default context, honest empty state) with the avatar chooser in a proper modal; the bio field auto-grows with its content (200px floor, no manual resize handle) (also fixed two latent UserProfileCard bugs: badges typed as strings while the hub serializes {id,label} objects — a guaranteed render crash — and the card using the undefined .modal-box class, rendering the dialog transparent). "Use default" has a fixed home next to the context dropdown, disabled when inapplicable, instead of appearing and disappearing. Round-trip verified against a live
  hub's Postgres (clients `77c5cad`, squashed feature commit). Widgets/
  wishlist deferred and
  activity surfacing declined — see [decisions.md](decisions.md).

- **Web: profile context dropdown — edit any hub's profile from Settings
  (2026-07-12)**: the Profile tab's two fixed editors (default + active
  hub) became one editor with a context dropdown (the Discord
  server-profiles pattern): pick the default profile or *any* joined
  hub and edit how you appear there in place. Per-hub reads/writes go
  through that hub's own live session via the new
  `platform/commands/myProfile.ts` (`getMyProfileOnHub` /
  `updateMyProfileOnHub` on top of `hubFetchWithToken` — the active hub
  isn't special); a friendly note covers hubs with no session this run; "Use default" in hub contexts links the context to the default profile persistently (per-account stored set): the hub mirrors the default from then on and every save of the default also updates followed hubs; editing a field there detaches it.
  Hub contexts are active-account-only (sessions belong to the active
  account); the default profile stays editable for any on-device
  account. Verified live against a real hub (PATCH landed in the hub
  DB); live/24 spec rewritten for the dropdown flow.

- **Web: settings "Accounts" group + default-profile-per-account
  (2026-07-12)**: user settings reorganized into an Accounts nav group
  with four tabs — Profile / Manage accounts / Devices / Privacy — the
  "Managing" selector lifted to `SettingsPage` (selection survives tab
  changes, e2e-proven), certifications moved under Profile, language
  selector moved to Appearance. The named-profile preset pool +
  per-hub assignment map were **deleted** (see
  [decisions.md](decisions.md)): each account now has one default
  profile (new `DefaultProfileSection`, editable for any on-device
  account via scoped storage without switching) and the per-hub
  profile is edited in place against the hub (`HubProfileSection`,
  `PATCH /me`). Onboarding's profile step now writes the default
  profile directly; the first-hub-join effect reads it at fire time.
  All four locales updated (13 new keys, 20 dead ones removed);
  10 mock-API e2e pass incl. the rewritten `settings-tabs` /
  `account-managing` specs; live specs repointed. Alpha: no
  migration, old localStorage keys orphaned by design. Desktop/
  Android parity pending (ROADMAP).

- **Web: manage any account without switching — "Managing" selector
  (2026-07-12)**: the Account tab gains a "Managing: [account]"
  selector; the per-account sections operate on the selected account.
  Home hubs and device certs/revocations sign locally with the selected
  account's master seed (those endpoints are signature-authoritative —
  no session needed); dm-blocks/passkeys/trusted-devices go through the
  new `hubFetchAs` background token (challenge/verify as the selected
  account, cached in its own namespace, active session untouched).
  Non-member accounts get a friendly notice; passkey *registration*
  stays active-only (WebAuthn binds the live session). **The
  sovereignty differentiator made tangible: stay in a voice call on one
  identity while administering another — possible only because Wavvon
  identities are locally held keys, not server accounts.** 8 unit +
  1 e2e proving the managed request carries the managed account's
  distinct token (clients `5f3f029`).

- **Web: in-place account switch — no reload, guarded (2026-07-12)**:
  switching remounts the app tree (`AccountRoot`, `<App key=account>`)
  instead of reloading; teardown audit fixed the one real leak (the
  module-level hub-sessions map survived remounts — outgoing account's
  WebSockets now reset before the key flips) and gave voice/video/
  screen-share refs a master unmount effect. Switching is blocked while
  in a voice channel (prevention, not auto-leave) and rate-limited by a
  4s cooldown protecting the remount+reconnect window. An interim
  "Switching account…" overlay approach was built and rejected same-day
  (two of its bugs — parse-time paint and a StrictMode flag race — are
  covered by the account-switch e2e, which now proves no navigation via
  a surviving window marker). Decision in
  [decisions.md](decisions.md) (clients `d36a664`…`6c03ff0`).

- **Web: account-switcher UX polish from live user testing
  (2026-07-11)**: iterative session with the user driving a running
  hub + both clients. Editable account labels behind a visible pencil
  (the old click-the-name rename had zero affordance); the standalone
  "Your public key" section merged into the account list with a
  per-row copy-full-key button (canonical-aware); required label on
  every new account (count-based prefill, dedupe keeps existing);
  the list is now a real table (# | Label+pencil | Public key |
  Actions) with fixed action positions (Switch/Copy/Remove; active row
  shows a disabled Active); adding an account no longer auto-switches;
  drag-and-drop ordering via a handle-only native-DnD # column with
  keyboard fallback, persisted as device-local account_order
  (18 new tests, 201 total) (clients `a9d18ef`, `f93e8c0`, `2876394`).

- **Invite role policies — default role + member invites (2026-07-11)**:
  hub setting `default_invite_role_id` grants a role automatically to
  anyone joining via an invite with no explicit grant (both redemption
  paths, explicit grants win, admin-permission roles rejected/skipped);
  non-admin `manage_channels` holders confirmed able to mint
  priority-guarded role invites and get a QuickInviteModal with an
  optional role picker; admin Invites tab gains the default-role
  picker. 11 new hub tests; live-verified: plain-invite joiner received
  the default role (DB-checked). Decision in
  [decisions.md](decisions.md) (hub `edca039`, clients `1bf0b8c`).

- **Live e2e session against a real hub: 4 bugs found + fixed
  (2026-07-11)**: booted a fresh hub + Postgres locally and drove the
  web client headless through owner-invite join, role-granting invites,
  lobby PoW promotion, channels, and DMs. Found and fixed same-day:
  (1) hub never registered `GET /channels/{id}/polls` — poll listing
  405'd on every channel load since polls shipped; (2) hub never
  registered `GET /conversations/{id}` and (3) `createConversation`
  sent `member_pubkeys` for the server's `members` — together with the
  dead Message-button code fixed earlier, starting a DM was impossible
  in web; (4) `handleSendDm` swallowed failures after clearing the
  input (silent message loss) — now restores text + shows the error.
  Cosmetic: DM composer placeholder showed "Invia" (send-button key).
  Live-verified after fixes: owner invite → owner role, member invite
  → `tester` role (DB-checked), lobby confine → PoW → `promoted`
  (DB-checked), DM started from profile card and received cross-account
  (server `d88722f`, clients `cc1c6e6` + `c2af774`).

- **Paired-device DM canonical attribution — fixed cross-repo
  (2026-07-11)**: implements the same-day design (decisions.md,
  [multi-device.md](multi-device.md)). Pairing now wraps the canonical
  X25519 DH scalar for the new subkey (`wrapped_dh_seed_hex` — agreement
  capability without signing capability); DM envelopes gain optional
  `signer_cert` with tiered verification (origin hub binds via session;
  federation resolves via users row / device registry);
  `FederatedDmRequest` forwards the cert. Cert-less envelopes stay
  byte-identical — no wire-vector break. Client attaches the cert and
  attributes to canonical when the signing key differs; paired devices
  never publish the DH key. This makes paired-device E2E DMs work at
  all — they previously failed hub signature verification outright.
  6 new hub flow tests + 7 client decision tests; full suites green
  (server `aab8107`, clients `974fe5e`).

- **Web: full-archive import/restore (2026-07-11)**: "Restore from
  archive…" decrypts the export, resolves-or-creates its identity as an
  account, and restores hub list/drafts/ignored users/voice gains into
  that account's namespace with skip-and-report conflicts (local data
  never silently overwritten); DM history, home-hub designations, and
  the encrypted-prefs `gap_note` reported as not-restorable per
  [data-export.md](data-export.md) §5. Pure merge logic +12 tests incl.
  cross-account isolation (clients `53ccce2`).

- **Hub: voice_udp_addr on /info + demo-seed invite fix + mini-app
  scoped tokens (2026-07-11)**: `/info` advertises the voice UDP
  endpoint (from `WAVVON_PUBLIC_URL`/LAN advertise addr; farm
  serial-routing slice). demo-seed redeems the first-boot owner invite
  (`--invite`/`INVITE_CODE`), mints a roster invite, and writes real
  `secret_key_hex` (was empty) — clears the known issue. **Security**:
  `bot_app_join` sessions are now `scope='mini_app'` bound to one
  channel+bot — REST fully confined, WS confined to the bound channel,
  voice rejected; closes the full-session gap found in the
  [bot-capability-layer.md](bot-capability-layer.md) design pass
  (hub `59e28ec`, 6 confinement tests).

- **Web: ctx-menu create event/poll + invisible + popover fix
  (2026-07-11)**: channel right-click menu gains Create event
  (admin-gated) and Create poll (`send_messages`-gated), reusing the
  existing composers. Found + fixed: the shipped Join/Create `+` popover
  (`da250c9`) was silently clipped by `.hub-sidebar` `overflow-x:hidden`
  — never actually visible; rebuilt on the fixed-position context-menu
  pattern and wired its unused i18n keys (clients `83a7676`).

- **Web: role-granting invite admin UI + invite-expiry fix
  (2026-07-11)**: `InviteManager` with role picker (limited below the
  admin's own max priority), single-use/24h clamp on admin-permission
  roles, role chips on the invite list. Fixed pre-existing bug: create
  body sent `expires_in` but the server reads `expires_in_seconds` —
  admin-typed expiry was silently dropped (clients `68a1f73`).

- **Hub: /join/:code role grants + redemption-time priority guard;
  lobby is_hub regression test (2026-07-11)**: `apply_invite_role_grant`
  shared by both redemption paths; priority guard now re-checked at
  redemption (inviter demoted after minting no longer confers the role —
  grant withheld, join succeeds; first-boot system invite exempt). Added
  the missing test that `is_hub` peers are never lobby-confined
  (exemption itself shipped in `8dc6739`) (hub `5d2b7a8`).

- **Web: lobby soft-landing polish (2026-07-11)**: persistent sidebar
  clock badge on lobby-scoped hubs (visible when not the active hub) +
  promote-decision forks extracted to `utils/lobbyDecision.ts` with 15
  tests. Core flow had shipped in `c1f95d0` (clients `1474561`).

- **Designs: bot capability layer, forum federation, paired-DM fix
  (2026-07-11)**: [bot-capability-layer.md](bot-capability-layer.md)
  (admin-granted capability spine, game modal, video via screen-share
  relay, Phase-1 tic-tac-toe slice); [forum.md](forum.md) §9 federation
  via read-through proxy; paired-device DM attribution fix designed
  (decisions.md + [multi-device.md](multi-device.md) implementation
  plan) — design pass found paired-device E2E DMs were fully broken,
  not just mis-attributed (docs `5c3995b`, `df9fc4c`).

- **Web: identity/account i18n sweep + de/es admin translations
  (2026-07-11)**: ~150 new keys across IdentitySetupScreen,
  IdentityBackupSection, AddHubModal (clears that known issue), and six
  account-section components + shared BlockIgnoreSection; raw
  "Error: No active hub" replaced with translated empty-states; 18
  `hub.admin.overview.*` de/es English placeholders translated
  (clients `71d1b51`, `f7158d5`).

- **Web: identity backup exports selected accounts (2026-07-11)**:
  the encrypted backup gains a checkbox list when the device holds
  multiple accounts (active pre-checked, select-all) — one passphrase,
  one file. Envelope `version` 2: payload is always an array of
  identity records; import still accepts v1 single-object files,
  dedupes by pubkey, reports "N added, M already on this device", and
  never replaces. Pure payload logic in
  `utils/identityBackupPayload.ts` (15 tests) (clients `04b5d38`).

- **Web: multi-account with device-local switcher (2026-07-11)**:
  multiple identities per device, isolated via
  `utils/accountScope.ts` localStorage namespacing (hub lists, session
  tokens, drafts, profiles, notify prefs, DM ratchet state);
  `IdentityRecord.id` is now the account pubkey, registry = the
  IndexedDB identity rows, switcher lives in Settings → Account
  (switch = pointer swap + reload; removal = fingerprint-typed confirm
  + namespace purge). Add-account reuses all setup paths via the
  extracted `IdentitySetupScreen` (create/passkey/phrase/pair),
  deduping by pubkey. No migration by design (pre-release). Also fixed
  `IdentityBackupSection` reading a never-populated key (export always
  failed). Client-only — no hub changes (clients `99d363e`; decision
  in [decisions.md](decisions.md)).

- **Web: passkey-derived identity via WebAuthn PRF (2026-07-11)**:
  identity setup gains "Create identity with a passkey" and "I have a
  passkey" — the passkey's PRF output (salt `wavvon-master/v1`, pinned
  constant in `packages/core/src/identity/prf.ts`) is used directly as
  the 32-byte identity entropy, so the derived 24-word phrase remains
  available and is offered as the domain-independent backup after
  creation. Fully client-side (`apps/web/src/platform/prfIdentity.ts`);
  the hub-session passkey ceremony is unchanged. Graceful fallback to
  phrase flows when PRF is unsupported. New `identity_setup.passkey.*`
  keys in all four locales. Desktop/Android PRF shims remain wishlist
  (clients `5f9008f`; decision in [decisions.md](decisions.md)).

- **Web: nickname + avatar step in first-run onboarding (2026-07-11)**:
  all three identity-setup paths (create, recover from phrase/hex, pair
  with existing device) now finish on a profile step — nickname input +
  the existing `AvatarChooser` (upload or generated) in a new
  `ProfileSetupStep` component. The choice is saved as the user's
  default named profile, which the existing first-hub effect applies
  automatically via `PATCH /me`; skipping keeps the old bare
  display-name modal as the fallback on first hub join. New
  `onboarding.profile.*` keys in all four locales (clients `89222bd`).

- **Desktop: hub-synced presence with DND gating + global broadcast
  (2026-07-11)**: ported web's full presence set (web `5af06ca`,
  `e137c87`, `ac8e251`) — the local-only, purely visual status picker in
  `ChannelSidebar` now syncs away/DND/custom text over
  `set_status`/`member_status` (picker gains the custom-text input,
  drops the meaningless "offline" option). Presence is device-global:
  broadcast to every connected hub session (new `send_all_hubs_ws_raw`
  Tauri command) and re-applied per hub on (re)connect
  (`send_hub_ws_raw_to`). The Rust WS layer learns `member_status`
  (previously dropped as `Other`); the member list renders away/DND dots
  + custom text; `/users` fields threaded through `UserInfo`. DND now
  actually gates mention pings and system notifications (unreads still
  accumulate); desktop's `silent` notify mode already gated. The inert
  `dndActive`/`save_dnd_settings` plumbing was removed (clients
  `81de52c`). Live two-client pass still pending.

- **Desktop: camera background choice persists + Settings live preview
  (2026-07-11)**: background mode/source now persist via the same
  localStorage keys web uses (`wavvon.bgMode`/`bgSource`), loaded/saved
  in `useVideo` — blur/image/video no longer reset every launch. The
  hardcoded-English background buttons in Settings were replaced by a
  new `CameraSection` ported from web's CameraTab: i18n'd controls plus
  a live mirrored preview that runs outside a call and restarts on
  device/mode/source change (clients `e41842b`). Closes the 2026-07-05
  known issue.

- **Desktop + docs: wire test vectors regenerated for wavvon tags
  (2026-07-11)**: the Voxply→Wavvon bulk rename (clients `032028d`)
  updated envelope tag string literals but not the hex-encoded test
  vectors — 20 of desktop's 38 wire vector tests had been failing since,
  and `wire-format.md`'s vectors were equally stale. Desktop vectors
  copied from the server identity crate's regenerated
  `wire_vectors.rs` (clients `4cb5933`); all 20 hex blocks in
  `wire-format.md` refreshed to match.

- **Desktop: camera background effects fix ported from web (2026-07-11)**:
  desktop's `backgroundProcessor.ts` copy had the same two bugs fixed on
  web the day before (globalThis constructor resolution, mask consumed as
  ImageData instead of composited as a canvas) — ported the full web fix
  (drawImage/source-in cutout, serialized send(), eager initialize(),
  `activeMode`) and surfaced the active/unavailable status line in the
  Settings camera-background section via a new `backgroundActive` value on
  `useVideo` (reuses the shared `settings.camera.bg.*` keys). Unit tests
  extended with a segmentation-failure fallback case (clients `9ab943e`).
  Live webcam pass still pending — desktop has no fake-camera e2e harness
  like web's.

- **Web: camera background effects fixed (2026-07-10)**: blur/image/video
  backgrounds never actually engaged — two bugs in `backgroundProcessor.ts`
  made every mode silently fall back to raw video: the MediaPipe package
  (Closure IIFE, no module exports) meant `mod.SelfieSegmentation` was
  always undefined, and the segmentation mask (a GpuBuffer canvas) was
  consumed as ImageData, which would have killed the render loop. Fixed
  with the globalThis constructor + drawImage/source-in compositing;
  send() serialized to one in-flight frame; eager initialize() so broken
  environments fall back deterministically; the Camera tab now shows an
  active/unavailable status instead of pretending (clients `9426c20`,
  4-locale keys). Verified with a new fake-camera e2e spec + visual check
  of the composited blur. Desktop's copy has the same bugs → new known
  issue in ROADMAP.

- **Web: DND status now gates notifications, presence made global, hub
  mute made real + components/ reorg (2026-07-10)**: selecting **Do Not
  Disturb** in the status picker now actually suppresses mention pings
  and system notifications (unreads still accumulate) — previously
  visual-only on every client. Presence is now **global across hubs**:
  the picker broadcasts `set_status` to all connected sessions (was
  active-hub-only), persists on the device, and re-applies per hub on
  (re)connect. The notify-mode gate also landed: a hub/channel set to
  `silent` (hub mute) no longer pings on mentions — it was cosmetic
  before. Two decisions recorded ([decisions.md](decisions.md)): DND
  rides on presence status with no dedicated toggle; presence is global
  while per-hub quiet is hub mute. The never-mounted `DndToggle` /
  `DndSettingsSection` dead code and `DndSettings` types were deleted.
  Quiet-hours schedule stays deferred. Desktop/Android gates still
  pending (with presence parity). Also: the ~100 flat files in web's
  `src/components/` were reorganized into 13 themed subfolders (clients
  `b149281`), imports normalized to `@components/<group>/<Name>`; and
  SettingsPage.tsx (724 lines) was split into per-tab components under
  `settings/tabs/` + extracted Passkey/TrustedDevices sections (clients
  `91e4b80`), with a new hubless e2e spec asserting every settings tab
  renders — written to chase a reported "Camera tab not visible", which
  turned out to be real only on released builds: the tab shipped to
  develop 2026-07-07 (`1b03e8a`), after v0.3.2 was cut.

- **v0.3.2 (clients + server) + pilot on latest (2026-07-06 evening)**:
  nine web fixes from the owner's live pilot pass — /join/<code> invite
  links parse in Add-hub; banner channels regained their image controls
  (create URL/upload + settings editing; the desktop-only three-step
  flow was never ported); channel-permissions rows at/above own rank
  render read-only (even the owner 403'd on the Owner row's >= guard);
  fixed-size tabbed settings modal + single-row footer + Apply label +
  icon-placeholder cleanup; hub rename now syncs the sidebar (save hook
  + /info self-heal, new renameSavedHub keeps remember_token);
  hub-dropdown closes on Invite/Settings; emoji channel icons render
  (ChannelIcon only knew svg registry ids). Server v0.3.2: banner
  source-switch atomically clears the other column (PATCH had no
  explicit-NULL; stale banner_url shadowed new uploads). Release
  hygiene: clients release.sh syncs all app manifest versions; server
  release.sh regenerates Cargo.lock. **Pilot** switched to
  `hub:latest` (owner call: alpha, surprise-upgrades fine) and pulled
  v0.3.2 — data intact, VideogameZone name intact, fresh web bundle
  served. Android APK still blocked on audiopus cross-compile (known
  issue).

- **Clients v0.3.0/v0.3.1 released + pilot hub fresh-installed on v0.3.1
  (2026-07-06)**: first clients release since v0.2.6 and since the rename.
  v0.3.0 shipped desktop (Windows exe, macOS universal dmg — first CI
  proof of the xcap 0.9.6 fix — Linux AppImage, updater manifest) and the
  web bundle; v0.3.1 re-ran for Android after fixing the doubled
  `apps/android/android` workflow paths, which unmasked the real blocker
  (audiopus_sys host-arch libopus → ROADMAP known issue; still no APK).
  Clients release.sh fixed (pre-monorepo tauri.conf path, changelog-wiping
  git-cliff mode) and CHANGELOG.md introduced. **videogamezone pilot**
  wiped and reinstalled per owner decision: `ghcr.io/wavvon/hub:0.3.1` +
  postgres:16 sidecar in `~/voxply` (vhost symlink pins the dir; db
  container named wavvon-db — plain "db" belongs to the neighbouring govd
  bot), `WAVVON_PUBLIC_URL` set, fresh hub identity, first-boot owner
  invite minted and handed to the owner. Hostname is still
  voxply.videogamezone.eu until the vhost server_name gains the wavvon
  alias + friend's nginx reload.

- **Server v0.3.1 released — first working release pipeline since v0.2.0
  (2026-07-06)**: `wavvon-hub-linux-x86_64`, `wavvon-hub-linux-aarch64`
  (first successful aarch64 build ever), `wavvon-farm-linux-x86_64` +
  Docker images published. Three pipeline bugs fixed to get there:
  auto-tag dispatched release.yml without its required `tag` input
  (422'd silently on every tag since v0.2.1 — tags pushed, nothing
  built); OpenSSL (via webauthn-rs) was vendored only on Windows, so the
  musl static and Docker builds had nothing to link (now vendored on all
  targets, Docker builder gained perl+make); release.sh used a stale
  `hub/Cargo.toml` pathspec and a git-cliff mode that wiped previous
  releases' notes from CHANGELOG.md on every run. Also de-flaked the
  four cross-hub DM delivery tests (poll instead of fixed sleeps) that
  were failing CI on unrelated PRs, and the openapi coverage gate got
  unbroken (script knew only the old `hub/` layout) + fed a spec that
  documents all 228 routes. v0.3.0's tag/release exists but is empty —
  its notes fold into v0.3.1. Dependabot PRs #10–#14 merged along the
  way. Closes the "no release assets since v0.2.1" known issue.

- **Public-facing cleanup after the Voxply→Wavvon rename (2026-07-06)**
  (docs `674cfd3`+assets, server `1c99dd8`, clients `3020ada`, discovery
  `037d403`): every `github.com/Wavvon/Wavvon` link now points at
  `Wavvon-docs` and `Wavvon-client` at `Wavvon-clients` — the renames had
  left 404s in all four repos' READMEs plus server CI's spec checkout.
  Server README/compose/hub.toml.example caught up with reality:
  PostgreSQL (not SQLite), `WAVVON_DATABASE_URL` documented, compose
  gained the postgres:16 sidecar, crate table matches the workspace.
  Client READMEs no longer claim voice is desktop-only. **README assets
  regenerated** — the old screenshots/join-flow GIF still showed "Voxply
  HQ"; recaptured against a demo-seeded hub as "Wavvon HQ" with the
  current UI, via a new committed capture harness
  (`apps/web/e2e/capture/`). Release-pipeline failure diagnosed →
  ROADMAP known issue (needs the next tag).

- **Web UX bug batch (2026-07-06)** (clients `479af88`): four fixes from
  the owner's manual pass. **Message right-click menu** — a message row
  now opens a context menu with message actions (reply, copy text, copy
  link, pin, edit, delete, report) plus author actions (profile, copy
  key, admin mute/kick/ban); the author name/avatar still opens the full
  user menu with role management. **Resizable channel sidebar** —
  drag-handle on the right edge (220–480px, persisted, double-click
  resets), and the voice-controls footer wraps instead of overflowing.
  **Floating camera window** — video moved out of the channel header
  into an app-level picture-in-picture window (draggable, resizable,
  position/size persisted) that follows the voice session rather than
  the selected channel. **Header cleanup** — the "Copy channel link"
  header button removed; the action lives in the channel's right-click
  menu instead.

- **Backlog sweep, 2026-07-06 (loop session)** — cleared the buildable
  backlog: **invite-first defaults + role-granting invites** (hub `10f3e2d`,
  incl. one-time first-boot owner invite) and **is_hub lobby exemption**
  (`8dc6739`); **`wavvon-hub setup` install wizard** (`89119a2`); web
  **lobby UX + background PoW** (clients `c1f95d0`, first JS PoW in
  `packages/core`); **generated offline avatar picker + profile avatar
  editing** (`4c93c9d`); **multiple named custom themes** (`afc07a8`);
  **Settings › profile dedup + Voice&Video restructure + 2-col layout**
  (`b270a3d`). **create-hub-via-discovery** designed (`bc798da`), UI slice
  built separately. Human-gated remainder: pilot upgrade, v0.3.0 release
  tag, git remotes.

- **Lobby soft-landing, server half (2026-07-06)** (hub `bded78c`;
  [`lobby-bot-survey.md`](lobby-bot-survey.md) Feature 1). `min_security_level`
  used to hard-403 every sub-level join (even the owner's own first join) —
  now, when the lobby is enabled, a sub-level join is admitted with
  `scope="lobby"` and confined to `/me` + `/lobby/*` + survey (deny-by-default
  in the AuthUser extractor; WS rejects lobby scope). `POST /lobby/submit-pow`
  promotes lobby→member in place once PoW qualifies. Owner + implicit first
  user are exempt (always member). Additive `sessions.scope` column; gaming
  preset's `min_security_level: 8` restored now that the gate admits instead
  of walls. 7 new tests. Web lobby UX + is_hub-peer exemption tracked as
  follow-ups.
  Also (server `4490d5c`): first real user becomes owner even on a
  preset-seeded hub — the "first user" check had been counting the bootstrap
  `system` sentinel.

- **Manual-test feedback wave 3 (2026-07-05 late night)** (server `a503ede`
  `9457a5b`, clients `0ec7fa8` `fa23c1f` `4ada361`):
  - **Batch 2 web fixes** (`4ada361`): no-hub shell keeps the rails (welcome
    moves into the content slot); right-click message authors for the
    moderation menu; composer click-anywhere focus; channel silence finally
    has UI (per-channel Notifications submenu; hide-silenced props were
    never wired); submenu z-index/overflow; message permalinks replace the
    channel-link menu item.
  - **Admin surfaces** (`0ec7fa8`): grouped User Settings nav; ErrorRetry
    across 8 admin sections (Roles used to hang on failed fetch); icon
    library file upload (raster → 64×64 svg-wrapped) + Recovery explainer;
    Federation nav group; anti-spam challenge Preview modal; inline member
    role management in the Members table.
  - **Welcome invite banner** (`9457a5b` + `fa23c1f`): operator-set
    label/invite in hub settings → /info; join-preview + dismissible
    post-join banner.
  - **Survey → roles** (`a503ede` + `fa23c1f`): per-choice role mappings
    with admin-permission guard and strict free-text review rule
    ([`lobby-bot-survey.md`](lobby-bot-survey.md) clarified); admin UI role
    picker per option.

- **Manual-test feedback wave 2 (2026-07-05 night)** (server `8867105`
  `db25169`, clients `9815177` `207e7bf` `e0c3bf8`):
  - **Kick/ban end membership** (`8867105`): membership = holding roles;
    kick/ban strip them, /users hides banned + role-less non-bots, users
    row kept for message attribution. Kicked users rejoin as new members
    (invite needed on invite-only hubs); banned stay 403.
  - **Voice roster, web half** (`e0c3bf8`): the current channel's row no
    longer blanks its own roster.
  - **Year-58479 timestamps** (`9815177`): messages carry ms, everything
    else seconds — shared formatters now normalize.
  - **Voice UI batch** (`207e7bf`): SVG icons replace unrenderable emoji,
    "Deafen"→"Mute all audio", default initial-avatars, screenshare
    self-preview, unified header command row.
  - **CI green again** (`db25169`): two clippy -D warnings lints.

- **Manual-test feedback wave 1 (2026-07-05 evening)** (server `327c399`
  `7ed61c7`, clients `9467b0d` `df6064b`). From the owner's live pass:
  - **Voice roster ghost fixed** (`7ed61c7`): the WS voice filter
    suppressed the actor's own Joined/Left events, so after a channel
    switch/leave your own sidebar kept you in the old channel forever.
    Roster events now reach everyone including the actor.
  - **First-run bootstrap presets** (`327c399`,
    [`hub-creation-wizard.md`](hub-creation-wizard.md) piece 2 local half):
    `WAVVON_TEMPLATE=gaming|community|minimal` + `WAVVON_TEMPLATE_FILE`;
    bootstrap runs pre-owner-seeding; unknown preset = startup error. 22 tests.
  - **Web quick fixes**: language setting → Profile; "Voice Lobby" →
    "Room Creator" (`9467b0d`); voice devices first in the Voice tab;
    status picker dismisses on outside click; event modal start/end
    widths (`df6064b`).

- **Farm serial routing, first slice (2026-07-05)** (server `012b791`;
  design in [`farm-impl.md`](farm-impl.md) § Serial routing). The farm
  reverse proxy resolves `/hub/{serial}/…` by hub pubkey (unique partial
  index) instead of the opaque id — the serial clients already hold from
  invite links. WebSocket upgrades bridge through a raw socket relay
  (copy_bidirectional on 101). Fixed two latent `process_port`
  INTEGER-as-i64 decode bugs — one made the proxy silently 404 every
  registered hub (zero prior test coverage), one would have broken
  startup re-spawn. 5 integration tests incl. end-to-end WS echo.

- **LAN / offline mode, server half (2026-07-05)** (hub `a6ec49b`,
  [`lan-mode.md`](lan-mode.md)). `WAVVON_LAN_MODE=1`: hard private-address
  guard (refuses to start on a public address; hostnames rejected — no DNS
  on a LAN), self-signed cert tier with restart-stable SHA-256 fingerprint
  (`WAVVON_LAN_TLS_MODE=self`, default) or gated plaintext (`none`), mDNS
  advertisement with join-URL + fingerprint TXT fields
  (`WAVVON_LAN_MDNS=0` opt-out), `/info` exposes
  `lan_mode`/`lan_tls`/`lan_fingerprint`, doctor prints the join URL +
  fingerprint. Native discovery UX / QR payloads stay client-era. 15 tests.

- **Desktop: MediaPipe self-hosted + video background (2026-07-05)** (clients
  `73cdadf`). Background effects no longer hit jsDelivr — web's
  `mediapipeAssets` Vite plugin now serves desktop too (`/mediapipe/*`,
  bundled into the Tauri dist), fixing offline use. Video background mode
  ported from web; the Image picker the class always supported finally got
  UI. 5 vitest cases. Follow-up in ROADMAP: desktop doesn't persist the
  choice across launches.

- **Farm challenge race fixed + farm/seed test-DB guards (2026-07-05)**
  (server `8b45c9e`). Farm's pubkey-keyed challenge slot had the same
  concurrent-auth stomping race as the hub; now nonce-keyed
  (`pending_challenges_v2`, additive) with an optional `challenge` echo on
  verify (race-free; old clients fall back to newest-challenge). Farm and
  seed integration tests adopt hub's `TestDbGuard` — test databases are
  dropped on scope exit instead of leaking (~80 observed on a dev volume).

- **Presence status: away/DND/custom text, hub-synced (2026-07-05)**. New WS
  `set_status` client message + `member_status` hub-wide broadcast; status
  persisted on the users row (additive `presence_status`/`presence_custom`
  columns — first post-baseline migration) and surfaced by `/users` only
  while online. Web: footer status picker (ported from desktop's local-only
  one), colored dots + custom text in the member list, live updates.
  "Online" click clears the custom text (back-to-normal semantics). The
  "new member appears live" half of the old known issue was already fixed
  on 07-04 (`fb97442`). 2 hub integration tests + `e2e/live/10` extended.
  Also fixed en route: vitest was collecting Playwright specs under `e2e/`
  (48 failing suites in `npm run test`) — excluded in `vite.config.ts`.

- **Temp-room owner rename UI (2026-07-05)** (clients `4100671`). The last
  open piece of join-to-create temp voice channels: a non-admin room owner
  gets a "Rename room" context-menu item (name-only modal, matching the
  server's `owner_rename_only` grant). i18n ×4, `e2e/live/06` extended.

- **`GET /channels/:id/my-permissions` + channel-scoped client gating
  (2026-07-05)** (server `daac936`, clients `fdb2086`). Members read their
  own effective channel-scoped permission set without `manage_roles` —
  closes the recurring UX gap (soundboard play-gate, Permissions tab
  reachability). Web: soundboard button now respects channel-level denies;
  the settings gear opens for `manage_roles` members straight into the
  Permissions tab (rename/delete stay admin-only). `e2e/live/47` + 4 hub
  integration tests. **Also (server `fab74e2`): int4-cast sweep** — channel
  message reactions 500'd the whole history fetch whenever a message had a
  reaction (same uncast `MAX(CASE…)` as the forum bug, three loaders), and
  `/health` `db_status` had reported a decode error on every check since
  the Postgres migration; both fixed, reaction read-back now covered in
  `chat_flow.rs`.

- **v0.3.0 schema baseline reset + four federation bug fixes (2026-07-05)**
  (server `b6e09f5`, `2bd80b8`). All ALTER-ballast folded into clean CREATE
  TABLEs — verified byte-identical via pg_dump diff (decision in
  [`decisions.md`](decisions.md); pre-0.3.0 hubs wipe + re-setup, see
  [`hub-operator-guide.md`](hub-operator-guide.md)). Fixing the ~20
  integration-test files that hadn't compiled since the whisper commit
  unmasked four real bugs, all fixed:
  1. **Auth challenge stomping** — challenges were one-slot-per-pubkey, so
     concurrent federation auth flows for the same key killed each other;
     now keyed by challenge value (regression tests in `auth_flow.rs`).
  2. **Federated DM receive not idempotent** — redelivery (at-least-once by
     design) 500'd on duplicate keys forever; receive inserts are now
     `ON CONFLICT DO NOTHING` and `dm_outbox.last_error` records the remote
     body.
  3. **Forum reactions silently dead since the Postgres migration
     (2026-06-27)** — int4 aggregate decode failed and was swallowed by
     `unwrap_or_default()`; every post showed zero reactions while the
     write path returned 201.
  4. **Federated-ban overrides unenforced at 2 of 3 gates** — whitelist/
     blacklist only worked at auth verify; message layer and farm-token
     middleware had drifted copies without them. Policy unified in
     `moderation::is_denied_by_federated_policy`; auth path now fails
     closed on DB errors.

- **Alliance space-sharing v2 (2026-07-05)** — any space type shareable across
  an alliance; sharing a category shares its subtree recursively with live
  semantics (read-time recursive CTE). Shared-channel responses carry
  `channel_type`/`parent_id`/`is_category`; web sidebar renders allied trees and
  alliance messaging is now wired (was stubbed). Fixed two pre-existing
  federation bugs en route: joiner stored literal `"self"` as inviter URL;
  mutual hubs recursed indefinitely merging shared views (`local_only` hop).
  See [`alliances.md`](alliances.md), [`decisions.md`](decisions.md).

- **Manual-test bug pass (2026-07-05) — batch 5 (features + polish)**. All with
  2+ Playwright tests each; full live suite 62 green.
  - **Farm-ready invites** (`237eb59`): `wavvon://<host>/i/<hubSerial>/<code>`
    (serial = hub public key) so a farm can route the same domain to different
    hubs by serial. `parseHubInput` extracts the serial (path or `?hub=`,
    backward-compatible), `buildInviteLink` generates it, and the Invites admin
    tab shows a full copyable link. 5 core unit tests + `e2e/live/42`.
  - **Soundboard popover** no longer overflows the viewport (`0ea4404`,
    `e2e/live/39`); **channel-header buttons** spaced out.
  - **Voice join/leave sound cues** wired (`playVoiceTone`) with a toggle
    (`37db681`, `e2e/live/41`); mention ping already covered notifications.
  - **Incoming + outgoing webhooks** merged into one Integrations tab
    (`756e7f3`, `e2e/live/40`).
  - **Camera device picker + live preview** in Settings (`9edb456`,
    `e2e/live/43`).
  - **Webcam background effects — blur / image / video** (`8b1d489`,
    `e2e/live/45`). Ported + extended the desktop `BackgroundProcessor`
    (MediaPipe selfie segmentation); no device gating (opt-in, user decides);
    model + WASM served **self-hosted** from `/mediapipe/*` via a Vite plugin
    (no CDN, offline-friendly, nothing committed), lazy-loaded on first use,
    graceful fallback to raw video if it can't load.
  - **Hub-admin nav grouped** into labeled sections + made scrollable
    (`e803326`, `e2e/live/44`).
  - **#7** (redundant join-voice button): investigated — the channel header is
    the only join-voice control; nothing redundant found to remove.

- **Manual-test bug pass (2026-07-05) — batch 1** (server `4d38025`, clients
  `33c4485`). From hands-on testing of the running hub:
  - **Ban/kick/mute from the member right-click menu were broken** — the client
    hit `/admin/bans`, `DELETE /admin/members/{pk}`, `/admin/members/{pk}/mute`,
    none of which exist. Pointed them at `POST /moderation/{bans,kick,mutes}`.
    `e2e/live/33`.
  - **Integrations tab 405'd** — listing used `GET /admin/webhooks` and
    regenerate used `PATCH /admin/webhooks/{id}`, but only POST/DELETE existed.
    Added both handlers. Also fixed a pre-existing **create 500** (the INSERT
    passed integer `1` for the BOOLEAN `active` column). `e2e/live/34`.
  - **Theme-picker buttons unreadable in calm/light** — inherited the base
    button's `var(--accent-text)` (dark in calm, white in light) on a surface
    background. Set an explicit `color: var(--text)`.
  - **"Identity backup" label shown twice** in the account tab — deduped.

- **Manual-test bug pass (2026-07-05) — batches 2–4** (server `05b890d`,
  clients `f3ee45e`, `22dcc58`, `c05c544`, `bfb658c`, `fa5bd85`, `1173f94`):
  - **Voice:** switching voice channels now leaves the previous one (repeated
    joins stacked sessions → "in 3 rooms at once" + stale roster entries that
    blocked temp-channel cleanup); the channel tree no longer duplicates the
    voice roster (your name showed twice). `e2e/live/35`.
  - **Channels:** deleting a category/channel cascades to all descendants
    (was 409); long channel names truncate so the settings gear stays reachable.
    Also fixed `tests/common.rs` (the hub integration suite hadn't compiled since
    the whisper AppState field). `e2e/live/36,37`.
  - **Settings surfaces:** language switcher (Settings → Appearance, `e2e/live/38`);
    audio input/output device pickers (Settings → Voice); discovery directory
    shows a greyed "Service not available" state when unreachable; clarified the
    SVG icon-library field.

- **Known-issue fix batch (2026-07-04/05)** — issues fixed out of ROADMAP
  Known issues, moved here on close:
  - **SECURITY — 2026-07-04 audit findings all fixed** — full audit in
    [`security-audit-2026-07-04.md`](security-audit-2026-07-04.md).
    Server fixes hub `efbf17b`, web fix clients `62792cb`. Verified by
    hand + regression tests. **H1** (WS Subscribe read-gate):
    `handle_subscribe` requires channel-scoped `READ_MESSAGES`; 2 WS
    integration tests over real TCP. **H2** (channel-perm escalation):
    priority guard + unconditional `admin`-grant block + self-grant guard
    on PUT/DELETE; `manager_cannot_grant_admin_via_overwrite` asserts 403.
    **H3** (events) / **H4** (pins): read paths channel-gated (`get_event`
    404s to avoid existence leak); pin writes channel-scoped. **D1/D2/D3**
    (importer): TLS-bypass now loopback-only behind `--insecure`,
    non-`https` hub rejected unless loopback, `Retry-After` clamped; same
    TLS line scrubbed from `demo-seed`. **W1** (color beacon):
    `safeRoleColor` validator on both swatch sinks. **W2** (2026-07-05,
    clients `46fa57e`): `SortableItems.tsx` validates `channel.color` via
    `safeRoleColor` before the category-header `background` sink.
  - **Temp voice spawners on web** (2026-07-04, hub `1fc5aa6`) — the
    spawn-on-join logic (hub `3005fc5`) had only been added to
    `routes/ws/handlers/voice.rs` (the main-hub-WS / UDP path used by
    desktop/Android); web's separate `/voice/ws` transport
    (`routes/voice_ws.rs`) never detected `channel_type = 'spawner'`, so a
    web user clicking a spawner joined the spawner row itself.
    `voice_ws_task` now reuses the same `spawn_temp_channel()` helper,
    gates on channel-scoped `read_messages` against the spawner first, and
    echoes the resolved `channel_id` in `voice_ws_ready`. Broadcasts
    `channels_updated` on spawn, matching the main-hub-WS path. Two new
    integration tests in `temp_voice_channels_flow.rs`.
  - **Web profile changes propagate live** (2026-07-04, hub `a23a7d9`,
    clients `fb97442`) — `PATCH /me` now broadcasts a hub-wide
    `member_updated` WS event carrying the fresh name/avatar; the client
    updates the member in its `users` map in place, so display-name/avatar
    changes show live on other clients without a reload. `e2e/live/29`.
  - **Banner channels manageable from the web sidebar** (2026-07-05,
    clients `47ee91f`) — admins get a management row (name + settings
    gear) plus a right-click context menu on banner rows, so they can
    rename/delete like any channel; members still see just the image.
    `e2e/live/11`.
  - **`packages/core` crypto test vectors regenerated** (2026-07-04,
    clients `fb97442`) — `src/identity/crypto.test.ts` asserted pre-rename
    `"voxply/…"` wire tags and was excluded from the suite; regenerated the
    DhKeyRecord + DM-envelope vectors against the canonical
    `wavvon-identity` values and re-enabled it.
  - **Hub switch / fresh load left the message pane empty** (2026-07-04,
    clients `42a3390`) — `loadHubData` auto-selected the first channel but
    never fetched its messages, so the pane stayed empty until a manual
    click. It now fetches + subscribes the auto-selected channel (guarded
    against a racing manual selection). `e2e/live/30`.
  - **Web mock-API e2e (`forum.spec.ts`) repaired** (2026-07-05, clients
    `46fa57e`) — `injectSession` now also seeds the IndexedDB
    `wavvon/identity/main` record; the catch-all mock route falls back to
    the specific mocks instead of the network, the list-posts mocks match
    the query string, and the reaction test keys off the POST landing.
    5/5 green.
  - **Web role appearance controls on built-in roles** (2026-07-04,
    clients `42a3390`) — `RolesSection` no longer renders the
    color/icon/category controls for `@everyone`/`Owner` (the hub rejects
    appearance PATCHes on built-in roles); permissions remain editable.
    `e2e/live/31`.
  - **Icon pickers can no longer store non-rendering shortcodes**
    (2026-07-05, clients `47ee91f`) — `EmojiPicker` gained a `unicodeOnly`
    prop that hides the hub-custom-emoji (`:name:`) section; the role,
    channel, category, and soundboard icon pickers pass it (the message
    composer still offers custom emoji). `e2e/live/32`.
  - **Test harness DB leak** (2026-07-04, hub `e203106`) —
    `create_test_db()` returns a `TestDbGuard` whose `Drop` issues
    `DROP DATABASE … WITH (FORCE)` (via a dedicated OS thread so it fires
    on panic too); verified 0→0 leaked DBs across back-to-back full-suite
    runs. A `db_sweep` `#[ignore]`d test clears any backlog. The farm/seed
    equivalent is still open (ROADMAP Known issues).

- **Multi-device pairing + home-hub write (web, 2026-07-04)** — ported the
  identity envelopes that were Rust-only into `packages/core`
  (`master`/`wire`/`ecies`, byte-for-byte pinned by the `wavvon-identity` hex
  vectors), then built the two features it unblocked: publishing a
  master-signed home-hub list, and full device pairing (offer → claim →
  approve → cert), device list + revoke. Auth now presents the subkey cert and
  records the canonical pubkey, so a paired device is recognised as the same
  user. `e2e/live/27` (home hubs) + `28` (pairing). Closes the last two web
  parity gaps — see [`client-parity.md`](client-parity.md).

- **Web e2e live-test suite + 2026-07-04 batch live pass** — new
  `apps/web/e2e/live/` Playwright suite runs against a real hub (owner
  seeded via `WAVVON_OWNER_PUBKEY`; see `e2e/live/README.md`). Covers
  smoke (onboard/join/send), nested-channel permalinks + drill-in +
  breadcrumbs, channel permission overwrites, role categories +
  color/icon, event slots + reminders, temp-voice spawner (1fc5aa6
  regression), soundboard upload/delete, and full-archive export. Bugs
  found + fixed during the pass:
  - **W (web): channel live-push broken for newly-created channels** —
    the web client never sent the WS `subscribe` frame (the platform
    `subscribeChannel` hit a non-existent HTTP route), so messages in a
    channel created after connect never pushed live. Now sends the WS
    frame and subscribes on channel select.
  - **W (web): event creation fully broken** — composer never sent
    `channel_id` (hub 400), and the bare create-response (no
    `rsvp_counts`/`slots`) crashed `EventCard`; threaded `channel_id`
    through and refetch after create.
  - **W (web): modal clipped tall content** — `.modal` had no
    `max-height`, so the channel Permissions tab's Save/actions row was
    pushed off-screen. Added `max-height`/`overflow-y`.

- **Web e2e round 2 — profile / member list / channel CRUD / roles
  (2026-07-04)** — added `e2e/live/09..12`: profile-edit propagation, member
  presence, channel/category/forum/banner CRUD, and role-assignment. Bug
  found + fixed:
  - **W (web): i18n placeholders shown literally** — 11 catalog entries
    used i18next double-brace `{{name}}` syntax, but the client uses
    **i18next-icu** (single-brace `{name}`), so they rendered the raw
    `{{name}}` to users. Most visible on the channel/category right-click
    menu (`Edit "{{name}}"` / `Delete "{{name}}"`); also user profile
    "Joined", archive strength/progress, invite/discovery hints. Converted
    all to single-brace in `packages/i18n/en.json`.

- **Web: assign/remove roles from the member right-click menu (2026-07-04)**
  — closed the biggest client discrepancy found in round 2. The web
  `UserContextMenu` now has a "Roles" section (gated on `manage_roles`,
  hides `@everyone` and roles at/above the viewer's priority) that toggles
  `PUT`/`DELETE /users/{pubkey}/roles/{role_id}`; member list regroups on
  change. New platform commands `assignRoleToUser`/`removeRoleFromUser`/
  `listUserRoles`; covered by `12-role-assignment.spec.ts`. Cross-client
  parity is tracked in [`client-parity.md`](client-parity.md)
  (**android still lacks it**; desktop has a near-identical version to
  align).

- **Soundboard — web UI (2026-07-04)** — clients `eed7c04`.
  **Client-side mix is real** (`mixClipIntoFrame` in `platform/voice.ts`):
  a clip decoded via `AudioContext.decodeAudioData` (handles Opus-in-Ogg,
  resamples to 48kHz, mono downmix) is sample-added onto each mic frame
  with a `[-1,1]` clamp *before* the int16 quantize + Opus encode, so
  it's baked into the sender's own outgoing stream (zero relay change,
  per soundboard.md §1). Voice-bar `SoundboardPopover`, hub-admin
  `SoundboardAdminSection` (upload/list/delete + local preview),
  `soundboard_played` chips via `useSoundboardChips`. Rate-limited to
  one clip at a time. 109 web tests green. **Caveat**: the `use_soundboard`
  play-gate is checked against hub-wide roles, not channel-scoped
  overwrites (see the "no member-facing channel-perms endpoint"
  follow-up in ROADMAP) — the server still enforces the real
  channel-scoped check on `played`, so a denied member's play 403s.

- **Soundboard + bot audio injection — server (2026-07-04)** —
  [`soundboard.md`](soundboard.md), hub `ef9beed`. `soundboard_clips`
  table; `use_soundboard`/`manage_soundboard` permissions (in
  `ALL_PERMISSIONS`, so channel-deniable); list/upload/delete/audio/
  played routes with Opus-in-Ogg validation (OggS + OpusHead, duration
  from the final page granule) and hard caps (≤10s / ≤512KB / ≤50
  clips); `soundboard_played` WS attribution event (channel-scoped
  fan-out; enforcement is the `use_soundboard` check, not audio
  inspection). **Bot audio injection (Part B) also shipped**: external
  `is_bot` sessions on `/voice/ws` are gated on the `can_speak_voice`
  capability + channel `read_messages` before relay registration; the
  older self-service `/bots/:id/voice/join` REST helper predates the
  capability model and was left untouched. 11 soundboard + 2 bot-voice
  tests. Web UI (voice-bar popover, client-side PCM mix, admin manage,
  `played` chip) is the next pass.

- **Join-to-create temporary voice channels — web UI (2026-07-04)** —
  clients `fb607de`. Spawner option + "room name template" field in
  `CreateChannelModal`; spawner rows click-to-voice-join (no
  unread/draft/voice badges); temp rooms show a "Temporary" badge +
  owner tooltip; voice UI state re-keyed off the *resolved* channel id
  from the join reply. `channels_updated` was already handled by the
  web WS layer, so temp spawn/GC refetch works for free.
  **⚠️ Does not yet function end-to-end on web** — see the `voice_ws.rs`
  spawner gap in ROADMAP Known issues: web's `/voice/ws` transport
  never got the spawn-detection the main-hub-WS path did, so clicking a
  spawner currently joins the spawner row itself. The web client is
  correct-by-construction (uses the reply's resolved id); the hub-side
  gap is the blocker.

- **Join-to-create temporary voice channels — server (2026-07-04)** —
  [`temp-voice-channels.md`](temp-voice-channels.md), hub `3005fc5`.
  Additive `channels` columns (`is_temporary`, `owner_pubkey`,
  `spawner_name_template`, `empty_since`); `channel_type = 'spawner'`
  validated on create; voice-join against a spawner runs
  `spawn_temp_channel()` (sibling placement under the spawner's parent,
  `{user}` template substitution, numbered-suffix collision retry) and
  the `voice_joined` reply carries the spawned room's id;
  `temp_channel_worker.rs` 30s tick stamps `empty_since` and GCs rooms
  past a 60s grace (boot-sweep via the same path); owner-rename
  carve-out in `update_channel`. 7 integration tests. **Deviation**:
  the doc specified a new `channel_list_changed` WS event, but the
  codebase already had an equivalent payload-free `channels_updated`
  event (fired on channel create/update/reorder/delete) — reused it for
  spawn/GC rather than fragment the wire protocol. Web consumes
  `channels_updated`, not `channel_list_changed`. Web UI (spawner
  creation option, temp-room badge) is the next pass.

- **Personal data export — export half (2026-07-04)** —
  [`data-export.md`](data-export.md), web only (clients `542891e`).
  Client-assembled passphrase-encrypted archive (no server changes —
  the DM route is unpaginated so one fetch per conversation = complete
  history). New `archiveCrypto.ts` ships a self-contained
  `wavvon-archive` envelope: Argon2id (64 MiB/t=3/p=1, `@noble/hashes`)
  → AES-256-GCM (WebCrypto); **deliberately not** byte-matched to the
  desktop identity-backup format (cross-client compat deferred).
  `dataExport.ts` assembles identity (incl. seed material, matching the
  identity-backup policy), home-hub designations, device certs +
  revocations, full per-peer DM history, active theme, and local
  drafts; aborts on any fetch failure rather than shipping a partial
  archive. `FullArchiveSection.tsx` settings card (passphrase +
  plaintext-DM warning + progress). **Gap**: web has no decrypt path
  for the hub-synced E2E prefs blob, so `prefs` is a local-only
  snapshot with a `gap_note` in the archive — wiring the real blob
  decrypt is a follow-up. **Import/restore deferred** (§5); only the
  export half shipped. 83 web tests green.

- **Event role-slot sign-ups + reminders, web client (2026-07-04)** —
  [`events.md`](events.md) §2-§3, clients `dea0df0` (server side
  shipped separately, hub `825b0da`). `EventComposer.tsx` gained a
  slot editor (add/remove name+capacity rows, folded into the create
  payload) and a reminder offset picker (Off/15m/1h/24h); `EventCard.tsx`
  now renders a read-only reminder line and delegates slot rows to a
  new `EventSlotList.tsx` (claim/unclaim via `POST /events/:id/rsvp`
  with/without `slot_id`, claimed slot bolded, claimants by short
  pubkey, 409/404 surfaced inline). New `EventSlotEditor.tsx` keeps the
  composer under the ~200-line convention. Platform adapter gained
  `createEventSlot`/`updateEventSlot`/`deleteEventSlot` (not yet wired
  to a UI — no post-creation slot-management surface exists yet).
  Fixed a pre-existing bug where the web `HubEvent` type used `end_at`
  while the hub's field is `ends_at` (silently dropped on create).
  Pure slot/reminder logic (fill-state, claim/unclaim payloads,
  reminder-offset↔minutes mapping) covered by vitest. Desktop/Android
  UI not yet built.

- **Discord server import CLI (2026-07-04)** — new
  `crates/discord-import` workspace crate implementing
  [`discord-import.md`](discord-import.md) (server `a85e37f`).
  `export --guild <id>` reads structure via a read-only bot
  (Discord API v10, 429-aware) into the neutral versioned manifest;
  `apply --hub <url>` replays it onto a fresh hub (demo-seed-style
  auth, fail-forward, created/skipped/warnings report with PARTIAL
  banner). Pure fixture-tested layers (mapping, permission-bit table
  bits 0–50, plan/topological ordering, report rendering; 29 unit
  tests) around thin reqwest executors. Role colors applied directly
  (role appearance had shipped by then — the doc's "once color ships"
  clause resolved in the same day). NOT yet exercised live against a
  real guild or running hub — fixture-only by design; live e2e is the
  remaining step.

- **Role categories + role color/icon, web client (2026-07-04)** —
  [`role-categories.md`](role-categories.md) §4, clients `a6b2d24`
  (server side shipped separately, hub `31c291b`). Types + platform
  adapter (`listRoles`/`createRole`/`updateRole`/`deleteRole`,
  `listRoleCategories`/`createRoleCategory`/`updateRoleCategory`/
  `deleteRoleCategory`, tri-state null-clearing payload builders with
  vitest coverage). Hub-admin Roles tab now lists every hub role
  (previously it rendered only the current user's own roles — a
  pre-existing gap, not a regression) grouped under category headers,
  with a `RoleCategoryManager` for create/rename/recolor/re-icon/
  reorder(up-down)/delete, and per-role category dropdown + color
  swatch + `EmojiPicker` icon controls. User profile card groups
  `profile.roles` by category with a trailing uncategorized group;
  role badges tint border/text via `color-mix()` against the theme's
  own foreground (not the raw hex) to keep contrast in both themes.
  Categories cached module-level in `UserProfileCard.tsx` keyed by hub
  id. Member sidebar untouched per the doc's decided scope. Desktop/
  Android parity not started — see Wishlist.

- **Deep-nesting sidebar (2026-07-04)** — §2 of
  [`nested-channels-ux.md`](nested-channels-ux.md), web only (clients
  `2289304`). Capped indent (`min(depth,5)×12px` + `aria-hidden` depth
  marker past the cap; true depth kept in `aria-level`); drill-in via a
  dedicated ⤢ button on categories at depth ≥4 (button, not header
  click — the header is a drag handle) re-rooting the sidebar with a
  `channelPath` back-crumb, aria-live announcement, and real focus
  movement. Cross-boundary drags while drilled-in are blocked for free
  by the existing render-what's-visible dnd architecture. Pure helpers
  in `channelSidebarLayout.ts` with vitest coverage. **Also fixed a
  latent bug**: sidebar arrow-key navigation had never focused real DOM
  elements (`channelItemRefs` was never populated) — keyboard nav works
  for the first time. With §1 and §3 shipped this completes
  `nested-channels-ux.md` entirely.

- **Channel permalinks (2026-07-04)** — §1 of
  [`nested-channels-ux.md`](nested-channels-ux.md), web only (clients
  `bed7fe3`). `parseHubInput` now returns an optional `target`
  (`channel/{id}` / `channel/{id}/message/{id}`), fixing
  message-permalink navigation as a side effect (the web
  scroll-to-message handler was a no-op — now real, also used by
  reply-jump/pinned-jump). `channelPath()` helper in `packages/core`
  (cycle-guarded); deep-link targets carried through the add-hub flow;
  "Copy channel link" in the channel context menu + header button
  (no overflow-menu precedent existed, so an icon button); breadcrumb
  header with clickable category crumbs scrolling the sidebar.
  `packages/core` gained its own vitest script (17 new tests) — which
  surfaced the stale `voxply/` crypto test vectors now in ROADMAP
  Known issues. First-run zero-hub permalink carry-through
  deliberately not wired (edge case; `AddHubModal` path only).

- **Channel permission overwrites (2026-07-04)** — the §3 "cascade like a
  file system" mechanism from [`nested-channels-ux.md`](nested-channels-ux.md).
  Server (hub `5912459`): `channel_permission_overwrites` table;
  `channel_permissions()` resolver (root→target fold, allow-wins at same
  level, child-over-parent, `admin` immune); channel-scoped checks in
  messages/posts/channels, WS auto-subscribe, and voice join (gated on
  channel-scoped `read_messages` — no voice-specific constant exists);
  nested channel creation checks `MANAGE_CHANNELS` on the parent;
  channel-list read-gating server-side; GET/PUT/DELETE
  `/channels/:id/permissions[/:role_id]` with audit-log entries; 7
  integration tests in `hub/tests/channel_permissions_flow.rs`. Client,
  web only (clients `a4e1366`): tri-state Permissions tab
  (`ChannelPermissionsTab.tsx`, ghost inherited values, override dots,
  Save/Reset per role) in `ChannelSettingsModal.tsx`, three
  `platform/commands/channelPermissions.ts` adapter functions,
  empty-category suppression in the sidebar for non-admins, i18n ×4
  locales, 7 unit tests. Not yet visually verified in a running client;
  desktop/Android UI parity deferred per delivery-target decision.

- **Outgoing webhooks (2026-07-02)** — admin registers external HTTPS URLs;
  hub POSTs HMAC-SHA256-signed `hub_event` envelopes on matching events
  (fire-and-forget, no bot identity/WS session needed). New
  `hub/src/outgoing_webhooks/` module: 9 admin routes (added a `GET
  .../subscriptions` read-back beyond the original 8-route spec so the UI
  can pre-fill the subscription editor instead of blind-overwriting it),
  delivery worker with 4-attempt retry (5s/30s/5min), auto-disable after 5
  consecutive failures, last-200 delivery log per webhook. Dispatch hooks
  directly into `publish_hub_event` (`bots/events.rs`) — the design doc
  originally described a broadcast channel that doesn't exist in this
  codebase; doc corrected to match. Web admin UI only (desktop deferred
  per delivery-target decision): `OutgoingWebhooksSection.tsx` +
  `EventSubscriptionEditor.tsx` (new, reusable — bots don't have an event
  subscription UI yet) + `platform/commands/outgoingWebhooks.ts`. 13
  integration tests in `hub/tests/outgoing_webhooks_flow.rs`. See
  [`outgoing-webhooks.md`](outgoing-webhooks.md).

- **Moderation enhancements ME1/ME2/ME3 (2026-07-02)** — ME1: `federated_ban_sources`
  + `federated_ban_overrides` tables; admin CRUD routes at `/admin/banlist/sources|entries|overrides`
  and `/admin/settings/banlist`; banlist_worker reads per-source policy; auth layer
  applies whitelist/blacklist overrides. ME2: `WebhookCircuit` in `AppState`; circuit
  breaker on 3× 5xx in 60s → 10-min backoff; `GET /admin/settings/moderation` exposes
  state. ME3: server was already shipped; web client adds report button on messages +
  admin Reports queue. Web admin Moderation tab covers all three features.

- **Code audit — all 46 findings resolved (2026-06-27)** — H9 CORS warn, H11
  get_messages N+1 → 3 bulk queries, H14 list_members N+M+1 → 3 queries + LIMIT
  1000, H15 farm-token auth 5 reads → 1 query, H16 federated DM delivery
  background tokio::spawn, H17 tantivy Mutex unwrap, H20 chat broadcast capacity
  256→4096, H21 handle_typing ban check, H22 badge-offer rate-limit + duplicate
  guard, H23 preview SSRF proxy-aware + redirect IP guard. DB indexes H12/H13
  verified present. W25/W27 already fixed by monorepo consolidation + identity
  refactor. Full finding list: [`code-audit-2026-06-11.md`](code-audit-2026-06-11.md).

- **Per-hub subkey revocation propagation (2026-06-30)** — background worker polls
  each master key's home hub every 6 hours, verifies Ed25519 signatures, and inserts
  new revocations into the local `subkey_revocations` table. See
  `subkey_revocation_worker.rs`.

- **First user silently becomes hub owner — fixed (2026-06-27)** — removed
  auto-grant from `assign_initial_roles`; hub now starts ownerless and warns on
  startup when `WAVVON_OWNER_PUBKEY` is unset. Found live on videogamezone pilot.

- **Design review + pilot feedback resolved (2026-06-27)** — all 10 web client
  design-review items and all desktop pilot-feedback items (D1–D9) fixed: composer
  layout, poll fetch on channel switch, i18n wiring, display-name prompt, message
  anatomy, voice control bar, emoji picker, chat column max-width, channel hash
  glyph, WelcomeScreen browse wiring, whisper portal, camera picker, leave-voice
  button, screen-share picker thumbnails, role submenu, banner channel editing.
  Details: [`design-review-2026-06-13.md`](design-review-2026-06-13.md) and
  [`pilot-feedback-2026-06-12.md`](pilot-feedback-2026-06-12.md).

- **Forum reactions + attachments (2026-07-01)** — `post_reactions` and
  `reply_reactions` tables added; `attachments` JSON column on `posts` and
  `post_replies`; four new endpoints (`POST/DELETE /posts/:pid/reactions`,
  `POST/DELETE /replies/:rid/reactions`); reactions and attachments included in
  `PostDetail` and `ReplyView`; 6 integration tests in `forum_flow.rs`. Web client:
  `ReactionBar` component on posts and replies, attachment list + file picker shell
  in `ForumComposer`, Playwright E2E test suite (5 tests, mocked API).

- **`cargo test --workspace` works on Windows (2026-07-01)** — two blockers
  fixed: (1) `webauthn-rs-core` depends directly on `openssl-sys`; resolved by
  adding `openssl = { version = "0.10", features = ["vendored"] }` to
  `hub/Cargo.toml` (forces a source build; requires cmake and Strawberry Perl, both
  now installed as dev tools) and switching `wavvon-seed`'s `reqwest` to
  `default-features = false, features = ["json", "rustls-tls"]`. (2)
  `create_test_db()` needs a live PostgreSQL; `server/docker-compose.dev.yml` added
  (`docker compose -f docker-compose.dev.yml up -d` before running tests).

- **Remove games feature (2026-07-01)** — replaced by bots; iframe/session
  infrastructure dead weight. All 11 sub-tasks (S1–S5, D1–D3, W1, A1, Docs)
  completed: hub routes/WS/farm game handling removed; `GameStore` trait and
  database tables dropped; desktop/web/android client game modals and state removed;
  docs updated (`gaming.md` and `games-sdk.md` deleted; `/games/*` removed from
  openapi.yaml and ws-protocol.md; bot deferred-scope known issue updated).

- **Bot mini-apps + bot media (2026-07-01)** — generic mechanism for bots to
  embed interactive web experiences and inject audio/video into channels.
  All 9 sub-tasks (M1–M8, Docs) completed: `mini_app_url` field added to bot
  registration; `bot_app_launch`/`join`/`open`/`close` WS messages implemented;
  hub endpoints for bot voice and screen-share (`POST/DELETE /bots/{id}/voice/*`,
  `POST/DELETE /bots/{id}/screenshare/*`); desktop/web/android clients open
  sandboxed webviews/iframes with injected token and hub context; camera
  permission CSP plumbed; docs updated with WS protocol and operator guide.

- **Fix the aarch64 hub binary build (2026-07-01)** — replaced
  `aarch64-linux-gnu-gcc` (GNU ABI, incompatible with musl) with
  `cargo-zigbuild` (Zig provides its own musl headers; handles aws-lc-sys/ring
  C objects cleanly). x86_64 and Docker builds unchanged.

- **Voice enhancements V1–V4 (2026-07-01)** — four sequenced improvements to
  the voice pipeline. All four phases completed:
  - **V1 — Per-participant volume control** — hub and desktop already fully done;
    web and Android wired: per-sender `GainNode` in `voice.ts`, `ChannelSidebar`
    gain slider, `App.tsx` wiring, Android `set_voice_gain` Tauri command +
    `StoredVoiceSettings`. Vitest 4/4.
  - **V2 — Voice audio quality profiles** — `AudioProfileSection` moved to
    `packages/ui`; desktop re-exports as shim; web `SettingsPage` Voice tab
    wired; Android `StoredVoiceSettings` extended. Workspace typecheck clean.
  - **V3 — Proximity voice** — hub side pre-existing; server integration tests
    (`proximity_voice_flow.rs`, 4 tests) + web client attenuation shipped:
    `computeAttenuation()` (4 models), zone lifecycle handlers,
    `recomputeAllProximityGains` on every position update; WS dispatch in
    `ws.ts`. 18 vitest tests.
  - **V4 — Voice encryption (Phase 2)** — AES-256-GCM per-packet on Opus stream;
    hub relays ciphertext transparently; `VoiceKeyOffer`/`VoiceKeyReceived`/
    `VoiceKeyRequest` WS key distribution with X25519 ECDH; `ws_key_senders`
    map in AppState for targeted delivery. 4 integration tests.

- **Hub creation wizard (2026-07-01)** — zero-to-live path for new operators.
  All three pieces shipped:
  - **HW1 — Template catalog on discovery** — `POST/DELETE /api/templates/register`
    (Ed25519-signed, ownership-checked); 8 vitest tests.
  - **HW2 — First-run bootstrap in hub** — `maybe_bootstrap()` fetches template
    URL, applies channels/roles/settings/welcome message; 4 integration tests.
  - **HW3 — Creation wizard on discovery** — `/new` web flow generates
    `docker-compose.yml` download.

- **E2E v2 — Double Ratchet (2026-06-30)** — 1:1 DMs upgraded from static ECDH
  to Signal Double Ratchet: per-message forward secrecy and post-compromise
  recovery. Session init via 2DH (static × static seeds root key; ephemeral ×
  static seeds first sending chain). KDF_RK / KDF_CK / derive_nonce via
  HKDF-SHA256 with `wavvon/dr-*` domain strings. v2 envelope adds `v`,
  `message_index`, `prev_count`; no `nonce_hex` (nonce derived from msg key).
  Skipped-key cache (cap 1000) handles out-of-order delivery. Implemented in:
  identity crate (`dr_envelope_signing_bytes`), hub models + signing dispatch,
  Tauri `dm.rs` (`init_dr_session`, `encrypt_dm_dr`, `decrypt_dm_dr` commands),
  TypeScript `core/crypto.ts` (`initDrSession`, `encryptDmDr`, `decryptDmDr`).
  Group DMs keep the sender-key scheme; X3DH one-time prekeys are v3.

- **Passkey login in AddHubModal (2026-06-30)** — "Sign in with passkey" button
  appears in the modal when the hub is reachable, WebAuthn is supported, and the
  user has a public key. Runs the assertion ceremony via `authenticateWithPasskey()`,
  then passes the session token to `addHub({ sessionToken })` to skip the Ed25519
  challenge flow. Error handling and loading state shared with the standard Connect
  path.

- **Client-side passkey flows (2026-06-30)** — web client: `platform/webauthn.ts`
  with full passkey registration + assertion ceremony (manual base64url/ArrayBuffer
  conversion, no external dependency), plus management API calls (list/delete/rename
  passkeys, list/revoke trusted devices) via hubFetch; PasskeySection and
  TrustedDevicesSection added to the Account tab; `addHub()` accepts `sessionToken`
  to allow passkey-obtained tokens to bypass Ed25519 auth. Desktop: five new Tauri
  commands (`passkey_list/delete/rename`, `trusted_device_list/revoke`) using the
  shared http_client + stored session token; PasskeySection + TrustedDevicesSection
  wired into the Security tab (view/rename/remove only — desktop cannot register
  passkeys due to Tauri webview RP ID mismatch with the hub's domain).

- **WebAuthn/passkey auth — hub server layer (2026-06-30)** — hub now supports
  passkey registration and login via webauthn-rs 0.5 as a parallel auth path
  alongside the existing Ed25519 challenge/verify flow. New endpoints:
  `POST /auth/webauthn/begin` + `/finish` (register a passkey),
  `POST /auth/webauthn/assert/begin` + `/finish` (authenticate),
  `POST /auth/device-token/create` (mint a 30-day "Trust this device" token),
  `POST /auth/device-token/redeem` (exchange for session token; rotates on use).
  Credential management at `GET/PATCH/DELETE /me/credentials`; trusted device
  management at `GET/DELETE /me/devices`. `rp_id` derived from
  `WAVVON_PUBLIC_URL` hostname; override via `WAVVON_WEBAUTHN_RP_ID`. Device
  token TTL configurable via `WAVVON_DEVICE_TOKEN_TTL_DAYS` (default 30).
  New DB tables: `webauthn_credentials`, `device_tokens`. Eight integration
  tests in `hub/tests/webauthn_flow.rs`.

- **Per-hub subkey revocation propagation (2026-06-30)** — background worker
  (`subkey_revocation_worker`) discovers all distinct `(master_pubkey,
  home_hub_url)` pairs from `subkey_certs`, polls
  `GET /identity/{master}/revocations?since={cursor}` on each home hub every
  6 hours, verifies the Ed25519 signature on each entry, inserts valid
  revocations into `subkey_revocations` with `ON CONFLICT DO NOTHING`, and
  advances the cursor with `GREATEST()`. `GET /identity/{master}/revocations`
  endpoint gained a `?since=` query param. New `subkey_revocation_sync`
  migration table tracks per-`(master, hub)` cursor. Five integration tests
  in `hub/tests/subkey_revocation_relay_flow.rs`.

- **Cross-farm cert revocation relay (2026-06-29)** — hub now polls every
  remote cert issuer it knows about for revocations. A new
  `cert_revocation_sync` table tracks the per-issuer cursor; a background
  worker (`cert_revocation_worker`) fires 2 min after startup then every 6
  hours: discovers all distinct `(issuer_pubkey, issuer_url)` pairs in
  `user_certs`, calls `GET {issuer_url}/certs/revocations?since={cursor}`
  on each, deletes the matching `user_certs` rows, and advances the cursor
  with `GREATEST()` so it never goes backwards. Unreachable issuers are
  silently skipped (certs retained). Five integration tests in
  `hub/tests/cert_revocation_relay_flow.rs`.

- **Farm agent WS token moved to first message frame (2026-06-29)** — token no
  longer appears in the `/ws/agent` URL and therefore in access logs. Agent now
  connects to `/ws/agent` (no query param) and sends
  `{"type":"hello","version":"...","token":"<hex>"}` as its first frame; server
  validates token there before registering the connection. Invalid or missing
  token receives `{"type":"error","code":"auth_failed"}` and the socket closes.

- **Timestamp hygiene complete (2026-06-29)** — five farm route files each
  had a private copy of `unix_now()`; consolidated into a single `pub fn
  unix_now()` in `wavvon-farm/src/lib.rs`. Seven hub test-migration columns
  (`channel_voice_mutes.muted_at`, `raise_hand_requests.requested_at`,
  `badge_offers.created_at`, `hub_badges.accepted_at`,
  `issued_badges.issued_at/expires_at/revoked_at`) changed TEXT → BIGINT;
  handlers and response models updated to use `i64`. `"chrono"` sqlx feature
  removed from workspace `Cargo.toml`. `iso_from_unix` unified into a single
  `pub fn` in `auth/handlers.rs`; `badges.rs` local copy deleted.

- **Full PostgreSQL backend (2026-06-27)** — SQLite removed from the server
  entirely; `wavvon-store-sqlite` crate deleted and replaced by
  `wavvon-store-postgres`. sqlx features trimmed to `postgres + runtime-tokio
  + macros + chrono + uuid`; hub, seed, and farm all use `PgPool`/`PgPoolOptions`.
  New `wavvon-store-postgres` crate (19 impl files) covers every `HubStore`
  sub-trait with PostgreSQL DDL. All 18 hub integration test files updated to
  create a fresh isolated PostgreSQL database per test (UUID-named, migrations
  pre-applied) via `create_test_db()` in `tests/common.rs`. CI gains a
  `postgres:16-alpine` service container with health checks and `TEST_DATABASE_URL`
  wired to `cargo test`.

- **Web client stabilisation pass (2026-06-22/23)** —
  Welcome screen gated on `hubs.length === 0`; "Hosted by [url]" link added to
  `WelcomeScreen` and `AddHubModal` hub preview cards.
  `CreateChannelModal` wired from all three entry points; added Banner and
  Category types alongside Text and Forum. `ChannelSettingsModal` created —
  pre-filled name/description edit, two-step delete confirmation; accessible via
  gear icon and right-click context menu. WS event audit: `forum_event`, all
  screen-share signalling, and video/whisper events wired into `ws.ts` dispatch.
  Profile: `SettingsPage` calls `onProfileSaved` after `PATCH /me`; `App.tsx`
  re-fetches `/me` and `/users` so display name updates immediately.

- **Web client audit remainder (W5–W24) — 13 findings fixed (2026-06-14)** —
  W5: reactions broadcast preserves `me` flag. W7: `voice_participant_speaking`
  wired; speaking ring lights. W9: `dm_member_changed` WS event handled. W11:
  poll event names fixed; `onPin`/`onPoll` wired. W14: events types corrected
  (`starts_at`, `rsvp_counts`); RSVP uses POST/cancel. W15: farm unsuspend
  uses correct endpoint. W17: pending-approval hub shows landing screen. W18:
  alliance shared channels fetched on hub connect. W19: mention pings play audio
  + OS notification on permission. W20: `pingHub` called on interval. W21:
  `UserContextMenu` wired; right-click on members works. W22: group-DM
  `group_encrypted_envelope` handled. W23: scroll position tracked; "N new
  messages" pill wired. W24: unmounted components cleanup.

- **CI build fixes (2026-06-14)** — Android: `@noble/curves` and
  `@noble/hashes` added as direct deps, resolving Rollup import failure.
  Desktop macOS: `xcap` bumped 0.0.14 → 0.9.6 (E0282 fixed); call sites in
  `screen_share.rs` updated for new API. Auto-tag correctly dispatches release
  workflows via `gh workflow run`.

- **App.tsx decomposition — channel-message, alliance, WS hooks (2026-06-14)** —
  desktop App.tsx 3,259 → ~1,450 lines; android App.tsx 993 → ~560 lines.
  Desktop: `useChannelMessages`, `useAlliances`, `useWsHandlers` extracted.
  Android: same three hooks; stableHandlers wired via stable setter refs.
  pnpm typecheck clean across all three apps.

- **Desktop voice/composer UI pass + web screen-share viewing (2026-06-13)** —
  attach+poll collapsed into a "+" menu in desktop `ChannelComposer`; voice
  control bar buttons replaced with SVG icons; joining a new voice channel now
  implicitly leaves the current one; camera button enumerates devices on first
  enable; screen-share source grid gains `max-height`. Web screen-share VIEWING
  now works — `HubWebSocket` gains binary frame support and `App.tsx` wires
  `activeScreenShares` state through to the existing `ScreenShareViewer`.

- **Hub: first-user-becomes-owner bug fixed (2026-06-13)** — `assign_initial_roles`
  now skips the auto-owner grant when `WAVVON_OWNER_PUBKEY` is configured.
  `AppState` gains `owner_pubkey: Option<String>`.

- **H4 federated-DM sender spoofing fixed (2026-06-13)** — Ed25519
  signature verification is enforced on all three receive-federated-DM
  paths (encrypted, group-encrypted, plaintext) in
  `hub/src/routes/dms/messages.rs`. All hub audit findings from the
  2026-06-11 audit are now resolved.

- **Web voice via WebSocket audio relay (2026-06-13)** — browsers cannot send
  raw UDP, so hub gains a `/voice/ws` WebSocket endpoint; web clients
  authenticate with the session token + channel_id, receive a `voice_ws_ready`
  JSON frame, then exchange binary Opus frames. Hub fan-out routes to both UDP
  (desktop/android) and WS (web) participants. Web client gains `opusscript`
  (WASM Opus encoder/decoder) and a new `VoiceWsSession` class. All four clients
  now participate in shared voice channels.

- **Client monorepo consolidation — all 5 stages complete (2026-06-13)** —
  Wavvon-desktop, Wavvon-web, and Wavvon-android collapsed into the single
  Wavvon-client pnpm + Cargo monorepo. Stage 0 (scaffold), Stage 1
  (`packages/core`), Stage 2 (`@wavvon/utils` + noble crypto), Stage 3
  (`packages/ui` + 10 shared components), Stage 4 (`packages/platform` +
  android collapse), Stage 5 (CI consolidated — path-gated per-app jobs).
  Double-React hazard eliminated, cross-repo Vite alias eliminated,
  dual-checkout release eliminated.

- **Hub optionally self-serves the web client (2026-06-13)** — new
  `WAVVON_WEB_CLIENT_DIR` setting. When set, hub serves a pre-built SPA at
  `/` via tower-http `ServeDir` with SPA deep-link fallback. `index.html`
  cached at startup with `window.__WAVVON_HOME_HUB__` injected. Official Docker
  image gains a `node:22-slim` web-builder stage. 7 integration tests in
  `hub/tests/web_client_flow.rs`.

- **Networked voice Phase 1 — token-gated source-address learning (2026-06-12)**
  — hub relay no longer registers clients as 127.0.0.1. On `voice_join` the hub
  mints a 32-byte single-use UDP register token delivered in the `voice_joined`
  WS reply. The client sends a VXRG packet; the hub binds the real source address
  into `voice_addr_map` and replies VXRA. Fan-out gated on `voice_addr_map`
  membership. Five new integration tests in `hub/tests/voice_relay_flow.rs`.

- **H5/H6 rate-limiter trusted-proxy + IPv6 canonicalization (2026-06-12)** —
  `rate_limit.rs` gains `WAVVON_TRUSTED_PROXY` setting. When enabled, real
  client IP derived from last `X-Forwarded-For` entry. All IPs canonicalized:
  IPv4-mapped IPv6 collapses to plain IPv4; genuine IPv6 bucketed at /64 prefix.
  6 new unit tests.

- **H2/H3 presence refcount + bot_sessions per-session (2026-06-12)** —
  `online_users` changed from `HashSet` to `HashMap<String, usize>` (refcounted).
  `bot_sessions` changed from `HashMap<pubkey, Sender>` to
  `HashMap<pubkey, HashMap<session_id, Sender>>`; each WS session registers
  under its own UUID. 4 new tests in `hub/tests/presence_multi_session_flow.rs`.

- **Hub CORS layer + self-describing CLI (2026-06-11)** — `WAVVON_CORS_ORIGINS`
  env-var wires a tower-http `CorsLayer`; `--help` prints a generated env-var
  table, `--version` prints version, `--doctor` runs pre-flight checks. Startup
  banner logs effective port, scheme, UDP port, TLS state, CORS origins, and
  data-file paths. Four CORS integration tests added.

- **Real screenshots + join-flow GIF in READMEs; web client fixes; demo-seed tool (2026-06-11)** —
  screenshots and join-flow GIFs added to main/desktop/web/hub READMEs; web
  client desktop layout CSS fix, message ordering fix, onboarding improvements,
  voice roster bootstrap via `GET /voice/participants`; demo-seed tool added.

- **Web onboarding styling + voice roster bootstrap (2026-06-11)** — web
  client onboarding screens now match the app's visual style; missing `button`,
  `input`/`textarea`/`select` base CSS rules and utility classes added.
  Voice roster now populated on connect via `GET /voice/participants`;
  `voice_roster_update`, `voice_participant_joined`, and `voice_participant_left`
  WS events handled individually.

- **demo-seed tool (2026-06-11)** — new `tools/demo-seed` binary; populates a
  fresh running hub with 8 identities, 5 channels under 4 categories, ~30
  realistic messages, a poll, a pinned welcome message, and emoji reactions.
  Reads `HUB_URL`; writes credentials to `demo-credentials.json`.

- **ContentArea.tsx ports to all forks (2026-06-11)** — web (1,157 → ~320-line
  composition root), android/wavvon-desktop (979 → ~290), android/wavvon-web
  (881 → ~280) now mirror desktop's `components/content/` shape. tsc clean in
  all three apps; vitest web 6/6, android 14/14.

- **ws/connection.rs dispatch refactor (2026-06-11)** — introduced `ConnState`
  and a `DispatchResult` enum; extracted all match-arm logic into per-domain
  handlers under `routes/ws/handlers/`: `voice.rs`, `screen.rs`, `game.rs`,
  `chat.rs`, `bot.rs`. `connection.rs` is now 605 lines (was 1,910). All 250+
  tests green.

- **ContentArea.tsx desktop split (2026-06-11)** — 1,383-line `ContentArea.tsx`
  split into 9 files under `components/content/`. `ContentArea.tsx` is now 688
  lines. Props interface and export signature unchanged. tsc clean, vitest
  71/71, vite build succeeds.

- **Signing-service removal + spec CI gate (2026-06-11)** — all signing-service
  steps removed from desktop CI; hub CI now fails when a registered route is
  missing from `openapi.yaml` (currently 201/201 documented).

- **Desktop lib.rs module split (2026-06-11)** — 9,844-line desktop
  `src-tauri/src/lib.rs` split into 28 domain modules; `lib.rs` is now ~350
  lines. Zero TS-side changes required. `cargo clippy -D warnings`, `cargo fmt
  --check`, and all 38 tests green.

- **Hub route module splits wave 2 (2026-06-11)** — directory-module conversions
  for `dms.rs` (1,305 → 4 files), `bots.rs` (1,236 → 5 files), `alliances.rs`
  (1,119 → 5 files), `moderation.rs` (1,016 → 5 files). Zero route-path or
  public-API changes.

- **Big-file refactor wave 1 + complete API spec (2026-06-11)** — hub
  `routes/ws.rs` (2,101 → 4 files) and `routes/games.rs` (1,617 → 6 files),
  android Tauri `lib.rs` (5,332 → 559 + 14 domain modules), web `App.tsx`
  (1,402 → 1,255 via extracted hooks). `openapi.yaml` now documents all 201 hub
  routes (103 were missing), verified by `docs/scripts/check-openapi-coverage.mjs`.

- **App.tsx decomposition batch 3 (2026-06-11)** — DM cluster extracted into
  `desktop/src/hooks/useDms.ts`. App.tsx: 3,461 → 3,259 lines.

- **App.tsx decomposition batch 2 (2026-06-11)** — `useHubAdmin`, `useFriends`,
  and `useSettingsProfile` extracted into `desktop/src/hooks/`. App.tsx:
  3,937 → 3,461 lines.

- **UDP voice relay tied to WS session (2026-06-10)** — added `voice_relay_active`
  set to `AppState`; `VoiceJoin` inserts, `leave_voice` removes; UDP receive loop
  rejects packets from pubkeys absent from the set. Five integration tests in
  `hub/tests/voice_relay_flow.rs`.

- **Farm/seed/server/voice security sweep (2026-06-10)** — WS agent channel made
  bounded; DB error during token lookup now closes the socket; heartbeat endpoint
  rejects unknown hub pubkeys on DB error; proxy body capped at 32 MiB;
  `public_key` added to `/farm/public-info`; `agent::run` survives malformed JSON;
  voice pipeline tasks no longer panic on Opus init failure. Eight new integration
  tests added.

- **Hub wishlist quick wins (2026-06-10)** — `GET /preview` rate-limited (10/min),
  `POST /admin/search/reindex` for operator-driven index rebuilds, `federated_bans`
  enforced on outbound messages and DMs, dead `game_session_left` WS variant removed.

- **Full CI test coverage across all repos (2026-06-10)** — vitest suites gated in
  CI for web (6 tests), android/wavvon-web (14 tests), desktop (71 tests), and
  discovery (28 tests); web gains i18n coverage check; android gains `cargo fmt
  --check` and `cargo clippy -D warnings` gates.

- **WebSocket protocol documented (2026-06-10)** — complete message-by-message
  wire reference in `docs/ws-protocol.md` (34 client→server, 55 server→client
  messages, verified against hub source).

- **Workspace hardening batch (2026-06-10)** — hub security fixes (WS session
  validation, atomic invites, SSRF DNS-rebinding, federated-ban check on farm
  tokens, upload headers), client race/cleanup fixes + error boundaries, android
  parity restored, shared `@wavvon/utils` package, wire-format spec with
  cross-client byte-level vector tests, CI gains fmt/clippy gates and SHA-pinned
  actions.

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

