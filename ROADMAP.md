# Voxply Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
design questions — lives in the wiki at [`docs/`](docs/README.md).
The full history of shipped work lives in
[`docs/shipped-log.md`](docs/shipped-log.md).

## 🔨 Next up

- [ ] **Validate the aarch64 hub binary** — release CI now builds
  `voxply-hub-linux-aarch64` (musl); untested until the next release runs and
  someone boots it on real ARM hardware.

## 🚢 Pre-launch blockers

- [ ] **Windows code-signing** — SignPath OSS application was refused
  (June 2026, insufficient project popularity). Options: Azure Trusted Signing,
  ship unsigned and re-apply once the project has traction. CI signing hooks
  remain wired. See [`code-signing.md`](docs/code-signing.md).

## 🚧 Blocked

- **Android client icons** — placeholder solid-color PNGs in place. Waiting on
  the final logo asset. Run `cargo tauri icon <1024x1024.png>` once the brand
  logo is ready. See [`brand.md`](docs/brand.md).

## 📌 Wishlist (undesigned)

- **Project visibility push** — README polish with screenshots, a hosted demo
  hub, `docker compose` quick-start, directory listings, launch post. Needed
  both for adoption and for the code-signing re-application.
- **Rate-limit `GET /preview` globally** — per-request SSRF checks exist;
  no global throttle yet.
- **Search admin flush endpoint** — operator-driven reindex without restart.
- **Honour `federated_bans` in outbound messages** — enforced on inbound auth
  only today.
- **Tie UDP voice relay session lifetime to the validated WS session.**
- **Gaming Tier 3** — MMO + persistent shared world; stretch goal. Proximity
  voice is already a platform primitive; only the persistent-world layer is
  undesigned.
- **E2E v2 — Double Ratchet** — forward secrecy upgrade from the shipped
  static-ECDH and sender-key schemes. See
  [`e2e-encryption.md`](docs/e2e-encryption.md).

## 🚀 Recently shipped

- **Full CI test coverage across all repos (2026-06-10)** — vitest suites now
  gated in CI for web (6 tests), android/voxply-web (14 tests), and desktop
  (71 tests); web gains i18n coverage check via tsx; android gains
  `cargo fmt --check` and `cargo clippy -D warnings` gates (scoped to
  `voxply-desktop` crate, which is all that compiles without the Android NDK);
  5 pre-existing clippy warnings in android/voxply-desktop fixed outright (1
  redundant import removed, 2 needless borrows, 1 useless conversion, 1
  `#[allow(dead_code)]` on a planned-but-unused struct); hub cargo test was
  already present; discovery has no test files.

- **WebSocket protocol documented (2026-06-10)** — the protocol contract now
  covers the WS side: connect/auth and framing in `openapi.yaml` (plus a `/ws`
  path entry replacing a stale, inaccurate event list), and a complete
  message-by-message wire reference in
  [`docs/ws-protocol.md`](docs/ws-protocol.md) (34 client→server,
  55 server→client messages, verified against the hub source).

- **Workspace hardening batch (2026-06-10)** — hub security fixes (WS session
  validation, atomic invites, SSRF DNS-rebinding, federated-ban check on farm
  tokens, upload headers), client race/cleanup fixes + error boundaries,
  android parity restored (voice events, speaking indicators), shared
  `@voxply/utils` package consumed by desktop/web/android, wire-format spec
  with cross-client byte-level vector tests (no divergences found), CI gains
  fmt/clippy gates and SHA-pinned actions, pre-commit secret guards in all
  repos, wiki synced with code reality. Follow-up: voice refresh is now
  event-driven (listeners pointed at the events each backend actually emits),
  and the vendored android i18n copy is re-synced with a CI drift check
  (`scripts/check-vendored.sh`) covering both vendored packages. The vector
  suite now also covers DhKeyRecord and all three DM envelopes (1:1, group,
  sender-key distribution), pinned in the spec, both Rust clients, and the
  web clients (no divergences found).

Older entries: [`docs/shipped-log.md`](docs/shipped-log.md).

## ⚠️ Known issues

- **Windows installer unsigned** — SmartScreen warning; workaround "More info →
  Run anyway". See the code-signing blocker above.
- **Cross-farm cert relay** — certifications work per-hub; revocations don't
  propagate across farms. See [`hub-certifications.md`](docs/hub-certifications.md).
- **Per-hub subkey revocation propagation** — revoking a multi-device subkey on
  one hub isn't known to other hubs. See [`multi-device.md`](docs/multi-device.md).
- **Bot deferred scope** — voice/screen-share injection, bot DMs, outgoing
  webhooks, bot-launched game modals: no timeline. See
  [`future-features.md`](docs/future-features.md).
- **Forum: reactions + attachments on posts** — not yet supported. See
  [`forum.md`](docs/forum.md).

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
