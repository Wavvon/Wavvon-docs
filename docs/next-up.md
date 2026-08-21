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

- [ ] **A PostgreSQL role per hub.** Farm-spawned hubs get a database or a
  schema of their own, but they all connect with the **same role** — so the
  separation prevents collisions, not a compromised hub reading its siblings.
  `farm/src/db/provision.rs` says so in its own header. A role per hub,
  granted only its own space, works with either layout. Worth doing before a
  farm hosts hubs it does not itself own.

- [ ] **Browser e2e in CI.** No workflow runs Playwright at all. The 57 live
  specs under `apps/web/e2e/live/` only ever run against a hub someone started
  by hand — `HUB_URL` is a hard-coded const in `e2e/live/helpers/live.ts` — so
  the suite that covers the real app is the one nobody runs. Its own piece of
  infrastructure (postgres, hub, vite, browsers). Start by making that URL
  configurable, which also lets the suite point at a farm-hosted
  `/hub/<slug>`.

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

- **Outbound packet loss is not measured** — the connection panel shows
  inbound loss only, because a sender cannot know which of its own packets
  were dropped. The relay can: the voice header's `ctr` is cleartext, so the
  hub sees gaps in a sender's counter sequence and could report them back.
  Needs a hub-side per-sender counter and a periodic stat frame.

- **Voice settings expose a VAD toggle nothing reads** — `customVad` is in
  the voice tab and no code consults it. Its companion `customVadThreshold`
  now drives speech detection (2026-08-21), but transmission is never gated
  on the toggle. Either wire it or take it out of the UI.

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
