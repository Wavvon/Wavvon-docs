# Client Monorepo

Wavvon's three clients — desktop ([client.md](client.md)), browser
([browser-client.md](browser-client.md)), and Android
([android-client.md](android-client.md)) — consolidate into **one
repository** with internal workspace packages for shared code. The Rust
**hub server** (Wavvon-server: `hub/`, `identity/`, `seed/`, …) stays
its own repo: it is a different deploy unit (a server binary / Docker
image, not an app the user installs) and has its own release cadence.

This doc is the plan we execute from. It does not move any repos; it
describes the target, the tooling, how git history is preserved, how CI
and releases collapse, and a staged migration that ships the
currently-broken invite feature once, for all clients, as its first
proof.

> C# analogy for the whole idea: today the three clients are three
> separate `.sln` files that reference each other's source files by
> relative path on disk. The monorepo is one solution with shared
> class-library projects (`packages/*`) that the three app projects
> (`apps/*`) reference as project references. Change a shared library and
> all consumers rebuild against it in the same commit — no NuGet publish
> in between.

---

## Why (the concrete pain)

The clients already share code, but through three fragile mechanisms,
all of which a workspace removes:

1. **Cross-repo `file:` dependencies pull a second React.** `web/utils`
   and `web/i18n` (the `@wavvon/utils` / `@wavvon/i18n` packages, born in
   desktop commit `b68a0de`) live in the **Wavvon-web** repo. The
   desktop consumes them across repos:
   `desktop/desktop/package.json` has
   `"@wavvon/utils": "file:../../web/utils"`. That `file:` link drags in
   `web`'s own `node_modules/react`, and Rollup bundled **two** copies of
   React into the packaged desktop build — production crashed with
   `Cannot read properties of null (reading 'useRef')`. The fix is the
   `dedupe: ["react", "react-dom"]` band-aid in
   `desktop/desktop/vite.config.ts` (commit `7844c31`). A workspace
   hoists React to a single top-level `node_modules`, so two copies
   cannot exist — the bug class is structurally impossible, no dedupe
   config needed.

2. **A cross-repo Vite alias requires two checkouts side by side.** The
   Android web fork reaches back into the desktop repo for UI:
   `android/wavvon-web/vite.config.ts` aliases
   `@components` → `../wavvon-desktop/src/components`,
   `@shared/types` → `../wavvon-desktop/src/types.ts`, etc. This only
   resolves when the sibling checkout is present at the expected path.

3. **The desktop release checks out two repos.**
   `desktop/.github/workflows/release.yml` checks out **both**
   `Wavvon/Wavvon-desktop` and `Wavvon/Wavvon-web` (the "Checkout web
   (for i18n)" step) purely so the desktop build can resolve
   `@wavvon/i18n` from `../../web/i18n`. One repo means one checkout.

4. **CSS is copied verbatim.** The browser client's `styles.css` is a
   hand-synced copy of the desktop's (noted in
   [browser-client.md](browser-client.md)). Drift is a standing risk a
   shared package eliminates.

5. **The triggering bug — invite parsing written 2–3 times.** The
   desktop has `parseHubInput()` (handles `wavvon://` deep links;
   `desktop/desktop/src/App.tsx:1458`). The browser client has hub-invite
   **admin** (create/revoke) but **no** URL/deep-link invite parser — it
   cannot accept an invite arriving as `#invite=<code>` or
   `?invite=<code>` in a URL. Implementing that per client means writing
   it 2–3 times. [browser-client.md](browser-client.md) itself flagged
   the npm-workspace shared package as "Cleanest but … deferred to a
   later refactor" and "A later refactor lifts both files into a shared
   package." **This doc is that refactor.**

### Current real layout (what we are merging)

Each client repo has a doubled inner directory, and Android carries two
inner apps:

```
Wavvon-desktop/
└── desktop/                 git repo root
    ├── desktop/             the app: package.json, vite.config.ts, src/
    │   └── src-tauri/       Rust shell (file I/O, voice, OS, updater)
    └── .github/workflows/   build.yml, release.yml (dual checkout)

Wavvon-web/
└── web/                     git repo root
    ├── web/                 the app: package.json, vite.config.ts, src/
    ├── utils/               @wavvon/utils  (shared, consumed cross-repo)
    └── i18n/                @wavvon/i18n   (shared, consumed cross-repo)

Wavvon-android/
└── android/                 git repo root
    ├── wavvon-desktop/      a desktop-derived fork (Tauri + components)
    └── wavvon-web/          a web-derived fork (vite alias → ../wavvon-desktop/src)
```

