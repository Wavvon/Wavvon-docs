# Desktop Client

Tauri 2 + React 19 + TypeScript. Lives at `apps/desktop/` in the
Wavvon-clients monorepo (shared TS in `packages/core|ui|i18n`).
Two halves:

- **Rust shell** (Wavvon-clients: `apps/desktop/src-tauri/`) — file I/O,
  voice, OS notifications, system tray, OS-native dialogs. Communicates
  with the UI via Tauri commands, one module per command domain.
- **React UI** (Wavvon-clients: `apps/desktop/src/`) — `App.tsx` is the
  state orchestrator; almost every visual component (sidebars,
  `ContentArea`, `HubAdminPage`, settings tabs, modals) is shared from
  `packages/ui`. Web is the source of truth for the UI; see
  [client-monorepo.md](client-monorepo.md) and
  [client-parity.md](client-parity.md).

## Persistence (per-account)

The desktop client is multi-account. JSON files live under `~/.wavvon/`:
an `accounts.json` registry plus one directory per account
(`accounts/<id>/` — identity, pairing cert, home hub list, DM ratchet
state, per-account local store). Device-global prefs (voice, appearance)
stay at the root. Path helpers: Wavvon-clients
`apps/desktop/src-tauri/src/accounts.rs`; the per-account vs
device-global split is in `local_store.rs`. Personal-axis state that
should follow the user (prefs blob, block list, home hubs) syncs through
the home hub — see [home-hub.md](home-hub.md).

## Themes

Two built-in themes, dark and light, plus custom skins that start from
one of them ([custom-themes.md](custom-themes.md)). Tokens are CSS
variables applied via `data-theme` on the root, all in the single
stylesheet `packages/ui/src/styles.css`; switching is a dataset change.
Light overrides shadow tokens too — the dark-mode shadow values would
look heavy on a light background.

## Voice surface in the sidebar

Voice lives in `voice`-type channels (decisions.md, "Voice lives in voice
channels"). Each voice channel with anyone in it renders the participants
nested underneath it in the sidebar. The data comes from
`GET /voice/participants`, polled (`apps/desktop/src/hooks/useVoice.ts`).

The user's mute mic and deafen toggles live in the sidebar footer next
to the settings gear, and only render when the user is in voice on
some channel. The button shape is `.btn-icon-gear` shared with the
gear; an `.active` modifier turns it red while toggled on.

## WebSocket lifecycle

The Tauri side opens one WebSocket per connected hub and forwards
events to React. When the connection drops (hub restart, network blip),
the client emits `hub-ws-status: connected=false`. The React side
handles this by scheduling an automatic reconnect with exponential
backoff (1s, 2s, 4s, … capped at 30s) — no user action required. The
existing "Reconnect" button in the banner is a manual override that
resets backoff and tries immediately.

The backoff helper is shared (`packages/core`); per-hub timers and
counters clear on success or when the user leaves the hub.

## State organisation

`App.tsx` is the orchestrator, but most application state now lives in
per-domain hooks under `apps/desktop/src/hooks/` (`useHubLifecycle`,
`useChannelMessages`, `useDms`, `useVoice`, `useWsHandlers`, ...), which
App.tsx composes. The earlier rule — everything in one flat App.tsx, no
domain hooks — is superseded (status 2026-11: the hooks exist; read the
code, not this page, for which hook owns what). What still holds:

- Shared components in `packages/ui` are **prop-only**: no closures over
  app state, no platform imports. Data access arrives as callback or
  actions-object props.
- **No application-state context, no state library.** React state covers
  everything; props are explicit and type-checked.
- `packages/ui/src/hooks/` holds only network-free hooks; anything that
  fetches stays in the app.

## Conventions

- **No router**. Internal "pages" are just conditionally rendered panels.
- **Client never trusts the hub for permissions** — it shows or hides UI
  based on what the hub returns; the hub re-checks every action.

## Tests

The Tauri Rust side has unit tests in `#[cfg(test)]` blocks across the
`src-tauri/src/` modules. We deliberately avoid testing Tauri
commands directly (they need a real `AppHandle` / `State` / runtime);
instead we cover the boundary logic that doesn't need any of that —
URL encoding, serde shapes (so an old prefs file still round-trips),
and small pure helpers. Run with `cargo test` from `src-tauri/`.

To grow the suite: any function that takes plain values and returns
plain values is fair game. Anything that touches `dirs::data_dir()`
needs to take a base path to be testable (`accounts.rs` does: its `*_in(base)`
variants are what the tests drive).

The React side runs vitest (`npm run test` in `apps/desktop`), as do
`packages/core` and `packages/ui`.

## Sibling clients

The web client ([browser-client.md](browser-client.md)) is the delivery
target and the source of truth for the shared UI; desktop reuses the same
`packages/ui` components and swaps only the platform adapter (Tauri
commands instead of `apps/web/src/platform/`). Both carry voice over
WebTransport to the hub (see [voice.md](voice.md)); desktop runs its audio
pipeline in the Rust `crates/voice` crate. The Android client was removed
2026-07-12 ([android-client.md](android-client.md)).

## What's not done

- Plugin system (a skin gallery exists: [custom-themes.md](custom-themes.md) §11)
