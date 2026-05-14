# Voxply Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
shipped features, design questions — lives in the wiki at
[`docs/`](docs/README.md).

## 🔨 Next up

- **Android client icons** — placeholder solid-color PNGs in place. Waiting on logo (see [`docs/brand.md`](docs/brand.md)). Run `cargo tauri icon <1024x1024.png>` once ready.
- **Multi-device pairing** — QR pairing UI, subkey issuance, device list. Infrastructure already in place (DB schema, endpoints, auth enforcement). Designed in [`docs/multi-device.md`](docs/multi-device.md).

## 🚧 Blocked

- **Android client icons** — placeholder solid-color PNGs in place. Waiting on logo (see [`docs/brand.md`](docs/brand.md)). Run `cargo tauri icon <1024x1024.png>` once ready.

## 📌 Wishlist (undesigned)

Things we want to build but haven't committed to a design yet. Designed
items live in the wiki — see
[`future-features.md`](docs/future-features.md),
[`farm-model.md`](docs/farm-model.md),
[`gaming.md`](docs/gaming.md).

- **Performance ceiling** — load test WS broadcast, search, voice relay
- **Accessibility + i18n** — keyboard nav audit, screen-reader, localization
- **Key revocation (enforcement)** — hub now rejects revoked keys in HTTP auth and WS handshake. Full multi-device story (subkey issuance, QR pairing UI, prefs sync) lives in [`docs/future-features.md`](docs/future-features.md).

## ⚠️ Known issues

- Avatars uploaded full-resolution to every hub — base64 in `users.avatar`; doesn't scale
- No custom display font — system stack only

## 💤 Won't do

- **Load-aware DM routing across a user's hubs** — failover only; load-balancing needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable cross-platform; live meter covers it
