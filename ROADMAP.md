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

## 🚧 Blocked

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity (the free OSS signing route requires it; paying for signing
  before there are users isn't worth it). Ship unsigned with the documented
  SmartScreen workaround meanwhile; all signing-service steps removed from CI.
  Options and design in [`code-signing.md`](docs/code-signing.md).
- **Android client icons** — placeholder solid-color PNGs in place. Waiting on
  the final logo asset. Run `cargo tauri icon <1024x1024.png>` once the brand
  logo is ready. See [`brand.md`](docs/brand.md).

## 🔍 Flow-test findings (2026-07-06, private-hub + wizard flows)

- [x] ~~**Lobby soft-landing** server half~~ — SHIPPED (hub `bded78c`):
  admits sub-level joins as `scope="lobby"`, confined + promotable; owner/
  first-user exempt; preset gate restored. Remaining (task, not blocker):
  **web lobby UX** (background PoW + auto-promote) and **is_hub peer
  exemption** from the gate.
- [x] ~~**Invite-first joining**~~ — SHIPPED (hub `10f3e2d`): new hubs default
  invite_only=true (templates opt out); first boot mints + logs a one-time
  owner-granting invite (wavvon:// + https twin), doctor prints it. Web: an
  admin surface for the owner invite / role-granting invite creation is a
  small frontend follow-on.
- [x] ~~**Role-granting invites**~~ — SHIPPED (hub `10f3e2d`): invites carry an
  optional grant_role_id; priority guard + forced single-use/expiry for
  admin roles; first-boot owner invite is the documented exception. Applies
  on the /auth/verify path (the /join/:code path is a small follow-on).
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
  desktop/android single-slot copies still to port.)
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
  **Next slices**: `voice_udp_addr` on the hub's `/info` (hub-side), then lifecycle/SSO
  per [farm-model.md](docs/farm-model.md).
- **Project visibility push** — remaining: a hosted demo hub, directory listings, launch post.
  Needed both for adoption and for the code-signing re-application.
  *(2026-06-10: all six READMEs rewritten as landing pages with badges,
  cross-links, and a `docker compose` quick-start.
  2026-06-11: demo-seed tool added; real screenshots + join-flow GIF added to READMEs.)*
- **Passkey registration from desktop** — blocked by Tauri webview RP ID mismatch; requires either a native OS WebAuthn plugin (tauri-plugin-passkey) or a hybrid approach where the desktop opens the hub URL in the system browser for the ceremony.
- **Role categories + role color/icon — desktop/Android parity** — web
  client shipped 2026-07-04 (clients `a6b2d24`); port the same
  category manager + per-role color/icon controls into desktop's and
  Android's own `RoleEditor.tsx`/`RoleCreator.tsx` copies. See
  [`role-categories.md`](docs/role-categories.md) §4, §6.
- **Cross-farm cert relay** — propagate certifications across farm-managed hubs,
  building on badge/cert signer. Design-stage; **depends on farm layer**.
  See [`future-features.md`](docs/future-features.md).
- **Gaming + rich bots capability layer** — design the Telegram-class bot runtime.
  First slice (bot audio injection) already shipped hub-side 2026-07-04
  ([soundboard.md](docs/soundboard.md) §2); next: capability-layer design.
- **Forum post federation across alliances** — v1 forums are hub-local
  only; posts/replies don't federate over alliance-shared channels. No
  design work started; overlaps the alliance space-sharing work above.
  See [`forum.md`](docs/forum.md).
- **Event role-slot sign-ups + reminders** — *server SHIPPED 2026-07-04*
  (hub `825b0da`, [`events.md`](docs/events.md) §2-§3); *web UI SHIPPED
  2026-07-04* (clients `dea0df0`, `EventComposer.tsx` slot editor +
  reminder picker, `EventCard.tsx`/new `EventSlotList.tsx`
  claim/unclaim). **Web create path was broken until the 2026-07-04 e2e
  pass** — the composer never sent `channel_id` (create 400'd) and the
  bare create-response crashed the card; both fixed (see
  [`shipped-log.md`](docs/shipped-log.md)). Desktop/Android UI queued next (parallel
  `EventCard.tsx`/`EventComposer.tsx` copies in those apps still show
  baseline RSVP-only). Calendar view (§4) still undesigned-priority,
  client-only. The events read-gating fix (H3) already landed in the
  security pass.
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
- **Personal data export (full archive)** — *export half SHIPPED
  2026-07-04* (clients `542891e`, [`data-export.md`](docs/data-export.md)).
  Two follow-ups: (1) **prefs-blob decrypt** — web has no decrypt path
  for the hub-synced E2E prefs blob, so v1 exports a local snapshot with
  a `gap_note`; (2) **import/restore** (§5) not built. Cross-client
  archive compat (desktop↔web envelope) also deferred.
- **Live captions in voice** — local STT, desktop-era (too heavy for
  web). See [`future-features.md`](docs/future-features.md).

## ⚠️ Known issues

- **Android APK release build fails in native cross-compilation** — found
  2026-07-06 cutting clients v0.3.0/v0.3.1 (workflow paths fixed in
  `16c69cc`, then the real blocker surfaced): `audiopus_sys` builds
  `libopus.so` for the host arch, so the aarch64-Android link fails
  ("incompatible with aarch64linux"). The NDK toolchain isn't reaching
  the crate's C build. No APK has ever shipped; needs voice-crate build
  wiring (cargo-ndk or CC/CMake toolchain env in the workflow).
- **demo-seed broken by invite-first defaults** — fresh hubs now boot with
  `invite_only=true` (hub `10f3e2d`), so demo-seed's plain `/auth/verify`
  403s before it can create Nova. Workaround used for the 2026-07-06
  README asset recapture: flip `hub_settings.invite_only` to `false` on
  the fresh hub before seeding. Proper fix: teach demo-seed to redeem the
  first-boot owner invite. Also found: its `secret_key_hex` output fields
  are empty — only recovery phrases are usable from the creds file.
- **Role assignment — client parity** (web shipped 2026-07-04; see
  [`shipped-log.md`](docs/shipped-log.md)). Remaining, tracked in
  [`client-parity.md`](docs/client-parity.md):
  **android** still has no role-assignment control in its user context menu;
  **desktop** has one to align with web's filtering. (Web has a full
  create / edit-permissions / delete-role UI — Roles admin tab, covered by
  `e2e/live/13`; **android** still lacks it.)
- **Presence status — Android parity** — web shipped 2026-07-05, DND
  gating + global broadcast 2026-07-10, and the full set ported to
  desktop 2026-07-11 (clients `81de52c`, see
  [`shipped-log.md`](docs/shipped-log.md)). Android still has none of
  it: no status picker, no `member_status` handling in its Tauri shell,
  no DND notification gating.
- **Discord importer still needs a live run** — the 2026-07-04 web live
  pass (see [`shipped-log.md`](docs/shipped-log.md)) covered everything
  else; the importer (`export` with a real bot token, `apply` against a
  running hub) hasn't been exercised live.
- **Paired-device DMs attribute to the subkey, not the canonical identity** —
  found 2026-07-04 building pairing. The community experience (messages,
  membership, roles, bans) is token-based and already resolves to the shared
  canonical identity, but DM envelopes and the published DH key are signed with
  the device's own subkey seed, so a DM sent from a paired device shows its
  subkey as sender. Fix: sign/attribute DMs + DH key against the canonical
  identity (or have the hub map subkey→canonical on the DM path).
- **Windows installer unsigned** — SmartScreen warning on first run; workaround
  "More info → Run anyway". See the code-signing blocker above.
- **Bot deferred scope** — voice/screen-share injection, bot DMs,
  bot-launched game modals: no timeline. See
  [`future-features.md`](docs/future-features.md).

## 💤 Won't do

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
