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
- [ ] **App.tsx refactor (web 3,485 lines / desktop 3,171)** — ongoing:
  shrink both orchestrators by moving cohesive state clusters into
  hooks (web mirrors desktop's hook names) and render blocks into
  components; one slice per pass, full typecheck + relevant live e2e
  green after each. Done on web: screen-share+hub-streams
  (`useScreenShare`, clients `41e4b91`), DMs (`useDms`, `e3d45f7`).
  Remaining candidate slices on web, roughly by risk:
  - **hub lifecycle** — add/join/passkey/lobby/deep-link handlers +
    `loadHubData` (several hundred lines, self-contained handlers);
  - **WS handler registry** — the ~250-line frozen `stableHandlers`
    memo → a `useWsHandlers` hook like desktop's (all deps are already
    refs/stable setters, that's why the memo freeze works);
  - **modal render tree** — the long tail of `{showX && <XModal/>}`
    blocks → a `Modals` component fed by a props object;
  - **voice+video** — one unit (the video session is created/torn down
    inside the voice lifecycle); riskiest, do LAST, after the
    cross-internet voice test.
  Not worth extracting (checked 2026-07-27): message send/edit — thin
  glue over cross-cutting App state, a hook would just widen the
  surface. Desktop gets the same treatment after web.
  **Convergence goal:** extracted hooks should ultimately be SHARED,
  not mirrored — the web/desktop pairs (`useDms`, `useScreenShare`,
  `useWhisper`, …) differ mainly in platform access (`invoke()` vs
  HTTP commands), which can travel in via an injected actions object,
  the same pattern packages/ui components already use. Once a pair's
  logic converges, hoist it into packages/ui and delete both app
  copies — that's the real payoff of the refactor: one implementation
  of each subsystem, `App.tsx` reduced to state orchestration + wiring
  (which stays app-local by design, decisions.md 2026-07-18).

- [ ] **Voice v2 cross-internet live test** — transport v2 shipped
  2026-08-07 (shipped log) and passed the local two-browser E2E drive;
  the over-the-internet test on the pilot hub is still pending, now on
  the WebTransport stack (UDP port reachability guidance unchanged).
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

- **Farm multi-node data plane** — the farm proxy only reaches
  farm-local hubs (`proxy.rs` hardcodes `127.0.0.1`; `servers` has no
  host column), so agent-hosted hubs on remote nodes are
  lifecycle-managed but unreachable through the farm domain. Estimated
  ~3–4 days (2026-08-06 assessment): additive `servers.host` column +
  agent-advertised address in the WS `hello`; host-aware proxy
  (buffered + WS-bridge paths); agent passes bind/public host to
  spawned hubs so `/info` advertises a correct `voice_udp_addr` (voice
  stays direct UDP to the node); monitor drives remote hubs via
  heartbeats + the existing agent restart delegation. No hub or client
  changes. Prerequisites to settle first: private network farm↔nodes
  (WireGuard/VPC) instead of farm↔node TLS, and per-node Postgres
  (`db_path` is generated farm-side today). Design context:
  [farm-impl.md](docs/farm-impl.md).
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
