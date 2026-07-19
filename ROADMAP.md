# Wavvon Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
design questions — lives in the wiki at [`docs/`](docs/README.md).
Shipped work goes straight to
[`docs/shipped-log.md`](docs/shipped-log.md) (no "recently shipped"
section here), and Known issues holds **open** issues only — when one is
fixed, its entry moves to the shipped log.

## 🔨 Next up

- [ ] **Networked voice — first cross-internet test** — all four clients
  shipped; the live test over the pilot hub is pending. Phase 2 (voice
  encryption) is separate.
- [ ] **First external operator pilot (videogamezone.eu)** — hub v0.3.1
  LIVE. Remaining: hostname fix (server_name edit + friend's nginx
  reload), redeem owner invite, cross-internet voice test, friend
  onboards + ownership transfer, doc-test feedback, two-operator
  federation test.
- [ ] **Shared-component consolidation (web → `packages/ui`)** — web is
  the source of truth ([decisions.md](docs/decisions.md) 2026-07-18);
  hoist per-component alongside each desktop-parity item. Audit
  baseline: 61 duplicated components, 73% avg divergence.

## 🚧 Blocked

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity. Ship unsigned with the documented SmartScreen workaround.
  See [`code-signing.md`](docs/code-signing.md).

## 📌 Wishlist

> **Big future pillars** (writeups in
> [future-features.md](docs/future-features.md)): farm layer, cross-farm
> cert relay (depends on farm), gaming + rich bots.

- **Farm layer** — serial routing, SSO, lifecycle supervision, and
  agent-hosted restart all shipped; next slices per
  [farm-model.md](docs/farm-model.md) as the pilot surfaces them.
  Known softness: agent delegation (spawn + restart) is fire-and-forget
  — a 200 means enqueued, not confirmed; add request/reply correlation
  if it bites.
- **Gaming + rich bots Phases 2–4**
  ([bot-capability-layer.md](docs/bot-capability-layer.md) §6):
  video/canvas grants, multiplayer session/lobby helper, game-bot
  distribution. Phase 1 (grants + modal + tic-tac-toe demo bot)
  shipped 2026-07-19. Phase 3 (lobby helper) **designed 2026-07-19**
  ([§10](docs/bot-capability-layer.md)) — first slice is bot-side only
  (`wavvon-bot-kit`, no hub change); not built.
- **Forum post federation, write + retraction slices** —
  ([forum.md](docs/forum.md) §9 phases 2–3): proxied writes with
  `author_hub` attribution + origin-hub retraction. Read slice shipped
  2026-07-19.
- **Project visibility push** — hosted demo hub, directory listings,
  launch post. Needed for adoption and the code-signing re-application.
- **Passkey registration from desktop** — blocked by Tauri webview RP ID
  mismatch; needs a native WebAuthn plugin or system-browser handoff.
- **Desktop parity backlog** — role categories/color/icon, role
  assignment + Roles admin tab, settings IA + profile model, presence
  Invisible+TTL, named custom themes. Do by hoisting into `packages/ui`
  (see consolidation above); details in
  [`client-parity.md`](docs/client-parity.md).
- **Events, remaining** — desktop UI (parallel `EventCard`/`EventComposer`
  copies still RSVP-only), live gap: real cross-internet voice audio.
  Calendar view (web) shipped 2026-07-19; §7.4 voice-only-presence e2e
  shipped 2026-07-19.
- **LAN / offline mode, native client half** — nearby-hubs mDNS
  discovery UX and QR scanning are browser-impossible → desktop-era
  ([lan-mode.md](docs/lan-mode.md) §5–§6). LAN hub-to-hub federation
  assessed 2026-07-19 and kept deferred: needs fingerprint-pinning in
  the federation client + a LAN trust model (client.rs is CA-TLS-only),
  no demand until two LAN hubs exist, and web clients can't use LAN
  discovery anyway. Web-feasible slice (invite `?fp=` fingerprint
  verification) shipped 2026-07-19.
- **Personal data export, gaps** — desktop↔web archive compat
  (desktop-era). Prefs-blob decrypt on web + account-scoped custom
  themes both shipped 2026-07-19 (paired devices still can't decrypt
  the blob — no local entropy).
- **Live captions in voice** — local STT, desktop-era.
- **Hub-hosted identity vault** — DESIGNED, **PARKED until after the
  pilot** (do NOT build; [identity-vault.md](docs/identity-vault.md)).

## ⚠️ Known issues

- **Passkey-PRF identity removed (2026-07-19)** — provider support too
  broken; surface pulled (clients `9afe8b0`). Hub-session passkey auth
  stays. Reinstatement notes in [webauthn-auth.md](docs/webauthn-auth.md).
- **Settings account list doesn't refresh mid-session** — account added
  while Settings is open doesn't appear until Settings reopens.
- **Invisible presence gaps (web)** — invisible users still show in a
  voice channel's participant list; no self-distinct indicator (user sees
  themselves offline in their own roster).
- **Flaky e2e: `account-switch.spec.ts` under parallel workers** — passes
  solo; timing race. Deflake or mark serial.
- **Profile favorite-hubs federation** — per-hub only; cross-allied-hub
  visibility needs a signed public-profile envelope.
- **Discord importer needs a live run** — `export` with a real bot token
  + `apply` against a running hub never exercised live.
- **Tic-tac-toe demo bot needs a live run** — unit/integration tested
  (grants, modal gate, relay), but a real two-browser game against a
  running hub hasn't been played yet.
- **Windows installer unsigned** — SmartScreen warning; "More info → Run
  anyway". See the code-signing blocker.
- **Bot deferred scope** — voice/screen-share injection, bot DMs,
  bot-launched game modals: no timeline.

## 💤 Won't do

- **Maintain / converge the old Android client** — removed 2026-07-12;
  clean-slate rewrite when mobile is prioritized
  ([android-rewrite-notes.md](docs/android-rewrite-notes.md)).
- **Load-aware DM routing across a user's hubs** — failover only.
- **Concurrent mic test while in voice** — live meter covers it.
- **Central authority of any kind** — no global directory, identity
  service, or DHT.
- **Subscriptions, premium tiers, or in-chat advertising.**
- **Telemetry collection or data sales.**
- **Global web-of-trust / negative reputation** — federated ban lists are
  opt-in per hub.
