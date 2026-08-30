# Next up

**What we are working on and about to work on.** Everything here is
*designed* — the thinking is done and the remaining work is doing it — plus
the open bugs.

Work that is on the list but **not yet designed** lives in
[future-features.md](future-features.md). Things we might introduce one day
and have not committed to live in [wishlist.md](wishlist.md). Shipped work
moves to [shipped-log.md](shipped-log.md); design rationale to
[decisions.md](decisions.md).

## 🔨 In flight

- [ ] **Split the web client into a hub build and a user build.** Designed
  2026-08-25 — decisions.md, "Two web clients: one per hub, one per user". One
  codebase, two targets: the hub build shows one hub and its interconnections,
  the user build (hosted by us, next to the directory) is the only one that
  knows what a list of hubs is.
  - **one repo, one app, two targets** — not two repos and not two `apps/`
    directories. Measured 2026-08-25: 328 files and ~51k lines across
    `apps/web` + `packages/ui`, of which **11** touch discovery / add-hub /
    create-hub / home-hubs at all. The difference is UX, not code; the hub
    build is the user build *minus* entry points, and a subtraction wants a
    flag. Two `apps/` dirs would fork `App.tsx`, the app-local state
    orchestrator, which is the one file not to duplicate. Two repos would also
    make a fifth copy of the wire-format mirror and re-run the divergence that
    `packages/ui` was created to undo (desktop's `Other => {}`: four hub
    features silently absent for months). Revisit only if the hub build ever
    becomes *additive* — its own features rather than fewer.
  - **[done 2026-08-26]** the flag: `MULTI_HUB` in
    `apps/web/src/constants.ts`, from `VITE_BUILD_TARGET` via `.env.hub` and
    `vite build --mode hub` — no `vite.config.ts` change needed, and the
    literal comparison still folds, so the dropped screens leave the bundle.
    `npm run build:hub` → `dist-hub`; `scripts/check-hub-build.mjs` asserts
    three **code-only** markers present in `dist` and absent from `dist-hub`
    (i18n keys are useless as markers — the catalogs ship whole in both
    builds, which is how the first version of that check failed on a clean
    bundle). Dropped: the `+` menu, AddHubModal, the create-hub wizard, the
    directory, the home-hub editor. `WelcomeScreen` gained `hubUrlLocked` so
    the address cannot be retyped into a second, unreachable hub.
    What the hub build **keeps**: everything cross-hub that routes through its
    own hub (alliance channels, messages, forum — all already `hubFetch`),
    *and* alliance voice, which dials the owning hub's relay direct. Defining
    the flag as "one origin only" would break alliance voice.
  - **[done 2026-08-26]** the member-invite path: `redeemInvite` calls
    `POST /join/:code` when a path invite arrives with a live session, so an
    invite clicked by an existing member applies its role grant instead of
    being dropped. The effect waits on a restore-settled flag rather than
    racing it — `hubs.length` cannot tell "restored, empty" from "not run".
  - **[done 2026-08-26]** the early handoff, as a **link** rather than a
    postMessage: only hub URL and invite code travel, both public. Offered on
    the identity-creation screen (`USER_CLIENT_URL`, null until the hosted app
    has a domain), received as `?hub=&code=` and collapsed to an invite URL so
    the add-hub flow sees one shape; `handoffTargetUrl` round-trips against the
    real parser in test.
  - **[done 2026-08-26]** the late handover, by `postMessage`:
    `packages/core/handover.ts` (protocol + guards — a malformed seed rejects
    the whole offer rather than dropping the field, which would read as a join
    that quietly left the identity behind), `MoveToUserClientSection` sending,
    `/adopt` receiving, wired in `main.tsx` so it runs without the app booting.
    The receiver names the sending origin as the browser reports it, shows the
    fingerprint and asks; the sender wipes only on the acknowledgement, then
    reloads onto the identity screen carrying a "you moved" notice. Verified
    across two real origins in both directions — including that "keep my
    identity" wipes nothing, which is where a wrong wipe would destroy a key.
  - **[done 2026-08-29]** RP ID: it has no bearing, because the user build
    never gets to pick one — decisions.md, "Passkeys belong to the hub, so the
    user build has none". A passkey's rp_id is the hub's own hostname and a
    browser only honours an rp_id the page is registrable under, so the
    ceremony works on the page a hub serves and nowhere else. The affordances
    are now gated on `passkeysUsableWith(hubUrl)` — the page's origin, not the
    build flag, so a self-hoster serving either build gets the right answer —
    and the handover screen no longer promises a new passkey on the other side.
  - **[done 2026-08-29]** the build half of the release pipeline: `build.yml`
    and `release-web.yml` build both targets and run `check-hub-build`, the
    hub's Dockerfile bakes `dist-hub` (`WAVVON_WEB_CLIENT_DIR` unchanged), and
    the release attaches `web-dist-hub.tar.gz` next to `web-dist.tar.gz` so a
    bare-binary install has the right artifact. Both come from one commit,
    which is what makes "version-matched" true by construction rather than by
    discipline. Nothing downstream had known about the split until then: every
    hub was serving the *user* build, offering add-a-hub and the home-hub
    editor from its own origin, and `check-hub-build` — never wired into CI —
    had gone red when the create-hub removal took two of its markers with it.
    No Playwright smoke per target: the bundle check already proves the dropped
    screens are absent, and it cannot be fooled by a screen that renders
    nothing.
  - release pipeline, the half that is left: **deploying the user build**.
    `discovery/` is already a running Next.js site and is the obvious host, but
    it has no deployment of its own yet, and `USER_CLIENT_URL` stays null until
    that host has a domain — which is also what keeps the handover button and
    its `check-hub-build` marker dormant.
  - LAN mode keeps the hub build as its only web path — an HTTPS page cannot
    reach an `http://` or self-signed LAN hub ([lan-mode.md](lan-mode.md)).

