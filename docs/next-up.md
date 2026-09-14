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

- [ ] **Permission model review.** Not designed — the task is to look, then
  decide. Two lists that should agree already do not, found in the first minute
  of reading and not investigated further:

  - `ALL_PERMISSIONS` in `hub/src/permissions.rs` holds **20** strings;
    `ALL_PERMISSIONS` in `packages/ui/src/components/admin/RolesSection.tsx`
    holds **15**, and they are not a subset of each other.
  - Six the hub enforces are absent from the roles UI, so **no admin can grant
    them from any client**: `manage_games`, `create_posts`, `manage_posts`,
    `start_game`, `create_events`, `use_soundboard`.
  - One the UI offers, `manage_bots`, appears **nowhere in the Rust
    workspace** (checked 2026-09-15) and every bot admin route requires
    `admin`. It is a checkbox that saves into `role_permissions` and grants
    nothing. **Decided: delete it from the UI list rather than wire it** — what
    it would gate is admitting a participant to the hub and deciding what it
    may do, which is admission plus capability-granting, and the capability
    layer's premise is "requested by the bot, granted by the admin". A second
    key to that door is not a delegation, it is a duplicate.

    Worth the sentence because it is the **opposite answer to the alliance
    one above, from the same question**: an alliance is an ongoing relationship
    with an outsider and whoever runs it decides nothing about who joins *this*
    hub, so delegating it is sound. Bots are people arriving. Without this
    written down, the inconsistency reads like an oversight and somebody puts
    `manage_bots` back.

  What the review should cover, beyond reconciling the two lists:

  - **Which permissions are enforced anywhere.** One grep per constant, and a
    check that the answer is not zero.
  - **Where `admin` stands in for a permission that exists.** The alliance
    routes are the known case (item above); the question is how many others
    there are, and whether `admin`-only is the right answer for each.
  - **Which permissions are meaningful per channel** versus hub-wide only. The
    overwrite cascade applies to any of them today, including ones where a
    channel-scoped answer is meaningless.
  - **Whether the checks agree with the docs** — `permissions.md` and
    `nested-channels-ux.md` both describe the model, and this session has
    twice found a doc asserting something no code did.
  - A check that keeps the two lists honest afterwards, in the shape of the
    other repo checkers rather than a promise to remember.

- [ ] **Bots are users, and `is_bot` should have to earn its existence.** Not
  designed — the task is to establish what the flag is still for, and replace
  what it is not. Prompted by a question with no good answer: an admin invites
  a bot by typing 64 hex characters, and the hub has no way to know whether a
  process or a person is behind them.

  **The hole that starts it.** `POST /bots` inserts the row with
  `is_bot = TRUE` and `ON CONFLICT DO NOTHING`. That protects an existing
  member — their row is untouched, so nobody can be converted — but it protects
  nobody else: a **stranger's** pubkey, belonging to a person who simply has
  not joined yet, gets a fresh `bot_pending` row with the flag set, and every
  later read treats them as a bot. *Open question the review must answer rather
  than assume*: what happens today when such a pubkey authenticates normally,
  without asserting `is_bot`.

  Two more things found on the way, both small and both worth fixing whatever
  the review concludes:

  - Inviting a pubkey that is already a member **returns 200 with a token that
    can never work** — `/auth/verify` looks for a row with `is_bot = TRUE` and
    that row is not one. A no-op that reports success.
  - `POST /bots` accepts **`manage_roles`** or `admin`, while the
    `/admin/bots/*` routes require `admin`. So inviting a bot is already
    delegable and granting its capabilities is not, which may be right — but it
    is not what anyone would guess, and it undercuts "bots are admission,
    therefore admin" as an argument (see the `manage_bots` note above).

  **The direction to evaluate**: keep bots as ordinary users and let each
  behaviour key off something real instead of a label.

  | What `is_bot` gates today | The candidate replacement |
  |---|---|
  | Skipping the invite-code gate | An invite code — the 32-byte bot token already is one, on a separate path |
  | No default role | Invites already carry `grant_role_id` |
  | Voice admission | `can_speak_voice`, which already gates it *alongside* the flag |
  | Game launch cards, result embeds | `can_use_interactive_ui`, same shape |
  | Exclusion from DMs | **Publishes no DH key** — which is the actual reason, and a property rather than a label |
  | Session expiry | A property of the invite or the session, not of the identity |
  | The badge in the UI | Deriving it from a `bot_profiles` row |

  If every row of that table holds, `is_bot` becomes derived or unnecessary,
  and the ~65 flag reads across 12 files become checks against things that are
  true rather than things that were declared. If one does not hold, that row is
  the reason the flag stays — and then it should say so in one place instead of
  being consulted in sixty-five.

  Sequencing note: this overlaps the permission review above (both ask "what
  should this check actually read"), and the DM guard shipped 2026-09-14 reads
  `is_bot` — whatever replaces it has to keep that door shut.

- [ ] **Alliance permissions — stop making federation an admin job.** Designed
  2026-09-14 (decisions.md, "Alliance permissions: one hub permission plus a
  per-alliance grant list"). All ten alliance endpoints require `admin`, so
  delegating one federation link means handing over the whole hub — and the
  channel's own settings now offer sharing, which makes that gate visible to
  every operator.

  Two pieces, in this order:
  - **`manage_alliances`**, a hub permission like the others: one constant, the
    check swapped in ten handlers, `ALL_PERMISSIONS` and the roles UI. Carries
    the hub-scoped acts — create an alliance, accept or decline an invite,
    leave. Makes the common case possible on its own.
  - **`alliance_managers(alliance_id, role_id)`**, a plain grant list for the
    acts that belong to one relationship: inviting another hub, sharing and
    unsharing a channel, the per-share policies. Not allow/deny/inherit —
    alliances are a handful and flat, and there is nothing for a cascade to
    cascade through. Needs its own capability string
    (`alliance.permissions`) so a client does not offer a delegation an older
    hub would refuse.

  **The check that must not be forgotten**: share/unshare requires *both*
  manage-this-alliance **and** `manage_channels` on the channel. Sharing is
  also a channel act — it puts that channel in front of outsiders — and
  without the second half, whoever handles one federation link could expose a
  private channel they cannot read.

- [ ] **Alliance voice on desktop.** The last of the eleven one-client
  controls, and the only one that was not a wiring gap — the other ten shipped
  2026-09-14 (shipped log). Web opens a **second, visitor** WebSocket to the
  *owning* hub with a minted grant and runs the voice session against it;
  desktop's `voice_join` is bound to the active hub's own socket in Rust and
  has no notion of a visitor session, so this is a feature port in
  `src-tauri`, not a prop.

  Worth the loudest line in the parity story: alliance voice audio was proved
  on 2026-09-10 by two *web* clients (`63-alliance-voice-audio`), so the
  desktop half has never been exercised at all — and two real clients remain
  the only thing that can prove it.

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
