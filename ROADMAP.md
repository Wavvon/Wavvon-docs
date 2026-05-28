# Voxply Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
shipped features, design questions — lives in the wiki at
[`docs/`](docs/README.md).

## 🔨 Next up

- **Accessibility + i18n** — Phase 1 keyboard nav shipped (focus rings, FocusTrap, roving tabindex, global shortcuts, KeyboardShortcuts modal — both desktop and web). Phase 2: ARIA/screen-reader. Phase 3: string extraction. See [`docs/accessibility.md`](docs/accessibility.md)

## 🚧 Blocked

_(nothing blocked)_

## 📌 Wishlist (undesigned)

Things we want to build but haven't committed to a design yet. Designed
items live in the wiki — see
[`future-features.md`](docs/future-features.md),
[`farm-model.md`](docs/farm-model.md),
[`gaming.md`](docs/gaming.md).

_(nothing — see "Designed, not started" for upcoming work)_

## 🧭 Designed, not started

_(nothing)_

## ⚠️ Known issues

_(none currently)_

## 💤 Won't do

- **Load-aware DM routing across a user's hubs** — failover only; load-balancing needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable cross-platform; live meter covers it