- [ ] **Farm multi-node data plane — the monitor, and a real two-machine
  run.** [farm-model.md](farm-model.md) "Multi-node data plane". Everything
  else landed 2026-08-29/30: the `servers` columns, a host-aware proxy on
  both dial paths with `ca`/`pin` TLS, the agent advertising its address in
  `hello`, and per-node database provisioning. Left:
  - the farm monitor drives remote hubs by agent heartbeat rather than local
    process inspection, which is what it still does;
  - **nothing has yet proxied to a hub on a different machine.** The TLS half
    is tested against real handshakes and the routing half against loopback,
    which is one machine wearing two hats. A topology scenario with a real
    second node — or one honest manual run — is what would close it.

- [ ] **Browser e2e in CI — the tail.** The suite is no longer tied to one
  laptop: `WAVVON_E2E_HUB_URL` / `WAVVON_E2E_APP_URL` override both ends, an
  `e2e-live.yml` workflow starts postgres, builds the hub and drives Chromium
  against it, and the suite is green against a genuinely fresh hub locally — 85 passed,
  1 skipped, 0 failed (shipped log). **The workflow itself has never run on a runner** — it is
  authored, not verified, and the first push to `develop` is its first
  execution. Left:
  - watch that first run and fix what only a runner shows: hub build time, any
    library `--with-deps` does not cover, and whether Chromium there accepts
    the hub's self-signed WebTransport cert the way it does locally;
  - the workflow sets no `WAVVON_PUBLIC_URL`, matching the local run it was
    verified against. That leaves `/info.voice_wt_url` null, so the voice specs
    pass without a datagram ever crossing — they cover UI state, not audio. Set
    it and see what starts failing before trusting this job on voice;
  - `54-ttt-game` skips itself unless a ttt-bot is running, silently, so this
    job reports green having run 85 of 86. Either start the bot in the workflow
    or accept it knowingly;
  - `57-dm-messaging` was logged here as a
    probable DM-liveness bug and was not one: it matched the owner's display
    name against the seed constant, and P24 renames the owner without putting
    the name back, in a suite that shares one hub in file order. P48 already
    read the name back from `/me` for exactly this reason; P57 now does too.
    Worth remembering as a shape — "element(s) not found" in a suite with
    deliberately shared state reads like a product bug and often is not;
  - **the suite needs a fresh database per run, and its README says otherwise.**
    Re-running against a database two previous runs had already filled produced
    four failures in entirely different specs from the run before — accumulated
    channels, roles and members, not a regression. CI is unaffected (it creates
    the database), but the local recipe telling you a persistent `wavvon_e2e` is
    fine is how a green suite turns red for no reason;
  - point a run at a farm-hosted `/hub/<slug>`, which is what the URL override
    was the prerequisite for.

