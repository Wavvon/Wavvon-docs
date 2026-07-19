# Wavvon Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
design questions — lives in the wiki at [`docs/`](docs/README.md).
Shipped work goes straight to
[`docs/shipped-log.md`](docs/shipped-log.md) (no "recently shipped"
section here), and Known issues holds **open** issues only — when one is
fixed, its entry moves to the shipped log.

## 🔨 Next up

- [ ] **Networked voice — Phase 1, cross-internet test** — server + desktop
  shipped 2026-06-12/13; Android Tauri shell ported 2026-06-13; web voice
  shipped 2026-06-13 via WebSocket audio relay. All four clients complete.
  First cross-internet voice test pending (pilot hub). Phase 2 (voice
  encryption) is separate.
- [ ] **First external operator pilot (videogamezone.eu)** — hub **v0.3.1**
  LIVE (fresh install 2026-07-06: Postgres stack, new hub identity, all old
  data wiped by design; public URL currently `voxply.videogamezone.eu` —
  the wavvon hostname needs a server_name edit + friend's nginx reload).
  First-boot owner invite minted, pending redemption. Remaining: redeem
  owner invite, first cross-internet voice test, friend onboards +
  ownership transfer, doc-test feedback, two-operator federation test.

- [ ] **Shared-component consolidation (web → `packages/ui`)** — decided
  2026-07-18 ([decisions.md](docs/decisions.md)): web is the source of
  truth; new components ship into `packages/ui` (prop-only, loaders via
  props), duplicated ones are hoisted from the web copy when touched, and
  desktop-parity items are done by hoisting rather than porting. Batch 1
  (BotAppLaunchCard, ImagePicker, BotCard, EmojiPicker) SHIPPED 2026-07-18
  (clients `d5c9acd`, see [shipped-log.md](docs/shipped-log.md)).
  Next candidates: `CreateHubWizard`, then per-component alongside each
  desktop-parity item. Audit baseline: 61 duplicated components, 73% avg
  divergence.
## 🚧 Blocked

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity (the free OSS signing route requires it; paying for signing
  before there are users isn't worth it). Ship unsigned with the documented
  SmartScreen workaround meanwhile; all signing-service steps removed from CI.
  Options and design in [`code-signing.md`](docs/code-signing.md).

## 🔍 Flow-test findings (2026-07-06, private-hub + wizard flows)

- [x] ~~**Lobby soft-landing**~~ — fully SHIPPED: server half (hub `bded78c`),
  web UX (clients `c1f95d0`, sidebar badge + decision-logic extraction
  `1474561`), is_hub peer exemption (hub `8dc6739`, regression test
  `5d2b7a8`). Remaining niche gap: no blocking pre-join PoW flow for
  `lobby_enabled=false` hubs with `min_security_level>0` (honest 403 today).
- [x] ~~**Invite-first joining**~~ — SHIPPED (hub `10f3e2d`); web admin
  surface for role-granting invite creation SHIPPED 2026-07-11 (clients
  `68a1f73`, also fixed silently-dropped invite expiry).
- [x] ~~**Role-granting invites**~~ — SHIPPED (hub `10f3e2d`); the
  /join/:code path + redemption-time priority guard re-check SHIPPED
  2026-07-11 (hub `5d2b7a8`).
- [x] ~~**`wavvon-hub setup` interactive install wizard**~~ — SHIPPED (hub
  `89119a2`): interactive-or-scripted; emits docker-compose.yml (+ Postgres
  sidecar) + .env with a generated password, public/lan modes, optional
  --start; points the operator at the first-boot owner invite in the logs.
  QR deferred (code doesn't exist until first boot).

## 🔍 Manual-test feedback batch (2026-07-05, owner pass on v0.3.0)

~35 items filed; all shipped same day → [shipped-log.md](docs/shipped-log.md)
waves 1–3 (voice roster, kick/ban membership, timestamps, silence, admin
surfaces, welcome banner, survey→roles, …). Still open:

- [x] ~~**Create-anything from the channel right-click menu**~~ — SHIPPED
  (clients, 2026-07-11): the ctx menu gains "Create event" (mirrors the
  existing create-channel/category admin gate) and "Create poll" (gated on
  `send_messages`, matching the composer's own poll button), both reusing
  `EventComposer`/`PollComposer` as self-contained modals targeting the
  right-clicked channel. Forum post creation considered and **not** added —
  `ForumComposer` isn't modal-shaped (embedded in `ForumView`'s post
  list/detail navigation), so wiring it from the context menu would invent
  a new flow rather than reuse an existing one.
- [x] ~~**Create-hub-via-discovery from the + button**~~ — SHIPPED (clients
  `da250c9`): `+` gains a Join/Create fork (`CreateHubFork`); Join opens
  the existing `AddHubModal` unchanged, Create shows the self-host handoff
  panel (`CreateHubSelfHost`: web-wizard link, copyable `wavvon-hub setup`
  one-liner, owner-invite paste delegating to the existing invite-redeem
  path) or, only when the user already has a known farm from their joined
  hubs' `/info.farm_url`, the pre-existing farm `CreateHubWizard` as a
  sibling exit (per-farm cards already disable on unreachable/quota-
  exceeded, so no dead option ships). **Found + fixed 2026-07-11**: the
  fork's own popover was rendered as `position: absolute` inside
  `.hub-sidebar`, which sets `overflow-x: hidden` — the popover was in the
  DOM but silently clipped, never actually visible. Rebuilt on the
  `context-menu`/`context-menu-overlay` fixed-position pattern (matching
  the channel right-click menu) and wired the `+` button's title and the
  two menu entries to the `hub.add_or_create`/`hub.join`/`hub.create` i18n
  keys, which already existed but were unused.
- [x] ~~**Multiple named custom themes per user**~~ — SHIPPED (clients
  `afc07a8`): named theme store with apply/rename/duplicate/delete, legacy
  single-skin migrated, gallery imports create new entries. (web;
  desktop single-slot copy still to port.)
- [x] ~~**AddHubModal has no i18n**~~ — SHIPPED (clients `71d1b51`); the
  `hub.admin.overview.*` de/es placeholders are also translated now.

## 📌 Wishlist (undesigned)


> **Big future pillars** (full writeups in
> [future-features.md](docs/future-features.md)): **1. Farm layer** — the
> major architectural next step (multi-hub control plane;
> [farm-model.md](docs/farm-model.md); farm-ready invites already landed).
> **2. Cross-farm certification relay** — follows the farm layer.
> **3. Gaming + rich bots** — one theme: give bots a Telegram-class runtime
> (interactive UI, audio, video) and games fall out ([gaming.md](docs/gaming.md)).

- **Farm layer** — multi-hub control plane; farm-ready invites shipped with hub serial in URLs.
  Serial-routing first slice **designed + SHIPPED** (2026-07-05, server `012b791`):
  serial-keyed proxy with distinct 404/503 errors, `hub_pubkey` unique index, WS-upgrade
  socket bridge; also fixed two latent `process_port` decode bugs that silently 404'd
  every proxied hub. See
  [farm-impl.md § Serial routing — first slice](docs/farm-impl.md#serial-routing--first-slice).
  `voice_udp_addr` on the hub's `/info` SHIPPED 2026-07-11 (hub `59e28ec`).
  **Next slices**: lifecycle/SSO per [farm-model.md](docs/farm-model.md).
- **Project visibility push** — remaining: a hosted demo hub, directory listings, launch post.
  Needed both for adoption and for the code-signing re-application.
  *(2026-06-10: all six READMEs rewritten as landing pages with badges,
  cross-links, and a `docker compose` quick-start.
  2026-06-11: demo-seed tool added; real screenshots + join-flow GIF added to READMEs.)*
- **Passkey registration from desktop** — blocked by Tauri webview RP ID mismatch; requires either a native OS WebAuthn plugin (tauri-plugin-passkey) or a hybrid approach where the desktop opens the hub URL in the system browser for the ceremony.
- **Role categories + role color/icon — desktop parity** — web
  client shipped 2026-07-04 (clients `a6b2d24`); port the same
  category manager + per-role color/icon controls into desktop's own
  `RoleEditor.tsx`/`RoleCreator.tsx` copies. See
  [`role-categories.md`](docs/role-categories.md) §4, §6.
- **Cross-farm cert relay** — propagate certifications across farm-managed hubs,
  building on badge/cert signer. Design-stage; **depends on farm layer**.
  See [`future-features.md`](docs/future-features.md).
- **Gaming + rich bots capability layer** — DESIGNED 2026-07-11:
  [bot-capability-layer.md](docs/bot-capability-layer.md) (consent spine:
  admin-granted capabilities + effective-capability resolver; game modal =
  promoted mini-app; video via screen-share relay; Phase-1 slice =
  grants + resolver + modal → playable tic-tac-toe). The scoped-token
  prerequisite it flagged already SHIPPED (hub `59e28ec`). Next: build
  Phase 1.
- **Forum post federation across alliances** — DESIGNED 2026-07-11:
  [forum.md](docs/forum.md) §9 (read-through proxy to the owning hub,
  same pattern as alliance messages; hub-vouched attribution via
  `author_hub`; first slice = read-only GET). Next: build the read slice.
- **Event role-slot sign-ups + reminders** — *server SHIPPED 2026-07-04*
  (hub `825b0da`, [`events.md`](docs/events.md) §2-§3); *web UI SHIPPED
  2026-07-04* (clients `dea0df0`, `EventComposer.tsx` slot editor +
  reminder picker, `EventCard.tsx`/new `EventSlotList.tsx`
  claim/unclaim). **Web create path was broken until the 2026-07-04 e2e
  pass** — the composer never sent `channel_id` (create 400'd) and the
  bare create-response crashed the card; both fixed (see
  [`shipped-log.md`](docs/shipped-log.md)). Desktop UI queued next (its parallel
  `EventCard.tsx`/`EventComposer.tsx` copies still show
  baseline RSVP-only). Calendar view (§4) still undesigned-priority,
  client-only. The events read-gating fix (H3) already landed in the
  security pass.
- **Events guild-scale delta (hub-wide, propagation, voice-move staging)**
  — DESIGNED 2026-07-18 ([`events.md`](docs/events.md) §5-§7,
  [decisions.md](docs/decisions.md) voice-move entry). Three buildable
  slices, sized independently:
  - **Phase 1 - move primitive**: *SHIPPED 2026-07-18* (hub `b78aa67`,
    clients `50c1dbb`, see [shipped-log.md](docs/shipped-log.md)) —
    `move_members` permission + `voice_move` WS request/push +
    right-click "Move to channel…". Needs the live pass (real two-client
    move over a running hub).
  - **Phase 2 - staging panel**: *SHIPPED 2026-07-18* (hub `d0a1a53`,
    clients `77dab02`, see [shipped-log.md](docs/shipped-log.md)) —
    queued assignments, voice-only presence, organizer staging panel.
    Needs the live pass with Phase 1.
  - **Phase 3 - hub-wide + propagation + squad rooms**: *SHIPPED
    2026-07-18* (hub `08d873b`, clients `1f9d1d0`, see
    [shipped-log.md](docs/shipped-log.md)) — hub_wide +
    propagate_to_children + event-linked squad rooms with event-end
    lifetime. Live e2e pass over all three phases DONE 2026-07-18
    (clients `bfce564`, specs 48-52 all green against a real hub; four
    client bugs found + fixed). Remaining live gaps: real
    cross-internet voice audio (pilot hub) and the §7.4 voice-only
    browser assertion (hub-tested only).
- **Join-to-create temporary voice channels** — *fully SHIPPED*: server
  (hub `3005fc5`), web UI (clients `fb607de`), `voice_ws.rs` spawner gap
  fixed 2026-07-04 (hub `1fc5aa6`), owner-rename UI 2026-07-05 (clients
  `4100671`). See [`temp-voice-channels.md`](docs/temp-voice-channels.md),
  [`shipped-log.md`](docs/shipped-log.md).
- **Soundboard + bot audio injection** — *SHIPPED 2026-07-04* (server
  hub `ef9beed`, web clients `eed7c04`, [`soundboard.md`](docs/soundboard.md)).
  Clip library + `use_soundboard`/`manage_soundboard` perms +
  `soundboard_played` event; real client-side PCM mix into the outgoing
  stream; bot audio injection via `can_speak_voice` gate on `/voice/ws`.
  Needs the live pass; play-gate uses hub-role perms (see channel-perms
  endpoint follow-up).
- **LAN / offline mode** — *server half SHIPPED 2026-07-05* (hub `a6ec49b`,
  [`lan-mode.md`](docs/lan-mode.md)): `WAVVON_LAN_MODE` with the hard
  private-address guard, mDNS advertisement, self-signed/fingerprint or
  gated-plaintext tiers, `/info` trust fields, doctor output. Remaining
  (client-era per §5–§6): native "nearby hubs" discovery UX, QR/fingerprint
  pinning payloads, LAN federation.
- **Personal data export (full archive)** — export SHIPPED 2026-07-04
  (clients `542891e`); **import/restore SHIPPED 2026-07-11** (clients
  `53ccce2`: restore-into-account with skip-and-report conflicts,
  unrestorable items surfaced). Remaining: **prefs-blob decrypt** (web has
  no decrypt path for the hub-synced E2E prefs blob — export carries a
  `gap_note`); custom-theme store is still device-global, not
  account-scoped; cross-client archive compat (desktop↔web) deferred.
- **Live captions in voice** — local STT, desktop-era (too heavy for
  web). See [`future-features.md`](docs/future-features.md).
- **Hub-hosted identity vault** — DESIGNED 2026-07-19, **PARKED same day
  (user call): revisit after the videogamezone.eu pilot** — real users
  will show how identities actually get lost, which decides whether
  hub-held encrypted seed material is worth its trade-off. Do NOT build
  meanwhile. ([identity-vault.md](docs/identity-vault.md),
  [decisions.md](docs/decisions.md)): opt-in passphrase-wrapped master-seed
  backup stored on the user's home hubs, recoverable on a fresh device with
  no key material — handle-derived locator (hub learns neither handle nor
  passphrase), anonymous PoW-gated reads, master-signed writes/purge.
  Strictly weaker than phrase/file (hub-held ciphertext, offline-crackable);
  bounded by KDF hardness, disclosed not solved. Three buildable slices:
  - **Slice 1 — hub storage + endpoints**: `identity_vault_blobs` additive
    migration + `hub/src/routes/vault.rs` (challenge/get/put/delete/purge)
    + `VaultWrite`/`VaultDelete`/`VaultPurge` envelopes and the versioned
    salt/enc/loc labels in `identity/`; PoW reuse from `identity/src/pow.rs`.
    Happy-path + rejection tests.
  - **Slice 2 — web create/update UX**: Settings → Security "Store an
    encrypted backup on your home hubs" (passphrase + handle, stronger weak-
    passphrase warning, generate-suggestion), write-to-all home hubs,
    passphrase-change move (write-new + delete-old), delete/purge; vault
    derivation in `packages/core` matching the identity crate byte-for-byte.
  - **Slice 3 — fresh-device recovery UX**: welcome-screen "Restore from a
    home hub" (hub URL + handle + passphrase → PoW → locator → fetch →
    decrypt → mint identity + home-hub bootstrap), uniform failure message.
  Depends on the home-hub personal-axis storage already partly built
  (`prefs_blobs`, `home_hub_designations`). Argon2id (`v2`) deferred.

## ⚠️ Known issues

- **Passkey-PRF identity: REMOVED for now (2026-07-19)** — after the
  2026-07-18 provider-matrix testing (Bitwarden: no third-party PRF on
  any browser; Windows Hello 25H2: create-only, restore broken; GPM:
  untested), the user pulled the identity create/restore-by-passkey
  surface entirely (clients `9afe8b0`; the intermediate hardening was
  `a310f64`). Hub-session passkey auth + trusted devices are unaffected
  and stay. Findings + reinstatement notes in
  [webauthn-auth.md](docs/webauthn-auth.md); revisit when providers
  mature (watch: GPM test, Bitwarden third-party PRF, Windows Hello
  get() fix). Optional upstream nudges remain (Bitwarden forum vote +
  GitHub issue on missing `prf.enabled:false`; Microsoft Feedback Hub
  for the Hello get() failure).
- **Staging panel "voice-only" hint needs server data** — the §7.4
  voice-only path works, but the panel can't show the designed
  "voice-only" chip because a client can't see another member's channel
  permissions. Small follow-up: a per-assignment `voice_only: bool` on
  `GET /events/:id/assignments`, computed hub-side.

- **Desktop: `get_pending_deep_link` command missing** — found 2026-07-11
  launching `npm run tauri dev`: shared frontend code invokes a Tauri
  command the desktop Rust shell doesn't register (startup unhandled
  rejection; non-fatal). `wavvon://` deep links likely broken on
  desktop. Register the command in `apps/desktop/src-tauri` or gate the
  call behind the platform adapter.
- **Desktop: `npm run dev` doesn't launch Tauri** — the script only runs
  Vite (port 1420); the real dev command is `npm run tauri dev`.
  Container CLAUDE.md corrected 2026-07-11; consider renaming the
  scripts to match expectations.

- **Role assignment — desktop parity** (web shipped 2026-07-04; see
  [`shipped-log.md`](docs/shipped-log.md)). Remaining, tracked in
  [`client-parity.md`](docs/client-parity.md): **desktop** has a
  role-assignment control to align with web's filtering, and lacks web's
  full create / edit-permissions / delete-role Roles admin tab (covered by
  `e2e/live/13`).
- **Settings IA + profile model — desktop parity** — web shipped
  2026-07-12 (Accounts settings group, default-profile-per-account, tabbed
  multi-context profile editor — Bio/Activities/Hubs — with status,
  accent/cover cosmetics and a tabbed member card; see
  [decisions.md](docs/decisions.md)); desktop still uses the
  named-preset pool, the old single Account tab, and doesn't render the new
  profile fields or the cosmetic banner (hub already serves all of them).
- **Profile favorite-hubs federation** — favorite hubs ship per-hub and
  within-hub only (2026-07-12); cross-allied-hub visibility is deferred
  (needs a signed public-profile envelope).
- **Settings account list doesn't refresh mid-session** — adding an account
  while Settings is open doesn't update the "managing account" dropdowns
  until Settings is reopened (`SettingsPage` loads the account list once on
  mount). Minor; refresh on account-list change if it annoys.
- **Game icons in Activities (wishlist)** — let users attach game icons to
  their Activities entries; parked per the 2026-07-12 profile work.
- **Presence Invisible + TTL — desktop parity** — web shipped the
  Invisible state and "clear after" TTL and dropped the custom-text status
  (2026-07-12); desktop still has the old picker (online/away/dnd +
  custom, no invisible/TTL). Also (web behavior, not parity): an invisible
  user still shows in a voice channel's participant list (roster-only
  hiding), and sees themselves offline in their own roster (no self-distinct
  indicator yet).
- **Flaky e2e: `account-switch.spec.ts` under parallel workers** — failed
  twice on 2026-07-12 in full 8-worker runs, passes every solo/re-run;
  likely a timing race in the switch-then-assert flow. Deflake or mark
  serial.
- **Discord importer still needs a live run** — the 2026-07-04 web live
  pass (see [`shipped-log.md`](docs/shipped-log.md)) covered everything
  else; the importer (`export` with a real bot token, `apply` against a
  running hub) hasn't been exercised live.
- **Windows installer unsigned** — SmartScreen warning on first run; workaround
  "More info → Run anyway". See the code-signing blocker above.
- **Bot deferred scope** — voice/screen-share injection, bot DMs,
  bot-launched game modals: no timeline. See
  [`future-features.md`](docs/future-features.md).

## 💤 Won't do

- **Maintain / converge the old Android client** — `apps/android` was removed
  2026-07-12 (too far behind, not a delivery target for ~2-3 years). It gets a
  clean-slate rewrite when mobile is prioritized, not incremental parity.
  Build/native learnings preserved in
  [`android-rewrite-notes.md`](docs/android-rewrite-notes.md).
- **Load-aware DM routing across a user's hubs** — failover only; load-balancing
  needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable
  cross-platform; live meter covers it
- **Central authority of any kind** — no global hub directory, global identity
  service, or DHT; federation is peer-to-peer
- **Subscriptions, premium tiers, or in-chat advertising** — no paywalled
  features; funding is via voluntary donations
- **Telemetry collection or data sales** — no opt-out telemetry; operators run
  their own hubs
- **Global web-of-trust or negative reputation / shared ban lists** — federated
  ban lists are opt-in per hub, not a global negative registry
