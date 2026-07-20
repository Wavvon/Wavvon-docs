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
- [ ] **Component parity passes (consolidation tail)** — mechanical
  hoist, the three union passes, and the settings-IA implementation all
  shipped 2026-07-20 (shipped log). Remaining: the orchestrators
  (ContentArea, ChannelMessageList, DmView) and the open capability
  gaps in the [client-parity.md](docs/client-parity.md) ledger
  (notably desktop soundboard playback and per-account local_store
  namespacing on desktop).

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
- **Desktop parity backlog** — role categories/color/icon (needs
  desktop Tauri commands), named custom themes, data-export archive
  compat, LAN discovery UX (mDNS + QR). (Shipped to desktop 2026-07-20
  via consolidation + settings-IA: events UI, roles admin, presence
  Invisible+TTL, settings IA + profile model, multi-account.) Details
  in [`client-parity.md`](docs/client-parity.md).
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
- **Recovery-contact rotation is a dead end** — desktop's rotation
  request UI posts empty attestations and the hub has no
  attestation-collection endpoint at all; the feature needs a design
  pass before either client's UI can work (found during the 2026-07-20
  consolidation; see [client-parity.md](docs/client-parity.md)).

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