- [ ] **Topology e2e — the stages not yet built.** `e2e-topology/` at the
  monorepo root drives real hub binaries plus the discovery site: alliance
  formation across two hubs, federated channel reads, the alliance voice grant
  and its confinement, `voice_remote_join`, the cert pull between two hubs,
  directory publish + search, one farm end to end, and two farms with an
  alliance across the boundary. **16 scenarios**, green (the seed stage went
  with the seed crate). It has found five real bugs so far, each invisible to
  the in-process suites for the same reason — those construct their own state,
  so the real defaults and the real proxy were never in the picture (shipped
  log). What it does not cover yet:
  - **audio.** The visitor is admitted and handed a relay URL, cert hash and
    token, and stops there — no datagram crosses. This proves admission, not
    audio, and two clients on a real network remains the only thing that proves
    audio.
  - **a browser over the top.** Tried, and it works —
    `WAVVON_E2E_HUB_URL=http://localhost:<port>` against a topology hub runs
    `11-channel-crud` 5/5 in 22 seconds. Not wired into `run.mjs` yet, which is
    all that is left here.

- [ ] **Bundle PostgreSQL into the hub binary** — the zero-prerequisite
  install story. Design and rationale:
  [The hub bundles PostgreSQL](decisions.md#the-hub-bundles-postgresql-and-never-touches-one-it-did-not-create).
  Feasibility verified 2026-08-08: `postgresql_embedded` 0.21.0 publishes both
  musl targets the release workflow builds (`x86_64` 24.8 MB, `aarch64`
  24.6 MB) and embeds the archive at compile time.
  - [ ] Embedded when `WAVVON_DATABASE_URL` is unset, plain client when set — removes today's silent fallback to `postgres://postgres:postgres@localhost:5432/wavvon`.
  - [ ] Version-scoped `installation_dir` + explicit `data_dir`; the crate defaults to `~/.theseus/postgresql` and a **tempdir**, neither acceptable for a server.
  - [ ] Major-upgrade path per the dump/restore decision, refusing rather than half-migrating.
  - [ ] `doctor` reports which mode is active and where the data lives.
  - [ ] Verify `backup`/`restore` against the embedded instance.
  - [ ] Test `initdb` on musl — limited locale support, likely needs `--locale=C`.
  - Does not restore SQLite's one-file backup. Still `pg_dump`.

- [ ] **`db move --to <url>` / `--from <url>`** — the last slice of
  [One mechanism moves the data](decisions.md#one-mechanism-moves-the-data-logical-dumprestore);
  the mechanism itself shipped 2026-08-09 as `backup`/`restore`. Waiting on
  bundling on purpose: with no embedded side, `move` is exactly `backup` then
  `restore` against another URL, which both commands already do.

- [ ] **Upgrade path — the embedded-PostgreSQL dimension.** The rest closed
  2026-08-09 (shipped log). What is left needs bundling first: an upgrade may
  then also carry a **PostgreSQL major** upgrade, a different failure surface,
  and `hosting.md` needs a paragraph for it. Coupled to the capability work —
  upgrading a hub also swaps the web client it serves.

- [ ] **Desktop live-drive verification — DMs and pairing.** Both are pinned
  by cross-language vector tests and neither has been driven in a real desktop
  app: a web↔desktop DM exchange, and web↔desktop *pairing* (Mechanism A,
  shipped 2026-08-08). Same session, same harness — Tauri dev +
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port` + Playwright
  `connectOverCDP`. A paired device is where a wrong DH scalar fails silently
  rather than loudly, and this missing harness is why the DM bugs survived so
  long. Build it reusable.

- [ ] **App.tsx refactor — final slices + convergence.** Web 1,694 lines /
  desktop 2,104, counted 2026-08-20 — **up 117 and 196** since the 2026-08-07
  count, so this is currently moving the wrong way. The hook-extraction phase
  landed 2026-07-28 and after (shipped log; decisions.md 2026-07-18). Left:
  - **modal render tree** (web) — 12 `{showX && <XModal/>}` blocks → a `Modals` component fed by a props object;
  - **desktop parity pass** on the web slices desktop still lacks;
  - **convergence** — the actual payoff: web/desktop hook pairs (`useDms`, `useScreenShare`, `useWhisper`, …) differ mainly in platform access, which can travel in via an injected actions object like `packages/ui` components already do. Hoist converged pairs into `packages/ui`, delete both app copies. App.tsx stays app-local orchestration by design.
  - Not worth extracting (checked 2026-07-27): message send/edit.

- [ ] **List-endpoint pagination — remaining lists.** One keyset dialect
  (`limit` + cursor) exists and everything new follows it; the first pass
  landed 2026-08-08. Verified still unbounded 2026-08-20 — worth a sweep when
  someone hits one: `/moderation/bans`, `/moderation/mutes`, `/invites`,
  `/hub/pending`, `/conversations`, `/channels/{id}/pins`,
  `/channels/{id}/polls`, `/roles`, `/channels`, the banlist trio, `/emojis`,
  `/hub/icons`, `/badges`. None grow the way DM history does, hence not
  urgent.

- [ ] **First external operator pilot.** A hub is live on an external
  operator's own server, **wiped and rebuilt on v0.5.0 (2026-08-21)** after an
  in-place 0.3.2 → 0.5.0 upgrade proved the migration path; the old install
  held two accounts and zero messages, so nothing was worth keeping. The hub
  boots blank and its first-boot owner invite is **unredeemed**. Remaining:
  redeem it, operator onboarding + ownership transfer, hub naming and channel
  setup, whether the docs were enough to get there, and the two-operator
  federation test. First real operator feedback arrived 2026-08-21 — four UI
  items fixed same day, the rest in Known issues. Host details and
  per-deployment steps stay out of this repo.

- [ ] **Voice v2 across the internet — confirm the fix on the pilot.** It has
  crossed: audio arrives over WebTransport/QUIC, so port, cert trust tier and
  relay all work. It arrived choppy, and the cause turned out to be the web
  client scheduling every frame on arrival rather than the network (fixed
  2026-08-21). What is left is one two-client session on the pilot to hear
  whether it is actually gone.

## 🚧 Blocked

Committed, cannot proceed.

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity; ship unsigned with the documented SmartScreen workaround
  ([code-signing.md](code-signing.md)). Consequence worth naming: with the
  desktop client not seriously distributable, web is the only real channel,
  which is what makes the capability/version-skew work product scope rather
  than a 1.0 nicety. A desktop client is structurally immune to that skew, so
  signing would relieve pressure there too.

## ⚠️ Known issues

**Open, and not necessarily scheduled** — a bug being listed here says it is
real and unfixed, not that anyone is on it. When one is fixed its entry moves
to the [shipped log](shipped-log.md).

- **DMs are read from the active hub, not from the home hub list.** Federated
  delivery already walks the recipient's designation
  (`routes/dms/messages.rs`), and since 2026-08-25 every account gets a
  designation automatically — so a user who signs in to one hub, abandons it and
  lives on another has inbound DMs landing on the abandoned one, visible only
  after switching to it. Same hub for almost everyone, so this is a tail case,
  but it is the client half of [home-hub.md](home-hub.md) "DM delivery" not
  being built yet: the canonical inbox is meant to be read across the list, with
  the accepting hub mirroring to its peers.

- **1,011 UI strings are still hardcoded English**, across 135 files —
  measured, not estimated, by `packages/i18n/find-hardcoded.mjs`. The "~296"
  this entry used to claim was an undercount from a line-wise scan that missed
  every label written across lines (`>\n  Remove\n<`), which is most of them.
  `check-i18n` proves every key in `en.json` exists in it/es/de and cannot see
  a string that never became a key, which is how four "complete" catalogs and a
  mostly-English UI coexisted.
  Now gated: CI fails when a file gains a literal, so the number only ratchets
  down (`hardcoded-baseline.json`, re-banked with `--baseline` after each
  batch). Done so far — the hub admin page, certifications, outgoing webhooks
  and the federated ban list, 114 strings. Biggest remaining, by count:
  `RolesSection` 48, `AlliancesSection` 44, `RecoveryContactsSection` 43,
  `ChannelSettingsModal` 40, `ProfileEditorSection` 37, `SurveyAdminSection`
  and `ForumPostDetail` 35 each.
  Mechanical, but four shapes need hands rather than a scan-and-replace, and
  they are written up in the clients `CLAUDE.md`: a local `const t` that
  shadows the translator, a second component in the same file needing its own
  hook, `window.confirm("…")`, and prose wrapped across source lines or broken
  around `<strong>`/`<em>`.

- **Voice audio was choppy across the internet** — cause found and fixed
  2026-08-21 (no playout scheduling in the web client; see shipped log). The
  jitter only exists on a real network, so **the audible confirmation is still
  outstanding** — it needs a session on the pilot. Reopen this if it persists.

- **The VAD threshold now decides audibility, and only the custom profile can
  change it.** Gating transmission on speech (2026-08-22) turned a threshold
  that used to control an *indicator* into one that controls whether anyone
  hears you. 0.02 RMS sits comfortably between room noise and normal speech, and
  the 400 ms release means no clipped syllables, so this is a risk rather than a
  known failure — but a quiet mic that used to be heard without lighting up the
  speaking indicator is now a quiet mic nobody hears. The sensitivity slider
  exists only under the **custom** audio profile; standard gets a fixed
  constant and no way to lower it. Either surface the slider outside custom, or
  have the mic-test meter say plainly when the level never crosses the gate.
  Reopen as a bug the first time someone reports going silent.

- **The web client misbehaves against a hub reached at `127.0.0.1` rather than
  `localhost`.** Same hub, same settings, isolated working directories both
  times: `11-channel-crud` is **5 of 5 in 22 seconds** on
  `http://localhost:<port>` and **3 of 5 failing over 3.3 minutes** on
  `http://127.0.0.1:<port>`. The smoke spec passes either way, so basic
  connectivity and auth are fine — it is the channel-management interactions
  that time out. Root cause not found; `parseHubInput` treats both as local, so
  it is not that. Matters because an operator reaching a hub by IP is a normal
  thing to do, and because the failure mode is timeouts rather than an error
  anyone could act on. `e2e-topology/` now uses `localhost` so nobody
  rediscovers it by accident.

- **Discord importer needs a live run** — `export` with a real bot token +
  `apply` against a running hub never exercised live.

- **Windows installer unsigned** — SmartScreen warning; "More info → Run
  anyway". See the code-signing blocker.

- **Bot deferred scope** — bot DMs: no timeline. (Voice/video injection and
  bot-launched game modals shipped 2026-07-19 as capability-layer Phases 1–2.)

- **Own encrypted DMs from another device show "[decryption failed]"** — the
  own-plaintext stash is device-local by nature (a ratchet can't decrypt its
  own envelopes), so a paired second device can't render messages the first
  device sent. Edge of the tracked paired-device canonical-DM follow-up
  ([client-parity.md](client-parity.md) pairing item).
