# Voxply Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
shipped features, design questions — lives in the wiki at
[`docs/`](docs/README.md).

## 🔨 Next up

_(nothing — all pre-launch blockers are resolved)_

## 🚧 Blocked

- **Demo hub** — code is ready (`DEMO_HUB_URL` constant + conditional button). Blocked on ops: a Voxply-operated hub instance needs to be deployed and the constant flipped to its URL before the "Try a demo hub" button goes live.

## 📌 Wishlist (undesigned)

Things we want to build but haven't committed to a design yet. Designed
items live in the wiki — see
[`future-features.md`](docs/future-features.md),
[`gaming.md`](docs/gaming.md).

- **E2E group DMs** — Signal-style sender-key scheme (v2 of e2e-encryption.md); blocks until 1:1 E2E is proven stable
- **macOS universal binary (arm64 + x86_64)** — blocked by `audiopus_sys v0.1.8` which compiles Opus for the host arch only; current macOS DMG is arm64 (Apple Silicon). Fix requires upgrading the audio stack to a crate that supports fat library compilation.
- **Gaming Tier 3** — MMO + persistent shared world; stretch goal. Proximity voice (attenuating by in-game distance) is a general platform feature now designed separately below.

## 🧭 Designed, not started

- **Gaming Tier 2 client SDK** — server-side sessions, WS relay, host
  promotion, snapshot, shared KV, and reaper are all shipped. Remaining:
  client postMessage SDK additions (`voxply:game:ready/send/start/end/
  sharedKvGet/sharedKvSet/snapshot/setJoinPolicy` + incoming events) and
  the Activities-button live-session badge. Design in `gaming.md §Tier 2`.
- **Windows Authenticode code signing** — EV certificate via SignPath.io
  cloud HSM; CI signing in `release.yml`; removes SmartScreen warning
  permanently. Design in [`code-signing.md`](docs/code-signing.md).
- **Missions system** — sponsor-attested voluntary actions that earn
  cosmetic-only sparks; anti-fraud via PoW + rate limits + sponsor
  callbacks; `Voxply-missions` service (new repo). Design in
  [`missions.md`](docs/missions.md).

## ⚠️ Known issues

- **Group DMs are plaintext** — hub operator can read group DM content; 1:1 DMs are E2E encrypted. Warning shown before entering group DMs. E2E group DMs (sender-key scheme) are in the wishlist.
- **Windows installer unsigned** — users see SmartScreen "Windows protected your PC" warning; workaround documented in CHANGELOG.md (`More info → Run anyway`). Permanent fix requires Authenticode cert procurement (see Wishlist).

## 💤 Won't do

- **Load-aware DM routing across a user's hubs** — failover only; load-balancing needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable cross-platform; live meter covers it
