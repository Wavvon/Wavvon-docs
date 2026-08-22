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

- [ ] **Voice in alliance channels.** Designed 2026-08-22 —
  [alliances.md](alliances.md) "Voice in alliance channels",
  [decisions.md](decisions.md). Web client + hub only; the relay does not
  change and there is no wire-format work. Slices, in order: origin-hub
  `POST /alliances/:id/voice-grant`; the optional `alliance_voice_grant`
  field on `/auth/verify` plus the `alliance_voice` scope allowlist and
  `alliance_voice_visitors` table; the `voice.alliance` capability string;
  the web `joinAllianceVoice` flow; the `voice_remote_join` policy column.

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
  against it, and 81 of 86 specs pass against a genuinely fresh hub locally
  (shipped log). **The workflow itself has never run on a runner** — it is
  authored, not verified, and the first push to `develop` is its first
  execution. Left:
  - watch that first run and fix what only a runner shows: hub build time, any
    library `--with-deps` does not cover, and whether Chromium there accepts
    the hub's self-signed WebTransport cert the way it does locally;
  - **`57-dm-messaging` still fails.** The member's conversation row, matched
    on the owner's display name, never appears. Not diagnosed further — it is
    the only one of the five failures that was not stale-spec rot, so treat it
    as a real DM-liveness or display-name bug until shown otherwise. It is
    plausibly the same root as the paired-device DM item below;
  - point a run at a farm-hosted `/hub/<slug>`, which is what the URL override
    was the prerequisite for.

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

- **~296 UI strings are still hardcoded English** — the member settings
  surface was brought up to full coverage on 2026-08-21 (notifications,
  privacy, and the whole voice tab), but the rest of the app never went
  through i18n. By area: ~169 in the hub admin panel, ~21 forum, ~19 the
  recovery-contacts settings section, ~12 message/content area, ~11 channel
  settings, and a long tail of `title`/`aria-label` attributes. Locale
  coverage is enforced (`pnpm check-i18n` fails on a missing key) but only for
  keys that exist — a string that never became a key is invisible to it. A
  scan for JSX text nodes and `placeholder`/`aria-label`/`title` literals
  finds them; the work is mechanical, four locales per string.

- **Voice audio was choppy across the internet** — cause found and fixed
  2026-08-21 (no playout scheduling in the web client; see shipped log). The
  jitter only exists on a real network, so **the audible confirmation is still
  outstanding** — it needs a session on the pilot. Reopen this if it persists.

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
