# Voxply Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
shipped features, design questions — lives in the wiki at
[`docs/`](docs/README.md).

## 🔨 Next up

- **Android keyboard nav parity** — apply `FocusTrap`, `:focus-visible` ring, and roving tabindex to `android/voxply-desktop/src/` component copies (keyboard shortcuts and cheat-sheet modal excluded — no physical keyboard on Android). See [`docs/accessibility.md`](docs/accessibility.md)

## 🚧 Blocked

_(nothing blocked)_

## 📌 Wishlist (undesigned)

Things we want to build but haven't committed to a design yet. Designed
items live in the wiki — see
[`future-features.md`](docs/future-features.md),
[`gaming.md`](docs/gaming.md).

_(nothing — everything designed is either shipped or in "Next up")_

## 🧭 Designed, not started

_(nothing)_

## ⚠️ Known issues

_(none currently)_

## 💤 Won't do

- **Load-aware DM routing across a user's hubs** — failover only; load-balancing needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable cross-platform; live meter covers it
