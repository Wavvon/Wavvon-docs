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
- [ ] **First external operator pilot (videogamezone.eu)** — hub v0.2.3 LIVE
  at `https://wavvon.videogamezone.eu`. Remaining: first cross-internet voice
  test (everything shipped, just needs two humans), friend onboards +
  ownership transfer, doc-test feedback, two-operator federation test.
- [ ] **Fix macOS desktop build: xcap 0.9.6 now compiles** — bumped from
  0.0.14 to 0.9.6 to resolve upstream E0282 error; call sites in
  `screen_share.rs` updated for new API. Verify in CI before removing from
  Known issues.

## 🚧 Blocked

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity (the free OSS signing route requires it; paying for signing
  before there are users isn't worth it). Ship unsigned with the documented
  SmartScreen workaround meanwhile; all signing-service steps removed from CI.
  Options and design in [`code-signing.md`](docs/code-signing.md).
- **Android client icons** — placeholder solid-color PNGs in place. Waiting on
  the final logo asset. Run `cargo tauri icon <1024x1024.png>` once the brand
  logo is ready. See [`brand.md`](docs/brand.md).

## 📌 Wishlist (undesigned)

> **Big future pillars** (full writeups in
> [future-features.md](docs/future-features.md)): **1. Farm layer** — the
> major architectural next step (multi-hub control plane;
> [farm-model.md](docs/farm-model.md); farm-ready invites already landed).
> **2. Cross-farm certification relay** — follows the farm layer.
> **3. Gaming + rich bots** — one theme: give bots a Telegram-class runtime
> (interactive UI, audio, video) and games fall out ([gaming.md](docs/gaming.md)).

- **Farm layer** — multi-hub control plane; farm-ready invites shipped with hub serial in URLs.
  Next step: design doc + bounded first slice (wiring farm serial through farm's reverse-proxy routing).
  See [farm-model.md](docs/farm-model.md).
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
- **Join-to-create temporary voice channels** — *server SHIPPED*
  (hub `3005fc5`) + *web UI SHIPPED* (clients `fb607de`) +
  *`voice_ws.rs` spawner gap FIXED 2026-07-04* (hub `1fc5aa6`, see
  [`shipped-log.md`](docs/shipped-log.md)),
  [`temp-voice-channels.md`](docs/temp-voice-channels.md).
  Remaining: owner-rename UI (a non-admin temp-room owner has no rename
  path — the context menu is `isAdmin`-gated).
- **Soundboard + bot audio injection** — *SHIPPED 2026-07-04* (server
  hub `ef9beed`, web clients `eed7c04`, [`soundboard.md`](docs/soundboard.md)).
  Clip library + `use_soundboard`/`manage_soundboard` perms +
  `soundboard_played` event; real client-side PCM mix into the outgoing
  stream; bot audio injection via `can_speak_voice` gate on `/voice/ws`.
  Needs the live pass; play-gate uses hub-role perms (see channel-perms
  endpoint follow-up).
- **LAN / offline mode** — **designed, ready to implement**:
  [`lan-mode.md`](docs/lan-mode.md). mDNS discovery + self-signed/
  fingerprint or gated-plaintext trust; `WAVVON_LAN_MODE` flag with a
  hard private-address guard (can't be exposed publicly). Server-first;
  native discovery UX deferred to client era.
- **Personal data export (full archive)** — *export half SHIPPED
  2026-07-04* (clients `542891e`, [`data-export.md`](docs/data-export.md)).
  Two follow-ups: (1) **prefs-blob decrypt** — web has no decrypt path
  for the hub-synced E2E prefs blob, so v1 exports a local snapshot with
  a `gap_note`; (2) **import/restore** (§5) not built. Cross-client
  archive compat (desktop↔web envelope) also deferred.
- **Live captions in voice** — local STT, desktop-era (too heavy for
  web). See [`future-features.md`](docs/future-features.md).

## ⚠️ Known issues

- **Farm auth challenge race** — farm's `pending_challenges` DB table is
  keyed by pubkey (one slot per key), so concurrent auth flows for the same
  key stomp each other — the same race fixed hub-side on 2026-07-05 (see
  [`shipped-log.md`](docs/shipped-log.md)). Fix the same way: key by the
  challenge value, bind the pubkey inside the row.
- **Desktop background effects load the MediaPipe model from a CDN** — found
  2026-07-05 while shipping web background effects. `apps/desktop/src/utils/
  backgroundProcessor.ts` uses `locateFile: (f) => https://cdn.jsdelivr.net/
  npm/@mediapipe/selfie_segmentation/${f}`, so blur/image backgrounds require
  internet and hit jsDelivr — wrong for a desktop app (breaks offline, odd for
  a self-hosted product). The web client now serves the same assets locally
  (the `mediapipeAssets` Vite plugin → `/mediapipe/*`, package
  `@mediapipe/selfie_segmentation` is already a desktop dep). **Fix:** bundle
  the model + WASM as Tauri resources and point `locateFile` at the local path.
  While there, port the web version's **video background** mode (desktop only
  has none/blur/image) for parity.
- **Role assignment — client parity** (web shipped 2026-07-04; see
  [`shipped-log.md`](docs/shipped-log.md)). Remaining, tracked in
  [`client-parity.md`](docs/client-parity.md):
  **android** still has no role-assignment control in its user context menu;
  **desktop** has one to align with web's filtering. (Web has a full
  create / edit-permissions / delete-role UI — Roles admin tab, covered by
  `e2e/live/13`; **android** still lacks it.)
- **Web has no presence status (away/DND/custom)** — presence is a binary
  online/offline dot driven by `member_online`/`member_offline`; there is
  no status picker. Also, a brand-new member does not appear in an
  already-loaded client's member list until that client refetches `/users`
  (`onMemberOnline` only flips `online` on users already in the array).
  Documented by `10-member-presence.spec.ts` (which reloads to pick up the
  join; offline transitions of known members ARE live).
- **No member-facing "my effective channel permissions" endpoint** —
  recurring gap surfaced by the Permissions tab, the soundboard
  play-gate, and channel-scoped `use_soundboard`. The only endpoint that
  folds channel overwrites (`GET /channels/:id/permissions`) itself
  requires `manage_roles`, so a plain member's client can't cheaply
  learn its own channel-scoped effective perms — client UIs fall back to
  hub-wide role checks for gating (servers still enforce the real
  channel-scoped check, so it's a UX/visibility gap, not a security
  one). Fix: a lightweight `GET /channels/:id/my-permissions` returning
  the caller's own effective set.
- **Discord importer still needs a live run** — the 2026-07-04 web live
  pass (see [`shipped-log.md`](docs/shipped-log.md)) covered everything
  else; the importer (`export` with a real bot token, `apply` against a
  running hub) hasn't been exercised live. Also open: the
  channel-settings gear is `isAdmin`-gated (pre-existing), so a member
  with only `manage_roles` can't reach the Permissions tab the server
  would allow them to use.
- **Farm/seed test DBs leak (LOW)** — hub's `create_test_db()` got a
  `TestDbGuard` (hub `e203106`, 2026-07-04) but `crates/farm/tests`
  (`wavvon_farm_test_*`) and `crates/seed/tests` (`seed_test_*`) still
  create unguarded databases; apply the same guard pattern.
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
