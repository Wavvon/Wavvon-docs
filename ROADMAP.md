# Voxply Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
shipped features, design questions — lives in the wiki at
[`docs/`](docs/README.md).

## 🔨 Next up

- **Screen share (v1)** — WS-relayed WebM chunks, source picker, viewer panel, optional webcam. Designed in [`docs/screen-share.md`](docs/screen-share.md). v2 WebRTC migration deferred.
- **E2E encryption for DMs (v1)** — 1:1 only, static ECDH + AES-GCM, Ed25519-derived X25519 keys, signed envelopes. Designed in [`docs/e2e-encryption.md`](docs/e2e-encryption.md). Group DMs and forward secrecy deferred to v2.
- **Cross-platform packaging** — Tauri bundler (NSIS / AppImage), `tauri-plugin-updater` auto-update, GitHub Actions release pipeline, hub Docker image. Windows + Linux only; macOS deferred (cost). Designed in [`docs/packaging.md`](docs/packaging.md).
- **Android client** — Tauri 2 shell + browser platform layer. Designed in [`docs/android-client.md`](docs/android-client.md). Project bootstrapped; needs Android SDK + JDK installed locally to run `cargo tauri android init`, then wire App.tsx and OS plugins.

## 📌 Wishlist (undesigned)

Things we want to build but haven't committed to a design yet. Designed
items live in the wiki — see
[`future-features.md`](docs/future-features.md),
[`farm-model.md`](docs/farm-model.md),
[`gaming.md`](docs/gaming.md).

- **Performance ceiling** — load test WS broadcast, search, voice relay
- **Accessibility + i18n** — keyboard nav audit, screen-reader, localization
- **Key revocation** — leaked-key story; today is "regen + notify friends"

## ⚠️ Known issues

- `subscribe_all` firehose — every client receives every channel's messages just for unread tracking. Fine at current scale
- Avatars uploaded full-resolution to every hub — base64 in `users.avatar`; doesn't scale
- No custom display font — system stack only

## 💤 Won't do

- **Load-aware DM routing across a user's hubs** — failover only; load-balancing needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable cross-platform; live meter covers it
