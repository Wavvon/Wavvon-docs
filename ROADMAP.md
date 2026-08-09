# Wavvon Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
design questions — lives in the wiki at [`docs/`](docs/README.md).
Shipped work goes straight to
[`docs/shipped-log.md`](docs/shipped-log.md) (no "recently shipped"
section here), and Known issues holds **open** issues only — when one is
fixed, its entry moves to the shipped log.

## 🔨 Next up

- [ ] **Cut a release: DM fix batch + voice transport v2** — both are
  on develop unreleased: the 2026-07-26/27 DM fixes (encrypted DMs
  never worked cross-client before them) and voice v2 (WebTransport +
  E2E, 2026-08-07 — a breaking voice-wire change, alpha rules). Bump
  versions on develop, open the develop→main PR, user reviews +
  merges. Do before the pilot friend onboards. Version number to be
  decided at PR time.
- [ ] **`db move --to <url>` / `--from <url>`** — the remaining slice of
  [One mechanism moves the data](docs/decisions.md#one-mechanism-moves-the-data-logical-dumprestore).
  The mechanism and its guard rails shipped 2026-08-09 under
  `backup`/`restore` (`db/dump.rs`); `move` is the thin wrapper that runs
  both against two URLs, for adopting or giving up an external server.
  **Copies only** — the operator then flips `WAVVON_DATABASE_URL` and
  restarts, so a bad destination is undone by changing one variable back.
  Deliberately waiting for embedded PostgreSQL: until there is an embedded
  side, "move" is `backup` then `restore` against a different URL, which
  the two commands already do.

- [ ] **Upgrade path — the embedded-PostgreSQL dimension.** The rest of
  this item closed 2026-08-09 (shipped log): `backup` takes a real backup,
  and rollback is stated — schema downgrade is safe by construction and now
  enforced by a test, data downgrade is not guaranteed, so the pre-upgrade
  archive is the supported way back. What remains has to wait for bundling:
  an upgrade may then also carry a **PostgreSQL major** upgrade, which is a
  different failure surface and needs its own paragraph in `hosting.md`.
  - Note the coupling to the capability work: upgrading a hub also swaps
    the web client it serves, so it changes the client version for every
    user who loads the page from that hub.

- [ ] **Bundle PostgreSQL into the hub binary** — the zero-prerequisite
  install story; removes Docker (or a hand-rolled `createdb`) as a
  precondition for self-hosting. Feasibility verified 2026-08-08:
  `postgresql_embedded` 0.21.0 publishes **both** musl targets the
  release workflow builds (`x86_64` 24.8 MB, `aarch64` 24.6 MB), and its
  `bundled` feature embeds the archive at compile time rather than
  downloading at runtime — which LAN mode would not survive.
  - [ ] Embedded mode when `WAVVON_DATABASE_URL` is unset; plain client
    when set. Removes today's silent fallback to
    `postgres://postgres:postgres@localhost:5432/wavvon`.
  - [ ] Version-scoped `installation_dir` (`<root>/pg/<version>/`) and an
    explicit `data_dir` — the crate defaults to `~/.theseus/postgresql`
    and a **tempdir**, neither of which is acceptable for a server.
  - [ ] Major-upgrade path: compare `PG_VERSION`, then dump/restore via
    the retained previous binaries (not `pg_upgrade` — see the
    dump/restore decision), keep the old data dir until success, refuse
    with instructions when it cannot be done safely.
  - [ ] `--doctor` reports which mode is active and where the data lives.
  - [ ] Verify `wavvon-hub backup`/`restore` against the embedded instance.
  - [ ] Test `initdb` on musl — locale support there is limited and it
    likely needs `--locale=C`.
  - Not restored by this: SQLite's one-file backup. Still `pg_dump`.

- [ ] **Desktop live-drive DM verification** — the DR interop is pinned
  by cross-language vector tests, but no real desktop app was driven;
  smoke-test a real web↔desktop DM exchange via the documented recipe
  (Tauri dev + `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port`
  + Playwright `connectOverCDP`). Consider a reusable desktop e2e
  harness while at it — this gap is why the DM bugs survived so long.
  **Now also covers paired-device E2E**: desktop pairing Mechanism A
  shipped 2026-08-08 with unit tests pinning the crypto properties, but
  no real desktop↔web *pairing* has been driven either. Both belong in
  the same session — same harness, and a paired device is the case where
  a wrong DH scalar fails silently rather than loudly.
- [ ] **App.tsx refactor — final slices + convergence (web 1,577
  lines / desktop 1,908, counted 2026-08-07)** — the hook-extraction
  phase is nearly done on web: screen-share (`useScreenShare`), DMs
  (`useDms`), hub lifecycle (`useHubLifecycle` + `useAddHubFlow` /
  `useChannelCrud`), WS registry (`useWsHandlers`), and voice+video
  (`useVoice`/`useVideo`) have all landed (2026-07-28 split +
  follow-ups; decisions.md). Remaining:
  - **modal render tree** (web) — ~13 `{showX && <XModal/>}` blocks →
    a `Modals` component fed by a props object;
  - **desktop parity pass** on whatever web slices desktop still lacks;
  - **convergence goal** — the real payoff: web/desktop hook pairs
    (`useDms`, `useScreenShare`, `useWhisper`, …) differ mainly in
    platform access (`invoke()` vs HTTP commands), which can travel in
    via an injected actions object, the same pattern packages/ui
    components use. Hoist converged pairs into packages/ui and delete
    both app copies; App.tsx stays app-local state orchestration +
    wiring by design (decisions.md 2026-07-18).
  Not worth extracting (checked 2026-07-27): message send/edit — thin
  glue over cross-cutting App state.

- [ ] **List-endpoint pagination — remaining lists.** The first pass
  landed 2026-08-08 (shipped log): `GET /users`, `GET /conversations/
  {id}/messages` and `GET /admin/reports` all take `limit` + a keyset
  cursor now. Two corrections to the 2026-08-07 plan that was written
  here: `q` already existed on `/users`, and `GET /farm/users` is
  `cursor`/`limit`/`total`, not `page`/`limit`/`total` — so there is
  one cursor dialect in the repo, not two, and everything new follows
  it. Still unbounded and worth a sweep when someone hits one:
  `/moderation/bans`, `/moderation/mutes`, `/invites`, `/hub/pending`,
  `/conversations`, `/channels/{id}/pins`, `/channels/{id}/polls`,
  `/roles`, `/channels`, the banlist trio, `/emojis`, `/hub/icons`,
  `/badges`. (`/admin/audit-log` was already properly paginated.) None
  of these grow the way DM history does — hence not "next up".
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
  **Consequence worth naming**: with the desktop client not seriously
  distributable, web is the only real channel — which is why the
  capability/version-skew work above is product scope rather than a 1.0
  nicety. A desktop client is structurally immune to that skew (the user
  owns its version, it inherits nothing from a hub), so signing would
  relieve pressure there too.

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
  spawned hubs so `/info` advertises a correct `voice_wt_url` (voice
  stays direct QUIC to the node); monitor drives remote hubs via
  heartbeats + the existing agent restart delegation. No hub or client
  changes. Prerequisites to settle first: private network farm↔nodes
  (WireGuard/VPC) instead of farm↔node TLS, and per-node Postgres
  (`db_path` is generated farm-side today). Design context:
  [farm-impl.md](docs/farm-impl.md).
- **Hosted web client (`app.wavvon.io`)** — undesigned, deliberately.
  Would decouple the client version from any single hub and be the
  canonical entry point for public hubs; deployment alongside the
  discovery site is the obvious home, though they are different
  artifacts (discovery is Next.js, the client a static Vite SPA).
  Enabled by CORS already defaulting to `*` (bearer-token API, no CSRF
  surface), so it can talk to arbitrary hubs with no per-hub setup.
  **It can never be the only channel**: an HTTPS page cannot call an
  `http://` hub, which rules out LAN mode, self-signed hubs, and trying
  Wavvon before buying a domain — so the hub-served copy stays. That
  constraint is recorded in
  [decisions.md](docs/decisions.md#hub-capabilities-are-advertised-not-inferred-from-a-version-number);
  the hosted client itself is not decided.
- **Project visibility push** — hosted demo hub, directory listings,
  launch post. Needed for adoption and the code-signing re-application.
- **Passkey registration from desktop** — blocked by Tauri webview RP ID
  mismatch; needs a native WebAuthn plugin or system-browser handoff.
- **Desktop parity backlog** — named custom themes, data-export archive
  compat, LAN discovery UX (mDNS + QR). The whisper gaps, the
  `SoundboardPlayed` chip, `hub_updated`/`channels_updated`/
  `member_updated`, the duplicate channel-appearance modal and
  paired-device E2E (pairing Mechanism A) all closed 2026-08-08.
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
  only backend, now with a **reasoned** entry behind it
  ([decisions.md](docs/decisions.md), 2026-08-08) rather than the bare
  `Status:` line the 2026-06-27 removal originally left. Short version:
  a runtime-polymorphic dual backend silently broke revocation and
  federated-ban checks, and two engines means two migration sets
  forever. The store-trait split stays for error normalization and
  keeping SQL out of handlers, not for backend plurality. The zero-ops
  install story SQLite gave up is being recovered by bundling
  PostgreSQL into the hub binary instead.
- **Load-aware DM routing across a user's hubs** — failover only.
- **Concurrent mic test while in voice** — live meter covers it.
- **Central authority of any kind** — no global directory, identity
  service, or DHT.
- **Subscriptions, premium tiers, or in-chat advertising.**
- **Telemetry collection or data sales.**
- **Global web-of-trust / negative reputation** — federated ban lists are
  opt-in per hub.