So shared code already lives in three places (desktop's
`src/components`, web's `utils`/`i18n`, and whatever the android forks
alias back to) wired by `file:` deps and Vite aliases. The monorepo
turns those ad-hoc edges into named packages.

---

## Target layout

```
wavvon/                          (new client monorepo, repo root)
├── package.json                 workspaces declaration + root scripts
├── pnpm-workspace.yaml          workspace globs (see tooling)
├── packages/
│   ├── core/                    platform-agnostic TypeScript
│   ├── ui/                      shared React components + styles.css
│   ├── platform/                the platform adapter INTERFACE (types only)
│   └── i18n/                    the strings + ICU machinery (today's @wavvon/i18n)
└── apps/
    ├── desktop/                 Tauri shell + src-tauri (Rust); platform impl = invoke
    ├── web/                     Vite SPA; platform impl = fetch/ws adapter
    └── android/                 Tauri mobile shell; platform impl = web adapter + keystore
```

The doubled inner directory disappears: `apps/desktop`, `apps/web`,
`apps/android` are the apps directly. The two Android forks collapse
into a single `apps/android` once the shared UI lives in `packages/ui`
and the platform adapter in `apps/android` — the fork only existed to
get at desktop's components and web's platform layer, which become
imports.

---

## Package-by-package contents

### `packages/core` — platform-agnostic TypeScript

No React, no DOM-only globals, no Tauri. Pure logic shared by every
client (and reusable by tooling):

- **invite / URL parsing** — the unified successor to desktop's
  `parseHubInput()`: parses `wavvon://`, plain hostnames, and the
  invite-bearing `#invite=<code>` / `?invite=<code>` forms. Stage 1
  extracts this first (see migration).
