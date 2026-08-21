# Wavvon Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
design questions — lives in the wiki at [`docs/`](docs/README.md).
Shipped work goes straight to
[`docs/shipped-log.md`](docs/shipped-log.md) (no "recently shipped"
section here), and Known issues holds **open** issues only — when one is
fixed, its entry moves to the shipped log.

## 🔨 Next up

- [ ] **A PostgreSQL role per hub.** Farm-spawned hubs get a database or a
  schema of their own, but they all connect with the **same role** — so the
  separation prevents collisions, not a compromised hub reading its siblings.
  `farm/src/db/provision.rs` says so in its own header. A role per hub,
  granted only its own space, works with either layout. Worth doing before a
  farm hosts hubs it does not itself own.

- [ ] **Browser e2e in CI.** No workflow runs Playwright at all. The 57 live
  specs under `apps/web/e2e/live/` only ever run against a hub someone started
  by hand — `HUB_URL` is a hard-coded const in `e2e/live/helpers/live.ts` — so
  the suite that covers the real app is the one nobody runs. Its own piece of
  infrastructure (postgres, hub, vite, browsers). Start by making that URL
  configurable, which also lets the suite point at a farm-hosted
  `/hub/<slug>`.

- [ ] **Bundle PostgreSQL into the hub binary** — the zero-prerequisite
  install story. Design and rationale:
  [The hub bundles PostgreSQL](docs/decisions.md#the-hub-bundles-postgresql-and-never-touches-one-it-did-not-create).
  Feasibility verified 2026-08-08: `postgresql_embedded` 0.21.0 publishes both
  musl targets the release workflow builds (`x86_64` 24.8 MB, `aarch64`
  24.6 MB) and embeds the archive at compile time.
  - [ ] Embedded when `WAVVON_DATABASE_URL` is unset, plain client when set — removes today's silent fallback to `postgres://postgres:postgres@localhost:5432/wavvon`.
  - [ ] Version-scoped `installation_dir` + explicit `data_dir`; the crate defaults to `~/.theseus/postgresql` and a **tempdir**, neither acceptable for a server.
  - [ ] Major-upgrade path per the dump/restore decision, refusing rather than half-migrating.
  - [ ] `doctor` reports which mode is active and where the data lives.
  - [ ] Verify `backup`/`restore` against the embedded instance.
  - [ ] Test `initdb` on musl — limited locale support, likely needs `--locale=C`.
  - Does not restore SQLite's one-file backup. Still `pg_dump`.

- [ ] **`db move --to <url>` / `--from <url>`** — the last slice of
  [One mechanism moves the data](docs/decisions.md#one-mechanism-moves-the-data-logical-dumprestore);
  the mechanism itself shipped 2026-08-09 as `backup`/`restore`. Waiting on
  bundling on purpose: with no embedded side, `move` is exactly `backup` then
  `restore` against another URL, which both commands already do.

- [ ] **Upgrade path — the embedded-PostgreSQL dimension.** The rest closed
  2026-08-09 (shipped log). What is left needs bundling first: an upgrade may
  then also carry a **PostgreSQL major** upgrade, a different failure surface,
  and `hosting.md` needs a paragraph for it. Coupled to the capability work —
  upgrading a hub also swaps the web client it serves.

- [ ] **Desktop live-drive verification — DMs and pairing.** Both are pinned
  by cross-language vector tests and neither has been driven in a real desktop
  app: a web↔desktop DM exchange, and web↔desktop *pairing* (Mechanism A,
  shipped 2026-08-08). Same session, same harness — Tauri dev +
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port` + Playwright
  `connectOverCDP`. A paired device is where a wrong DH scalar fails silently
  rather than loudly, and this missing harness is why the DM bugs survived so
  long. Build it reusable.

- [ ] **App.tsx refactor — final slices + convergence.** Web 1,694 lines /
  desktop 2,104, counted 2026-08-20 — **up 117 and 196** since the 2026-08-07
  count, so this is currently moving the wrong way. The hook-extraction phase
  landed 2026-07-28 and after (shipped log; decisions.md 2026-07-18). Left:
  - **modal render tree** (web) — 12 `{showX && <XModal/>}` blocks → a `Modals` component fed by a props object;
  - **desktop parity pass** on the web slices desktop still lacks;
  - **convergence** — the actual payoff: web/desktop hook pairs (`useDms`, `useScreenShare`, `useWhisper`, …) differ mainly in platform access, which can travel in via an injected actions object like `packages/ui` components already do. Hoist converged pairs into `packages/ui`, delete both app copies. App.tsx stays app-local orchestration by design.
  - Not worth extracting (checked 2026-07-27): message send/edit.

- [ ] **List-endpoint pagination — remaining lists.** One keyset dialect
  (`limit` + cursor) exists and everything new follows it; the first pass
  landed 2026-08-08. Verified still unbounded 2026-08-20 — worth a sweep when
  someone hits one: `/moderation/bans`, `/moderation/mutes`, `/invites`,
  `/hub/pending`, `/conversations`, `/channels/{id}/pins`,
  `/channels/{id}/polls`, `/roles`, `/channels`, the banlist trio, `/emojis`,
  `/hub/icons`, `/badges`. None grow the way DM history does, hence not
  urgent.

- [ ] **First external operator pilot.** A hub is live on an external
  operator's own server, **wiped and rebuilt on v0.5.0 (2026-08-21)** after an
  in-place 0.3.2 → 0.5.0 upgrade proved the migration path; the old install
  held two accounts and zero messages, so nothing was worth keeping. The hub
  boots blank and its first-boot owner invite is **unredeemed**. Remaining:
  redeem it, operator onboarding + ownership transfer, hub naming and channel
  setup, whether the docs were enough to get there, and the two-operator
  federation test. First real operator feedback arrived 2026-08-21 — four UI
  items fixed same day, the rest below. Host details and per-deployment steps
  stay out of this repo.

- [ ] **Voice v2 across the internet — quality, not reachability.** It has now
  crossed: on the pilot, over WebTransport/QUIC, audio arrives, so port, cert
  trust tier and relay all work. It arrives choppy. Send pacing, jitter buffer
  and the pilot's network are three causes with three fixes — isolate with
  metrics from a two-client session before touching code.

- [ ] **Feature gating on capabilities, not dead UI.** Discovery-dependent
  surfaces are visible and non-functional. Gate on `hubSupports(cap)` rather
  than the CSS class the operator suggested: a class is a state someone must
  remember to remove. Needs the capability strings on the hub side.

## 🚧 Blocked

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity; ship unsigned with the documented SmartScreen workaround
  ([`code-signing.md`](docs/code-signing.md)). Consequence worth naming: with
  the desktop client not seriously distributable, web is the only real
  channel, which is what makes the capability/version-skew work product scope
  rather than a 1.0 nicety. A desktop client is structurally immune to that
  skew, so signing would relieve pressure there too.

## 📌 Wishlist

> **Big future pillar** (writeup in
> [future-features.md](docs/future-features.md)): cross-farm cert
> relay — undesigned. (Farm layer and gaming + rich bots shipped
> 2026-07-19; see the shipped log.)

- **Farm multi-node data plane** — the farm proxy only reaches farm-local
  hubs (`proxy.rs` hardcodes `127.0.0.1`, `servers` has no host column;
  re-verified 2026-08-20), so agent-hosted hubs on remote nodes are
  lifecycle-managed but unreachable through the farm domain. ~3–4 days
  (2026-08-06 assessment): additive `servers.host` + agent-advertised address
  in the WS `hello`, host-aware proxy on both paths, agent passing the public
  host to spawned hubs so `/info` advertises a correct `voice_wt_url` (voice
  stays direct QUIC to the node), monitor driving remote hubs via heartbeats.
  No hub or client changes. **Settle first**: private networking farm↔nodes
  instead of farm↔node TLS, and per-node Postgres. Design:
  [farm-impl.md](docs/farm-impl.md).
- **Hosted web client** — undesigned, deliberately. Would decouple the client
  version from any single hub and be the canonical entry point for public
  hubs; alongside the discovery site is the obvious home, though they are
  different artifacts (Next.js vs a static Vite SPA). Already enabled by CORS
  defaulting to `*` on a bearer-token API, so it can talk to arbitrary hubs
  with no per-hub setup. **It can never be the only channel**: an HTTPS page
  cannot call an `http://` hub, which rules out LAN mode, self-signed hubs,
  and trying Wavvon before buying a domain — so the hub-served copy stays.
  That constraint is in
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

- **An invite link opens raw JSON** — `GET /join/{code}` is a JSON preview
  endpoint, so the link an operator sends renders as JSON in a browser. First
  step of every new user. Needs both halves: hub serves the web client for a
  browser request, *and* the client reads the code from
  `window.location.pathname`, which it never looks at today.

- **Voice audio is choppy across the internet** — arrives but breaks up. Not
  reproduced locally on the same build, which is itself a clue. See Next up.

- **No speaking indicator in voice** — roster and `video-tile.speaking` exist,
  so a missing surface rather than missing plumbing.

- **No server-limits admin surface** — upload size and similar operator caps
  are env-var only, with no page in hub admin.

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
