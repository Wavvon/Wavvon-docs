# Client state access: props, context, or a store

**Status: DECIDED 2026-09-05 — containers only.** See
[decisions.md](decisions.md), "Client state access: containers only. No
context, and no store until a ref mirror actually breaks something".

- **Phase 1 — done.** Implemented 2026-07-29 (clients `7eba1fe`) and extended
  since: `ChannelSidebarContainer`, `SettingsPageContainer`,
  `HubAdminContainer`, `AppModals`. Web App.tsx is 1,679 lines against the
  ~1,650 estimated; desktop 2,055 against ~1,900 (the voice-move overlay
  cluster and modals were kept out of the sidebar container's scope, and
  desktop's parity pass is still open in [next-up.md](next-up.md)).
- **Phase 2 (store) — not built, deferred with a trigger.** The stopping
  condition this document itself named under "What would change my mind" was
  met. The refs it exists to delete have grown from ~13 to 19, and that class
  of bug has still never appeared in 4,107 lines of
  [shipped-log.md](shipped-log.md) — so it is a papercut, as this doc
  predicted, not a fire. Reopen on the first real defect caused by one.
- **Phase 3 (personal-axis slice) — not built.** Depends on Phase 2.
- **React Context — rejected outright**, on the three counts in Option 2 below.

The evaluation below is kept as written: it is the reasoning the decision
rests on, and Phase 2's plan is intact should the trigger fire.

Context: after the two App.tsx refactor passes (decisions.md 2026-07-28
/29) web is 1,868 lines and desktop 2,274, and what's left is dominated
by prop threading into the prop-only shared components. This doc
evaluates whether to keep that, add React Context, or add a small store
— i.e. the React answer to Blazor's `CascadingValue` / DI'd state
container.

## What the code actually looks like today

All paths in the **Wavvon-clients** repo.

- `clients/apps/web/src/App.tsx` — hook wiring lines 121–1090, JSX
  1107–1868. Two call sites dominate: `ChannelSidebar` (1380–1486, 106
  lines) and `ContentArea` (1564–1649, 85 lines).
- `clients/apps/desktop/src/App.tsx` — same split at 111–1391 / 1392–2274;
  `ChannelSidebar` 1705–1862 (157 lines), `ContentArea` 1863–2099 (236
  lines). Desktop threads more because it has no props-forwarding wrapper
  as thin as web's.
- Prop surfaces: `clients/packages/ui/src/components/layout/ChannelSidebar.tsx:83-192`
  (~90 props), `clients/packages/ui/src/components/content/ContentArea.tsx:52-166`
  (~100). Web's wrapper `clients/apps/web/src/components/layout/ContentArea.tsx`
  adds ~20 platform-action props on top.
- **No `createContext`, no store library anywhere in `clients/`** —
  verified by grep. React is 19, so `useSyncExternalStore` is stdlib.
- **`packages/ui` has no component render tests** — only pure util suites
  (`src/utils/__tests__/*`, `components/layout/__tests__/channelSidebarLayout.test.ts`).
  So "providers make components harder to test" is a theoretical cost
  here, not one we'd actually pay.
- Hand-mirrored refs in web App.tsx alone: `publicKeyRef`, `meInfoRef`,
  `mentionPingEnabledRef`, `effectiveNotifyModeRef` (399–406),
  `activeHubIdRef`, `hubsRef`, `channelsRef` (545–559), plus
  `selectedChannelRef`/`selectedChannelIdRef`, `myPresenceRef`,
  `whisperOptoutRef`, `selectedConvIdRef`, `loadHubDataRef`,
  `voiceExtRef`. All exist for one reason: the WS handler registry is
  frozen (`clients/apps/web/src/hooks/useWsHandlers.ts:59-80`,
  `useMemo` with `[]`) and may only read refs, stable setters, or
  module functions.
- Precedent for passing a whole hook result as one prop already exists:
  `clients/apps/web/src/components/admin/HubAdminContainer.tsx:22-45`
  takes `hubAdmin={hubAdminState}` and spreads it internally.

## Option 1 — status quo (prop-only + hooks)

**Buys:** components in `packages/ui` are pure functions of their props,
so a capability a client lacks is just an omitted optional prop. That is
literally what made the 2026-07-20 consolidation and the union rule
work — web can ship whisper reply binds while desktop omits them, no
shared abstraction to negotiate. Zero re-render analysis: React's
default top-down invalidation plus `useMemo` is the whole model.

**Costs:** ~190 lines (web) / ~390 lines (desktop) of App.tsx are pure
plumbing; adding one prop to a shared component is a 3-file edit
(component, web call site, desktop call site) and drifts silently when
one app forgets. Every new WS-visible piece of state costs a hand-written
ref mirror. This is the floor decisions.md already named.

## Option 2 — React Context slices

Providers in each app (`SessionProvider`, `HubDataProvider`,
`VoiceProvider`, `PersonalPrefsProvider`), consumed by hooks inside
`packages/ui` components. Actions objects travel in the context value
exactly as they travel in props today — no new injection mechanism
needed, `ForumActions`/`MessageRowActions` just move from prop to
context field.

- **Re-render blast radius is the real problem.** A context re-renders
  every consumer on any identity change of its value. Voice state
  changes multiple times a second in a call (`voicePartByChannel`,
  gains, chips); the message list must not re-render for that. Avoiding
  it means splitting into many narrow contexts, memoizing every value
  object, and `React.memo` on consumers — i.e. we hand-maintain the
  precision a selector gives for free, and a careless `useMemo` dep
  silently costs frame rate in the highest-traffic screen we have.
- **It does not help the frozen WS registry at all.** Context is only
  readable from render/hooks; the handlers run outside React. Every ref
  mirror stays.
- **It couples `packages/ui` to a provider contract.** An optional prop
  a client omits becomes a context field both clients must supply, which
  works against the union rule and the "web is source of truth, desktop
  omits what it lacks" posture.
- Migration is genuinely incremental (a component can read context and
  accept props, props winning) and testability cost is near zero given
  no render tests exist.
- **End state:** web ~1,400, desktop ~1,750, plus ~150 lines of provider
  per app.

## Option 3 — a small external store

Selector subscriptions (`useStore(s => s.channels)`) re-render only
consumers whose selected value changed, which removes the entire
blast-radius question. Crucially the store is readable and writable
**outside React** — `store.getState()` / `store.setState()` are stable
identities — which is exactly what the frozen WS registry wants. The
~13 ref mirrors and the `loadHubDataRef` dance collapse into direct
`getState()` reads; that bug class (a frozen memo capturing render-one
values) stops existing.

**No new dependency.** zustand is not installed and doesn't need to be:
React 19 ships `useSyncExternalStore`, and a `createStore` with
`getState`/`setState`/`subscribe` plus a `useStore(selector)` hook is
~30 lines in `packages/core`. That clears the project's "no new dep for
what a few lines can do" bar, and we get the two things we actually want
(selectors, non-React access) without zustand's middleware surface.

**Cost:** it's a second state model living next to hooks, so "where does
this live" becomes a judgement call on every new feature. And if store
reads go *inside* `packages/ui` components, we take the same coupling hit
as option 2 — so this proposal keeps them out.

**Slice boundaries follow the two-axis model** ([README.md](README.md)
reading order, [home-hub.md](home-hub.md)):

- **Community-axis slice**, keyed by active hub: channels, users,
  meInfo/roles, messages, voice roster, alliances. Resets on hub switch —
  which is already an explicit function (`resetChannelSelectionState`,
  web App.tsx:248).
- **Personal-axis slice**, spanning hubs: notify modes, blocks/ignores,
  presence, theme/skin, drafts, whisper prefs. Its authority is the home
  hub, not the community hub, so it must not be re-keyed on hub switch —
  a boundary the two-axis model gives us for free and props today only
  imply.
- Voice/session transport state stays in its per-app hooks; it's
  platform-bound (Tauri vs WebSocket) and already isolated.

**End state:** web ~1,100–1,200, desktop ~1,500–1,600, with ~400 lines
of per-app store modules and ~13 ref mirrors deleted.

## The `packages/ui` hooks (2026-07-28)

`useVoiceMoveUx`, `usePresenceStatus`, `useHubSetupWizardGate` are
unaffected under every option: they're prop-injected hooks holding their
own local state, and `useVoiceMoveUx` already solves the frozen-handler
problem locally by keeping its dependency in a ref
(`clients/packages/ui/src/hooks/useVoiceMoveUx.ts:25-26`). They stay the
seam: an app can feed store values *into* them without `packages/ui`
importing a store. Don't migrate their state into a store; there's no
win.

## Recommendation

**Phase 1 now: container extraction, no new state mechanism. Phase 2 (a
~30-line `useSyncExternalStore` store) only for the state the WS
registry already mirrors into refs. Reject context outright.**

Context is the worst of the three here: it costs re-render discipline in
the voice/message hot path, does nothing for the ref problem that's
actually bitten us, and is the one option that couples `packages/ui` to
a provider contract.

Phase 1 is the lazy move: the repo already has the pattern
(`HubAdminContainer`, `AppModals`, web's `ContentArea` wrapper), it needs
no new concepts, and it gets most of the line reduction the user asked
for. It also doesn't foreclose anything — containers are exactly where
store reads would later land.

### Phased plan

**Phase 1 — containers for the top 3 call sites (~half a day per app).**
Extract `ChannelSidebarContainer`, `ContentAreaContainer` (desktop; web
already has the wrapper, extend it), and `SettingsPageContainer` per app.
Each takes grouped hook-result objects (`voice`, `whisper`, `prefs`,
`hubData`) instead of 90 flat props, and spreads them onto the shared
component. Shared components unchanged — prop-only stays true.
Expected: web 1,868 → ~1,650, desktop 2,274 → ~1,900.

**Phase 2 — store core + community-axis slice (1–2 days per app).**
`createStore`/`useStore` in `packages/core`; move channels, users,
meInfo, hubs, selectedChannel, voice roster into it; rewrite
`useWsHandlers` to `getState()`/`setState()` and delete the ref mirrors
including `loadHubDataRef`. Containers select from the store. Do web
first, land it, then desktop.
Expected: web ~1,300, desktop ~1,650.

**Phase 3 — personal-axis slice (1 day, deferred until Phase 2 holds).**
Notify modes, blocks/ignores, presence, theme. Candidate for a *shared*
slice in `packages/core` with a per-app persistence adapter, since only
storage differs (`accountScope` on web, `local_store.rs` on desktop).

### What would change my mind

- If the Android rewrite ([android-rewrite-notes.md](android-rewrite-notes.md))
  becomes near-term, a third client raises the value of components that
  self-serve state, and option 2/3-inside-`packages/ui` gets a real
  argument.
- If Phase 1 alone lands App.tsx somewhere the user is happy with, stop
  there and skip Phase 2 — the ref mirroring is a papercut, not a fire.
- If we ever adopt render tests in `packages/ui`, re-check: providers
  would then have a harness cost that today they don't.

## Deferred

React Compiler (would change the memoization calculus), any store reads
inside `packages/ui`, unifying the same-named per-app hooks (already
rejected 2026-07-28), and moving the `packages/ui` hooks' state anywhere.

---

## Draft decisions.md entry — NOT the decision that was taken

**Superseded.** The entry below was drafted when this doc recommended
containers *plus* a store. The decision actually taken on 2026-09-05 accepted
the containers and declined the store; it lives in
[decisions.md](decisions.md) and is authoritative. Kept because the one claim
it rests on is worth remembering as a mistake: it justifies the store as
protecting against "a frozen memo capturing first-render values — the real bug
class", and that bug class had by then never occurred once in this codebase.
Nobody checked before writing it down.

> ## Client state access: containers now, a tiny store for WS-visible state; no context
>
> **Decision (PROPOSED — never accepted; see above)**: shared components in
> `packages/ui` stay prop-only. App.tsx shrinks in two phases: (1)
> per-app container components absorb the prop threading for the three
> highest-prop call sites (`ChannelSidebar`, `ContentArea`,
> `SettingsPage`), taking grouped hook-result objects rather than ~90
> flat props — the `HubAdminContainer` pattern generalized; (2) a
> ~30-line `useSyncExternalStore` store in `packages/core` owns the
> community-axis state the frozen WS handler registry currently reads
> through ~13 hand-mirrored refs, which are then deleted. Personal-axis
> state moves in a later phase, as a separate slice, because its
> authority is the home hub and it must not reset on hub switch.
>
> *Alternatives considered*: **React Context slices** — rejected on three
> counts: a context re-renders every consumer on any value change, so the
> voice hot path would re-render the message list unless we hand-maintain
> memo discipline the selector gives free; it does nothing for the frozen
> WS registry, which reads outside render and would keep every ref; and
> it turns "optional prop a client omits" into "context field both
> clients must supply", against the union rule. **zustand** — rejected:
> React 19's `useSyncExternalStore` plus ~30 lines gives the two features
> we want (selectors, non-React access), and the project's bar is no new
> dependency for what a few lines can do. **Status quo** — kept as the
> Phase 1 baseline and still the answer if Phase 1 lands the files at an
> acceptable size.
>
> *Tradeoff*: two state models coexist (hooks + store), so "where does
> this live" becomes a per-feature judgement call. Accepted because the
> store is scoped to exactly the state that already had to be mirrored
> into refs, which is where the real bug class lives (a frozen memo
> capturing first-render values — the `loadHubDataRef` note in
> `useWsHandlers.ts`).
>
> *Outcome*: (to be filled after implementation — target web ~1,300,
> desktop ~1,650.)
