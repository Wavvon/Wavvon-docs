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
- [ ] **Hub timezone + birthday badge** — in implementation (design in
  [decisions.md](docs/decisions.md) 2026-07-21): admin-set IANA hub
  timezone + client clock; `MM-DD` birthday profile field with 🎂 badge
  on the viewer's local day; triple opt-in (user shares / hub serves /
  viewer renders).
- [ ] **Forum post tags** — next feature after hub timezone + birthday
  badge lands. DESIGNED ([forum.md](docs/forum.md) §10): admin-curated
  tags, multi-tag ≤5 + per-channel require-tag flag, `manage_posts` for
  definitions/retag, bots ride existing REST (poll, no push in v1).
  Driving use case: community bug/feature-request tracker channel.
- [ ] **PinnedMessages union pass** — the one component pair still
  app-local with a real gap (desktop admin unpin vs web; diverging
  wire shapes). Everything else consolidated 2026-07-20 (shipped log;
  status in [client-parity.md](docs/client-parity.md)).

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
  compat, LAN discovery UX (mDNS + QR). Details in
  [`client-parity.md`](docs/client-parity.md).
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
- **Store-crate recovery schema is dead scaffolding** — `crates/store`'s
  `Migrate` trait defines a second, never-called copy of the recovery
  schema, now drifted (no `nonce` column). Cleanup pass, no user impact
  (found during the 2026-07-20 attestation work).

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
