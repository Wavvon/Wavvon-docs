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

- [ ] **Client parity — eleven controls reach only one client.** Measured from
  the code on 2026-09-14, not from this list: `packages/ui` components are
  prop-only, so a platform-bound feature arrives as an optional prop an app may
  omit — and a component whose prop is absent **hides its control**. That is
  the sharing model working and also how a feature goes missing with nothing
  failing. `pnpm run check-parity` in `clients/` reports them;
  `scripts/parity-baseline.json` is the to-do list and CI fails on a new one.

  **Missing on desktop:**
  - **alliance voice join** (`onJoinAllianceVoice`) — the 🔊 button beside an
    allied hub's channel is web-only, so desktop cannot join alliance voice at
    all. Worth naming loudly: the alliance-voice audio path was proved on
    2026-09-10 by two *web* clients, so nothing has ever exercised this on
    desktop.
  - **bot capability grants** (`renderBotCapabilities`) — the admin surface for
    the granted-not-self-declared model
    ([bot-capability-layer.md](bot-capability-layer.md) §1). Absent on desktop,
    so an operator on desktop cannot grant or revoke one.
  - **recovery contacts admin** (`renderRecoveryContacts`).
  - **leave hub from the remove dialog** (`onLeaveHub`) — desktop gets
    remove-from-this-device without the server-side leave.
  - **trust a certification issuer** (`onTrustIssuer`).
  - **whisper role targeting** (`onListWhisperRoles`).
  - **start a DM from the member list** (`onStartConversation`).
  - **hub profile saved callback** (`onHubProfileSaved`) and **backup
    acknowledgement** (`onSavedOffDevice`) — smaller, same shape.

  **Missing on web:**
  - **edit a banner channel from the channel context menu** (`onEditBanner`).
  - **opening an image attachment** — not a missing prop but a stubbed one:
    `apps/web/src/components/layout/ContentArea.tsx` passes
    `onOpenImage={() => {}}`, and `MessageAttachments` renders the image inside
    a button. So on web every image attachment is a clickable control that does
    nothing; desktop opens its `Lightbox`. This one is a bug, not a gap.

- [ ] **The full encrypted data-export archive on desktop.** Web has it
  (`FullArchiveSection` — identity, home hubs, prefs, devices and decrypted DM
  history into a passphrase-encrypted `wavvon-archive`, export *and* restore,
  [data-export.md](data-export.md)); desktop has none of it.

  **The design question first, because it is real and small:** web builds the
  archive from the browser's account store and on restore can create and switch
  accounts; desktop keeps accounts in Rust (`~/.wavvon/accounts.json` plus a
  directory per account, driven from `AccountRoot` / `ManageAccountsTab`), so
  *what "restore into a new account" does there* has to be decided before the
  port. Second question, separable: the two envelopes share Argon2id parameters
  and nothing else, so cross-client import needs a shared envelope spec or an
  explicit "not interchangeable" ([data-export.md](data-export.md) §0).

  **Not gated on desktop distribution** (decided 2026-09-14): an unsigned
  installer warns and installs, so desktop users exist and the archive is
  exactly the feature they would want before trusting one client with an
  identity.

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

  **Waiting on the next release** (decided 2026-09-14): the pilot runs v0.5.0
  and everything since is unreleased, so onboarding it now would onboard it
  onto a build we are about to replace. Cutting the release is what unblocks
  this item and the one below.

- [ ] **Voice v2 across the internet — confirm the fix on the pilot.** It has
  crossed: audio arrives over WebTransport/QUIC, so port, cert trust tier and
  relay all work. It arrived choppy, and the cause turned out to be the web
  client scheduling every frame on arrival rather than the network (fixed
  2026-08-21). What is left is one two-client session on the pilot to hear
  whether it is actually gone — so it waits on the pilot, which waits on the
  release.

  **It is also the last unproven step in voice at all.** Both harnesses now
  drive the chain to Opus decode — `62-voice-datagram` between two web clients
  and `63-alliance-voice-audio` across an alliance, each of which found total
  silence on its first run (shipped log) — and neither can prove a speaker
  made a sound. Two clients on a real network is the only thing that does, and
  no harness is planned for it.

## 🚧 Blocked

Committed, cannot proceed.

- **Hosting the user web build** — the split itself is done: one codebase, two
  targets on `MULTI_HUB` (`apps/web/src/constants.ts`, `VITE_BUILD_TARGET`,
  `vite build --mode hub` → `dist-hub`), `scripts/check-hub-build.mjs` proving
  the dropped screens leave the bundle, both halves of the release pipeline
  shipping both artifacts, and the early handoff link plus the late
  `postMessage` handover both built and driven across two real origins
  (shipped log, 2026-08-26 → 08-29). What is missing is **somewhere to put
  it**: there is no VPS and no domain (2026-09-14), `discovery/` has no
  deployment of its own, and `USER_CLIENT_URL` stays null until one exists —
  which is also what keeps the handover button and its `check-hub-build`
  marker dormant. Nothing here is code.
  - LAN mode keeps the hub build as its only web path regardless — an HTTPS
    page cannot reach an `http://` or self-signed LAN hub
    ([lan-mode.md](lan-mode.md)).

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
