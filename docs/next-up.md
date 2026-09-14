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
  codebase, two targets, selected by `MULTI_HUB` in `apps/web/src/constants.ts`
  (`VITE_BUILD_TARGET`, `vite build --mode hub` → `dist-hub`), with
  `scripts/check-hub-build.mjs` asserting the dropped screens are absent from
  the bundle. The flag, the member-invite path, the early handoff link, the
  late `postMessage` handover, the passkey question and both halves of the
  build pipeline all shipped between 2026-08-26 and 2026-08-29 (shipped log).
  **What is left is one thing: deploying the user build.** `discovery/` is
  already a running Next.js site and is the obvious host, but it has no
  deployment of its own yet, and `USER_CLIENT_URL` stays null until that host
  has a domain — which is also what keeps the handover button and its
  `check-hub-build` marker dormant.
  - LAN mode keeps the hub build as its only web path — an HTTPS page cannot
    reach an `http://` or self-signed LAN hub ([lan-mode.md](lan-mode.md)).

- [ ] **App.tsx refactor — the tail.** Web 1,665 lines / desktop 1,793,
  counted 2026-09-06. Hook extraction and both modal render trees landed
  between 2026-07-28 and 2026-09-06 (shipped log), and decisions.md 2026-09-05
  declined the state store, so nothing left here shrinks App.tsx by moving
  plumbing. Two things remain, and neither is the mechanical work the item
  started as:
  - **the full encrypted data-export archive on desktop** — the only surface
    still genuinely web-only, and it is a **feature port with a design question
    in it** (what "restore into a new account" means when an account is a
    directory on disk rather than a browser store), not parity plumbing
    ([client-parity.md](client-parity.md)). Everything else on that list closed
    or turned out never to have been a gap: the outgoing-webhook manager
    2026-09-10, the connection readout 2026-09-11, and event role slots, which
    both clients have had all along.
  - **hook convergence** — four pairs are merged (`useUnreadCounts`,
    `useWhisper`, `useTypingIndicators`, `useAlliances`). The rest were
    surveyed 2026-09-07 and are **not the same job**: `useSettingsProfile` is
    not really a pair, `useDms` needs desktop's send path moved into a command
    layer first, and `useScreenShare`/`useVideo` have diverged in *features*
    rather than transport, so converging them is the parity work above wearing
    a hoist's clothes. Measurements and verdicts:
    [client-parity.md](client-parity.md). Do one if the surrounding code is
    being reworked anyway; do not schedule them for their own sake.

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

  **It is also the last unproven step in voice at all.** Both harnesses now
  drive the chain to Opus decode — `62-voice-datagram` between two web clients
  and `63-alliance-voice-audio` across an alliance, each of which found total
  silence on its first run (shipped log) — and neither can prove a speaker
  made a sound. Two clients on a real network is the only thing that does, and
  no harness is planned for it.

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

- **Voice audio was choppy across the internet** — cause found and fixed
  2026-08-21 (no playout scheduling in the web client; see shipped log). The
  jitter only exists on a real network, so **the audible confirmation is still
  outstanding** — it needs a session on the pilot. Reopen this if it persists.

- **Windows installer unsigned** — SmartScreen warning; "More info → Run
  anyway". See the code-signing blocker.

- **Bot deferred scope** — bot DMs: no timeline, and refused at the hub since
  2026-09-14 rather than merely unbuilt ([bots.md](bots.md)). (Voice/video
  injection and bot-launched game modals shipped 2026-07-19 as
  capability-layer Phases 1–2.)