- **wire types** — the TypeScript twin of the hub's request/response
  shapes (today desktop's `src/types.ts`, aliased as `@shared/types`).
- **reconnect backoff** — the exponential-backoff helper
  (`web/utils/useReconnectBackoff.ts`); the timing policy is logic, the
  React `useEffect` wrapper can stay thin in `ui`.
- **validation / formatting / hex** — the rest of today's
  `@wavvon/utils` (`format`, `channels`, `recentEmoji`, `hex`).
- **noble crypto** — the identity crypto (Ed25519 sign, Ed25519→X25519
  derive, AES-GCM, HKDF, BIP39). Used by web and the Android web layer.
  **See the wire-contract constraint below — this code is pinned to the
  hub's test vectors.**

> C# analogy: `packages/core` is a `netstandard` class library with no UI
> framework reference — domain logic only, unit-testable on its own.

### `packages/ui` — shared React components + styles

Everything visual that the three clients share: the component tree from
[client.md](client.md) (`HubSidebar`, `ChannelSidebar`, `ContentArea`,
modals, primitives), the `MobileShell` from
[android-client.md](android-client.md), and a **single** `styles.css`
(ending the verbatim-copy drift in pain #4). Components import the
**platform interface** from `packages/platform`, never `invoke` or
`fetch` directly — that is what keeps them shared.

### `packages/platform` — the adapter interface

Types only: the `platform` object surface from
[browser-client.md](browser-client.md) (`hubs`, `channels`, `messages`,
`dms`, `voice`, `identity`, `prefs`, …) as a TypeScript interface. No
implementation. Each app provides its own concrete implementation:

- `apps/desktop` — a thin wrapper over Tauri `invoke(...)`.
- `apps/web` — the `fetch`/`WebSocket` adapter
  (`web/src/platform/*` today).
- `apps/android` — the web adapter plus keystore-backed identity storage.

This package is the vehicle for the **desktop platform-convergence
goal** already stated in [browser-client.md](browser-client.md): the
desktop calls `invoke(...)` ~120 times directly today; the end state is
both desktop and web import the same typed `platform` object, with the
desktop's being a thin `invoke` wrapper. Putting the interface in a
shared package is what forces both apps onto the same surface — "that
convergence is the real prize." It does not have to happen during the
move; the monorepo just makes it a normal in-repo refactor afterward
rather than a cross-repo one.

### `packages/i18n` — strings + ICU machinery

Today's `@wavvon/i18n` (`web/i18n`), moved in. The desktop's
release-time cross-repo checkout of Wavvon-web (pain #3) exists *only*
to resolve this; once it is a workspace package the dual checkout
deletes itself.

---

## Tooling recommendation

**Package manager + workspaces: pnpm workspaces.**

- pnpm's default **strict, non-flat `node_modules`** with a content-
  addressed store is the direct structural cure for the React-dupe bug
  (#1). A package gets exactly the dependencies it declares, and a single
  physical copy of React is linked everywhere — there is no scenario
  where two Reacts coexist, so the `dedupe` band-aid in the desktop Vite
  config can be deleted, not ported.
- npm workspaces would also hoist and fix the immediate symptom, but its
  flat hoisting is permissive (phantom dependencies resolve by accident),
  which is exactly the looseness that let the original `file:`-React
  problem hide. Given the bug we are designing against, pnpm's strictness
  is worth the one-time "install pnpm" cost.
- The repo already mixes Vite 6/8 and TypeScript 5/6 across clients
  (web on Vite 6 / TS 5.8, desktop on Vite 8 / TS 6). pnpm lets each app
  pin its own toolchain version while sharing source packages — useful
  during the migration when we do not want to force a lockstep upgrade.

> C# analogy: pnpm workspaces ≈ one solution with project references and
> a single restored package cache; npm workspaces ≈ the same but with
> looser resolution that lets a project use a transitive package it never
> referenced. We want the stricter one because a phantom reference is how
> the double-React shipped.

**Task runner: none yet.** Turborepo/Nx earn their keep at many packages
with expensive interdependent builds and remote caching needs. At three
apps and ~four packages, root `pnpm -r run build` / `pnpm --filter`
covers it. Revisit if build times or the package count grow; adding a
task runner later is non-disruptive. (C# analogy: don't reach for a
distributed `msbuild` orchestration layer to build three projects.)

**Git history preservation: `git subtree add`.** Bring each existing
repo in as a subtree onto its target path, preserving full history:

```
git subtree add --prefix=apps/desktop  <desktop-remote>  main
git subtree add --prefix=apps/web       <web-remote>      main
git subtree add --prefix=apps/android   <android-remote>  main
```

- `git subtree` keeps the imported commits reachable, so `git log
  --follow` and `git blame` still work after the move — important
  because the clients carry months of audit-fix and refactor history.
- The alternative, **`git filter-repo`** (rewrite each repo to a
  subdirectory, then merge), produces a cleaner single root history but
  rewrites SHAs and is more error-prone to drive by hand. subtree is the
  lower-risk choice for a one-time consolidation of three repos.
- A plain `cp` + single "initial commit" is rejected: it throws away the
  history that `git blame` needs to explain why the dedupe hack and the
  android forks exist.
- The shared dirs (`web/utils`, `web/i18n`, desktop's `src/components`)
  are imported with their app, then **moved** into `packages/*` in a
  follow-up commit inside the monorepo, so their history survives the
  import and the move is an ordinary in-repo `git mv`.

> C# analogy: `git subtree` is "add the existing project folders into the
> new solution keeping their VCS history," not "copy the .cs files into a
> fresh repo."

---

## CI consolidation

Today each repo carries its own workflows; the desktop's `release.yml`
and `build.yml` are the load-bearing ones, plus Android's `android.yml`
(on-demand, [android-client.md](android-client.md)).

In the monorepo, one `.github/workflows/` directory holds all client CI,
with **path filters** so a change to `apps/web` does not trigger an
Android NDK build:

- `build.yml` — on PR / push to `main`. Per-app jobs gated by
  `paths: apps/desktop/** packages/**`, etc. Each job runs
  `tsc --noEmit` + that app's tests, and — closing the
  [ROADMAP](../ROADMAP.md) "CI never builds production bundles" item —
  an actual `pnpm --filter <app> build` so packaging regressions
  (the double-React class) surface in CI.
- `release-desktop.yml` — the old desktop `release.yml`, but the
  **"Checkout web (for i18n)" step is deleted**: `@wavvon/i18n` is now
  `packages/i18n` in the same checkout. One `actions/checkout`, no
  `Wavvon/Wavvon-web` cross-repo fetch. The macOS universal-libopus
  steps and the updater-manifest job (below) are unchanged.
- `release-android.yml` — the existing on-demand Android workflow, paths
  unchanged in spirit, now reading shared UI from `packages/ui` instead
  of the sibling-fork alias.
- `release-web.yml` — produces the web bundle (and is what the hub's
  Docker web-builder stage checks out; see release/updater migration).

Triggering: keep tag-scoped releases per app so versions stay
independent (per [packaging.md](packaging.md) §6 "Each repo tags
independently"). With one repo, use **prefixed tags** —
`desktop-v0.2.5`, `web-v0.3.0`, `android-v0.1.0` — and scope each
release workflow to its tag prefix. This preserves independent client
versioning without three repos.

---

## Release / updater migration plan

The desktop Tauri updater and the Android/web download URLs are the
sharp edges of the move. Constraints from [packaging.md](packaging.md)
and the [ROADMAP](../ROADMAP.md):

- **Tauri updater endpoint is decoupled from the repo.** The updater
  reads `https://releases.wavvon.io/latest.json` (configured in
  `tauri.conf.json`), **not** a GitHub repo URL. Moving repos does not
  touch the endpoint the installed apps poll. (Today `latest.json` is
  never published because the macOS build is broken — a separate
  [ROADMAP](../ROADMAP.md) item; the monorepo neither fixes nor worsens
  it.) The manifest-assembly job moves verbatim into
  `release-desktop.yml`.
- **Download URLs change host repo.** `release.yml` builds the asset
  download URL from `$GITHUB_REPOSITORY` — after the move, new release
  assets live under `github.com/Wavvon/wavvon/releases/...` instead of
  `.../Wavvon-desktop/releases/...`. The updater is unaffected because
  `latest.json` carries absolute URLs that the manifest job regenerates
  at release time. **Old releases stay where they are**: leave the
  archived repos' existing GitHub Releases in place (and the repos
  archived, read-only) so already-published download links and any
  in-the-wild `latest.json` keep resolving. New releases publish from
  the monorepo.
- **Tauri updater signing key is unchanged.** Same
  `TAURI_SIGNING_PRIVATE_KEY` secret, same embedded `plugins.updater.pubkey`
  — the keypair is long-lived and repo-independent
  ([packaging.md](packaging.md) §3). Move the secret to the new repo's
  Actions secrets; installed apps still verify.
- **Android keystore is unchanged and must move intact.** The
  long-lived `ANDROID_KEYSTORE_BASE64` secret
  ([android-client.md](android-client.md)) moves to the monorepo's
  secrets. Losing it forces every user to reinstall — back it up
  out-of-band before deleting the old repo's secrets.
- **The hub's Docker web-builder stage re-points.** The hub image bakes a
  web-client build by checking out Wavvon-web
  ([decisions.md](decisions.md), "Hubs may optionally self-serve the web
  client"). That checkout target changes from `Wavvon/Wavvon-web` to the
  monorepo (building `apps/web`). This is a **cross-repo coordination
  point**: the Wavvon-server release workflow lives in a different repo
  and must update its checkout reference when the move lands. Flag it in
  the migration PR.

### Visibility tradeoff (name it)

Consolidating three public repos into one **reduces the org's public
repo count from six to four**. Stars/visibility is a stated project goal
(SignPath signing re-application depends on it), so this is a minor
negative: three separate repos are three separate things to star. The
counter is that one repo with all client code is easier for a newcomer
to read end-to-end and contribute to, and a single "Wavvon clients" repo
with good READMEs is a stronger first impression than three thin client
repos. Net: small, accepted. Keep the archived repos visible (not
deleted) so existing stars/links persist.

---

## Crypto / wire-contract constraint

The TypeScript identity crypto must stay **byte-compatible with the Rust
hub** — the Ed25519 seed format and the DM envelope wire format (see
[e2e-encryption.md](e2e-encryption.md), [identity.md](identity.md)). The
canonical authority is the `identity/` crate in **Wavvon-server**, with
shared test vectors (`docs/wire-format.md` in Wavvon-server).

Two things the doc must state plainly:

1. **Moving TS code between packages does not touch the cross-language
   contract.** Relocating the noble crypto from `web/src/identity` into
   `packages/core` is a file move; the bytes it produces are unchanged.
   `packages/core` crypto stays pinned to the hub's test vectors, and the
   vector tests (already covering DhKeyRecord and all three DM envelopes,
   per [decisions.md](decisions.md)) move with it and keep gating CI.
2. **The hub staying in a separate repo means the crypto contract is a
   genuine cross-repo boundary — but it already is one today.** Desktop,
   web, and Android each reimplement the wire format and validate against
   vectors shipped from Wavvon-server; the hub does not link the client
   crypto and vice versa. Consolidating the clients changes a
   three-clients-versus-one-hub boundary into a one-package-versus-one-hub
   boundary, which is strictly fewer reimplementations to keep in sync.
   **No regression** — and arguably an improvement, since the crypto now
   lives in exactly one TS package instead of being reimplemented per
   client.

---

## Risks

- **Tooling-version skew during migration.** Web (Vite 6 / TS 5.8) and
  desktop (Vite 8 / TS 6) differ. Mitigation: pnpm lets each app keep its
  versions; do not force a lockstep upgrade as part of the move.
- **Tauri + workspace path assumptions.** `src-tauri` expects its
  frontend `dist` at a configured relative path; moving the app to
  `apps/desktop` changes those paths. Mitigation: the path edits are
  contained to each app's `tauri.conf.json` / `vite.config.ts` and are
  caught by the Stage-0 "tree builds" gate.
- **Android fork reconciliation.** `wavvon-desktop` and `wavvon-web`
  forks have divergent behavior (per [ROADMAP](../ROADMAP.md):
  plaintext-group divergences, missing forum view). Collapsing to one
  `apps/android` must preserve those gaps, not silently "fix" them.
  Mitigation: treat fork-collapse as its own stage after the shared
  packages exist, diffing behavior explicitly.
- **Secret migration.** Updater key and Android keystore must move before
  the old repos' secrets are revoked. Mitigation: copy secrets, cut one
  release from the monorepo to prove the pipeline, *then* archive.
- **In-flight work collides with the move.** The clients have active
  audit/QoL work. Mitigation: schedule the subtree import at a quiet
  point; the import is one mechanical commit, so rebasing open branches
  onto the new paths is a path prefix change.

---

## Staged migration plan

Ordered so each stage leaves the tree building and is independently
reviewable. No repos move until this doc is approved.

**Stage 0 — Scaffold + import.** Create the `wavvon` monorepo with the
root `package.json` + `pnpm-workspace.yaml` and empty `apps/` /
`packages/`. `git subtree add` each client onto `apps/*` (history
preserved). Wire pnpm so `pnpm install` resolves; get every app's
existing build green under the new root with **zero source changes**.
Gate: `pnpm -r run build` succeeds for all three apps.

**Stage 1 — `packages/core` + the invite-parser canary.** Create
`packages/core` and make its **first** extraction the unified
invite/URL parser: lift desktop's `parseHubInput()`
(`apps/desktop/.../App.tsx`), generalize it to also parse `#invite=` and
`?invite=`, and have **all three apps** import it. This both proves the
shared-package structure end to end *and* ships the currently-broken
invite-accept feature **once, for every client**. Per the user's
decision, the web client is **not** hotfixed separately — invite parsing
lands only via `packages/core` in this stage, so there is one
implementation from day one.

**Stage 2 — fold the existing shared packages into `packages/core`.**
Move `web/utils` (`@wavvon/utils`) and `web/i18n` (`@wavvon/i18n`) into
`packages/core` and `packages/i18n`. Delete the `file:../../web/utils`
dep and the desktop Vite `dedupe: ["react","react-dom"]` band-aid — pnpm
hoisting makes both obsolete. Move the noble crypto into `packages/core`;
the wire-format vector tests move with it and stay green (the gate).

**Stage 3 — `packages/ui` + single `styles.css`.** Move the shared
React components into `packages/ui`, collapse the verbatim-copied
`styles.css` into one file there, and point all three apps at it. Remove
the cross-repo `@components` / `@shared/*` Vite aliases — they become
ordinary workspace imports.

**Stage 4 — `packages/platform` interface + Android fork collapse.**
Define the platform interface package; have each app provide its
concrete impl. Collapse `android/wavvon-desktop` + `android/wavvon-web`
into a single `apps/android` consuming `packages/ui` + `packages/core`,
preserving its documented feature gaps. (The desktop `invoke`→`platform`
convergence is enabled here but can land incrementally afterward.)

**Stage 5 — CI + release cutover.** Replace per-repo workflows with the
consolidated set (build with real bundle step; prefixed-tag release
workflows; deleted dual checkout). Move the updater key and Android
keystore secrets. Cut one release of each client from the monorepo to
prove the pipeline. Update the hub's Docker web-builder checkout target
(cross-repo PR in Wavvon-server). Archive the three old client repos
read-only (keep their releases resolving). Update
[architecture.md](architecture.md)'s six-repo map.

---

## Cross-references

- Desktop client structure: [client.md](client.md)
- Browser client + platform adapter + the deferred-refactor note this
  doc resolves: [browser-client.md](browser-client.md)
- Android client + keystore + on-demand CI: [android-client.md](android-client.md)
- Repo map this changes (six → four repos): [architecture.md](architecture.md)
- Release/updater/secrets matrix: [packaging.md](packaging.md)
- Wire-format contract the crypto stays pinned to: [e2e-encryption.md](e2e-encryption.md), [identity.md](identity.md); `docs/wire-format.md` in Wavvon-server
- Hub self-serving the web client (Docker web-builder checkout target): [decisions.md](decisions.md)