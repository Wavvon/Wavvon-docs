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
  - the build flag: a boolean `define` in `vite.config.ts` per target, so a
    literal `false` is dead-code-eliminated and the hub bundle is genuinely
    smaller. `DISCOVERY_URL` in `apps/web/src/constants.ts` is the existing
    shape (a build-time literal with every entry point as a ternary); it just
    needs to become per-target instead of hand-edited. What the hub build drops:
    hub switcher,
    add-hub, directory, create-hub, home-hub settings. What it **keeps**:
    everything cross-hub that routes through its own hub (alliance channels,
    messages, forum — all already `hubFetch`), *and* alliance voice, which
    dials the owning hub's relay direct. Defining the flag as "one origin only"
    breaks alliance voice.
  - the handover: a button on the **identity-creation screen** opening the user
    build and posting `{hub_url, invite_code?, seed_hex?}` by `postMessage` to
    a build-time target origin. Receiving side names the sending origin and the
    key fingerprint and asks: join with the identity you already have, or bring
    this one in as another account. On ack the hub build wipes its key and
    records the migration so a later visit redirects. Seed never in a URL; no
    silent import; blocked window falls back to phrase / `.wavvon-backup`.
  - **RP ID**: passkeys are bound to the origin and cannot be handed over. The
    early-placement button is the mitigation; a late migration means a new
    passkey on the user build's origin and a dead one on the hub's. Decide
    whether the user build's RP ID has any bearing on hubs at all before
    writing code.
  - release pipeline: CI builds both; the hub Docker image bakes the hub build
    (`WAVVON_WEB_CLIENT_DIR` unchanged), the site deploys the user build.
    `discovery/` is already a running Next.js site and is the obvious host. Both
    artifacts come from one commit, which is what makes "version-matched" true
    by construction rather than by discipline. Plus one Playwright smoke per
    target (the `run-web` skill already drives headless Chromium) asserting the
    hub build's dropped affordances are actually absent — a gate that rots
    otherwise.
  - LAN mode keeps the hub build as its only web path — an HTTPS page cannot
    reach an `http://` or self-signed LAN hub ([lan-mode.md](lan-mode.md)).

- [ ] **Voice in alliance channels — the web client flow.** The hub side
  shipped 2026-08-22: the mint route, the grant field on `/auth/verify`, the
  `alliance_voice` scope and its allowlist, the visitor table, the
  `voice.alliance` capability, the `voice_remote_join` policy column, and six
  integration tests over two real hubs ([alliances.md](alliances.md),
  shipped log). What is left is the client:
  - `joinAllianceVoice(allianceId, channelId)` — mint on the current hub, then
    challenge + verify **against the owning hub** carrying the grant, then a WS
    to the owner, `voice_join`, and `VoiceWtSession` with the returned
    url/token/certHash. `acquireHubToken` already takes an arbitrary hub URL,
    so the auth half is a parameter, not a new flow; the real work is a second
    hub session's lifecycle (its own WS, its own teardown) held only for voice.
  - tear down any existing voice session first, local or remote. The hub
    enforces one session per identity **per hub**, so it will happily let
    someone hold a local room on B and the visited room on A at once — correct
    for the hub, wrong for the mic.
  - gate the affordance on the *owning* hub advertising `voice.alliance`;
    render visitors as `name · HubName`, mediated like federated forum
    authorship and never as a verified badge; name the hub being dialed in the
    join confirmation, because the visitor's IP reaches it.
  - a `voice_remote_join` control on the share row in the alliances admin
    section, next to `forum_remote_write`.

- [ ] **Certification relay across the hubs of one farm.** Designed
  2026-08-22 — [hub-certifications.md](hub-certifications.md) §11. Server
  only, no client work, no capability string, no `openapi.yaml` change.
  The `cert_trusted_issuers` shape bug that blocked it is fixed; what §11
  still owns is a per-issuer URL, including the admin field to enter one.

- [ ] **Farm multi-node data plane.** The two blocking design questions are
  answered — [farm-model.md](farm-model.md) "Multi-node data plane"
  (farm↔node TLS with `ca`/`pin` validation; per-node PostgreSQL). Additive
  `servers.host` / `tls_mode` / `cert_sha256` / `db_url_template`, agent
  advertises its host in the WS `hello`, host-aware proxy on **both** the
  reqwest and the socket-bridge paths. No hub or client changes. **Sequence
  after "A PostgreSQL role per hub"** — per-node Postgres without a role per
  hub isolates between nodes and not within one.

- [ ] **User-configurable trust roots.** Designed 2026-08-22 —
  [server-tags.md](server-tags.md) Part 4. One allowlisted key in the prefs
  blob (`clients/apps/web/src/utils/syncedSettings.ts`), a Settings → Privacy
  section, a "Trust this issuer" action on the badge popover, and one shared
  trust resolver in `clients/packages/ui/src/utils/`. Rendering only — never
  satisfies a hub's `cert_mode` gate. Lowest value of the four; do it last.

- [ ] **A PostgreSQL role per hub.** Farm-spawned hubs get a database or a
  schema of their own, but they all connect with the **same role** — so the
  separation prevents collisions, not a compromised hub reading its siblings.
  `farm/src/db/provision.rs` says so in its own header. A role per hub,
  granted only its own space, works with either layout. Worth doing before a
  farm hosts hubs it does not itself own.

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
  and its confinement, `voice_remote_join`, directory publish + search, one
  farm end to end, two farms with an alliance across the boundary, and the seed
  registry. **17 scenarios**, green. It has found five real bugs so far, each
  invisible to the in-process suites for the same reason — those construct their
  own state, so the real defaults and the real proxy were never in the picture
  (shipped log). What it does not cover yet:
  - **the seed has no consumer.** It is covered now — register, call-back
    verification, list, and both refusals — but discovery has no reference to
    the seed at all and keeps its own farm table, populated by farms POSTing to
    its own `/api/farms`. Two registries, one with no reader. Decide which one
    is the design and retire or wire the other; `server/CLAUDE.md` claimed
    discovery queried the seed, which was never true.
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

- **1,026 UI strings are still hardcoded English**, across 137 files —
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
