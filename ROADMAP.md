# Wavvon Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
design questions — lives in the wiki at [`docs/`](docs/README.md).
Shipped work goes straight to
[`docs/shipped-log.md`](docs/shipped-log.md) (no "recently shipped"
section here), and Known issues holds **open** issues only — when one is
fixed, its entry moves to the shipped log.

## 🔨 Next up

- [ ] **Cut a release with the DM fix batch** — encrypted DMs never
  actually worked cross-client before the 2026-07-26/27 fixes (hub
  liveness, web bug chain, desktop DR receive + v2 send; shipped log).
  Bump versions on develop, open the develop→main PR, user reviews +
  merges. Do before the pilot friend onboards. Version number to be
  decided at PR time.
- [ ] **Desktop live-drive DM verification** — the DR interop is pinned
  by cross-language vector tests, but no real desktop app was driven;
  smoke-test a real web↔desktop DM exchange via the documented recipe
  (Tauri dev + `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port`
  + Playwright `connectOverCDP`). Consider a reusable desktop e2e
  harness while at it — this gap is why the DM bugs survived so long.
- [ ] **Web App.tsx hook extraction** — shrink the 3.5k-line orchestrator
  by moving cohesive state clusters into hooks, mirroring desktop's
  existing set; one cluster per pass, live e2e green after each.
  Done: screen-share+hub-streams (`useScreenShare`, clients `41e4b91`),
  DMs (`useDms`, clients `e3d45f7` — surfaced and fixed the DM-liveness
  bug chain, see shipped log). Message send/edit was dropped on
  inspection (2026-07-27): ~50 lines of thin glue over cross-cutting
  App state, not a cluster — extracting it trades App lines for a
  wider-surfaced hook. Remaining: voice+video (one unit — the video
  session is created/torn down inside the voice lifecycle; riskiest,
  do last, after the cross-internet voice test).

- [ ] **Networked voice — first cross-internet test** — all four clients
  shipped; the live test over the pilot hub is pending. Phase 2 (voice
  encryption) is separate.
- [ ] **First external operator pilot (videogamezone.eu)** — hub v0.3.1
  LIVE. Remaining: hostname fix (server_name edit + friend's nginx
  reload), redeem owner invite, cross-internet voice test, friend
  onboards + ownership transfer, doc-test feedback, two-operator
  federation test.

## 🚧 Blocked

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity. Ship unsigned with the documented SmartScreen workaround.
  See [`code-signing.md`](docs/code-signing.md).

## 📌 Wishlist

> **Big future pillar** (writeup in
> [future-features.md](docs/future-features.md)): cross-farm cert
> relay — undesigned. (Farm layer and gaming + rich bots shipped
> 2026-07-19; see the shipped log.)

- **Project visibility push** — hosted demo hub, directory listings,
  launch post. Needed for adoption and the code-signing re-application.
- **Passkey registration from desktop** — blocked by Tauri webview RP ID
  mismatch; needs a native WebAuthn plugin or system-browser handoff.
- **Desktop parity backlog** — named custom themes, data-export archive
  compat, LAN discovery UX (mDNS + QR), whisper gaps (keybind listener,
  `WhisperInbox` render, opt-out wiring), `SoundboardPlayed` chip.
  Details in [`client-parity.md`](docs/client-parity.md).
- **Banner-channel management surface** — a bannerless banner channel
  can't be renamed/deleted from the web sidebar (no gear, no context
  menu); needs a small UX decision first
  ([client-parity.md](docs/client-parity.md) tracked item 4).
- **Birthday announcement message** — demand-gated tail of the birthday
  badge: hub-configured channel + daily worker posting at hub-midnight
  (needs chrono-tz). Only if a pilot community asks.
- **Live captions in voice** — local STT, desktop-era.
- **Hub-hosted identity vault** — DESIGNED, **PARKED until after the
  pilot** (do NOT build; [identity-vault.md](docs/identity-vault.md)).

> Demand-gated tails of shipped features live in their own docs, not
> here: forum federation ([forum.md](docs/forum.md) §9 deferred list),
> gaming/bots ([bot-capability-layer.md](docs/bot-capability-layer.md)
> §10–§11), LAN federation ([lan-mode.md](docs/lan-mode.md) §6), farm
> follow-ups ([farm-model.md](docs/farm-model.md)).

## ⚠️ Known issues

- **Discord importer needs a live run** — `export` with a real bot token
  + `apply` against a running hub never exercised live.
- **Windows installer unsigned** — SmartScreen warning; "More info → Run
  anyway". See the code-signing blocker.
- **Bot deferred scope** — bot DMs: no timeline. (Voice/video injection
  and bot-launched game modals shipped 2026-07-19 as capability-layer
  Phases 1–2.)
- **`GET /users` caps at 50 rows** — member lists silently truncate on
  larger hubs (also forced the e2e suite onto a fresh DB, 2026-07-26);
  needs pagination/search on the hub.
- **Own encrypted DMs from another device show "[decryption failed]"**
  — the own-plaintext stash is device-local by nature (a ratchet can't
  decrypt its own envelopes), so a paired second device can't render
  messages the first device sent. Edge of the tracked paired-device
  canonical-DM follow-up (client-parity.md pairing item).
## 💤 Won't do

- **Maintain / converge the old Android client** — removed 2026-07-12;
  clean-slate rewrite when mobile is prioritized
  ([android-rewrite-notes.md](docs/android-rewrite-notes.md)).
- **SQLite (or any second) hub storage backend** — PostgreSQL is the
  only backend (decisions.md 2026-06-27 removed SQLite from the
  workspace entirely). The store-trait split stays for error
  normalization and keeping SQL out of handlers, not for backend
  plurality.
- **Load-aware DM routing across a user's hubs** — failover only.
- **Concurrent mic test while in voice** — live meter covers it.
- **Central authority of any kind** — no global directory, identity
  service, or DHT.
- **Subscriptions, premium tiers, or in-chat advertising.**
- **Telemetry collection or data sales.**
- **Global web-of-trust / negative reputation** — federated ban lists are
  opt-in per hub.
