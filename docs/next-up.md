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

- [ ] **Rebuild the permission model — delete `admin`, name every action.**
  Designed 2026-09-15: [permissions.md](permissions.md) carries the model and
  the ~40-entry catalogue, decisions.md ("No wildcard permission") the
  rationale and the three shapes rejected. `admin` answers **83 checks across
  26 files**, so the smallest thing an operator can delegate is the whole hub.

  Order of work:
  - **Validate permission strings in `create_role` / `update_role`.**
    Independent of everything below and buildable today — nothing validates
    them, so any string lands in `role_permissions`.
  - **`voice.join`**, the one catalogue entry with no predecessor, and
    independent of `messages.read`. Beyond the gate itself, it splits one
    call that has one meaning today: the channel list becomes read **or**
    voice-join, WS auto-subscribe stays read **only**
    ([permissions.md](permissions.md) §3, Voice). Conflating those two leaks
    a talk-only channel's messages over the socket.
  - **The catalogue itself**, plus the endpoint that serves it and the
    derivation endpoint ("why can this member do X here").
  - **`moderation.ban.temporary`** needs the feature under it: `bans` has no
    `expires_at`.

  Sequencing: `bots.admit` in the catalogue is provisional on the `is_bot`
  review below, and the alliance item further down supplies two of the
  catalogue's entries — see both.

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
    therefore admin" as an argument. (`manage_bots` itself is deleted rather
    than wired — [permissions.md](permissions.md) §4 says why, and it is the
    opposite answer to the alliance one from the same question.)

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

  Sequencing note: this overlaps the permission rebuild above (both ask "what
  should this check actually read"), and its outcome decides whether the
  catalogue keeps `bots.admit` or collapses it into `invites.manage`. The DM
  guard shipped 2026-09-14 reads
  `is_bot` — whatever replaces it has to keep that door shut.

- [ ] **The invite list never forgets anything.** `list_invites`
  (`hub/src/routes/invites.rs`) selects every row, ordered by creation date,
  with **no condition on `expires_at` and none on `uses >= max_uses`** (checked
  2026-09-15). So an invite that expired in July and one that burned its single
  use months ago sit in the admin panel next to the live ones, and the list
  only grows. An operator looking for "which way in is currently open" has to
  work it out row by row.

  The decisions to make, none of them large:

  - **Filter, mark, or both.** Hiding dead invites is the smallest fix;
    marking them (`expired`, `used up`) and offering a filter keeps the history
    readable. A third option — showing live ones by default with a "show all"
    — is what the rest of the admin panel does elsewhere, so it is probably the
    house style.
  - **Whether dead rows should be deleted at all.** They are a record of who
    invited whom, which moderation may want; the retention worker exists and
    could take them after a while.
  - **Whether a live invite can be revoked**, which is the other half of the
    same screen and worth checking while in there.

  Noticed on the way, and now folded into the permission rebuild above:
  listing invites requires **`manage_channels`**. That is the permission for
  making channels, and nothing about an invite is a channel — the catalogue
  gives it `invites.manage`. Revoking a live invite already exists
  (`revoke_invite`, `invites.rs`), so that half of the screen is wiring.

- [ ] **"Add this bot to my hub", without hand-rolling an invite.** An idea,
  not a design. Today an admin who wants one specific bot has to mint an invite
  and get the code to its operator; what they want is a button that means *this
  bot, and only this bot, may come in*.

  The piece that does not exist yet, and is the whole point: **an invite bound
  to a pubkey**. Invites are bearer codes — whoever holds the string may use
  it, once or many times. "Only this bot" is therefore approximate today: the
  code could be redeemed by anyone it reaches. A single-use invite that names
  the pubkey it admits makes the promise exact, and it is just as useful for
  admitting one *person* you already know the key of.

  Then the button is thin: mint a pubkey-bound, single-use invite with an
  optional role grant, and deliver it. Delivery is the second open question —
  the operator can paste it, or the hub can push to an endpoint the bot
  advertises, which is the shape the alliance push-invite already uses for
  hubs.

  **Sequencing**: this lands naturally *after* the bot-flag review above. If
  bots stop being special, `POST /bots` collapses into "mint a pubkey-bound
  invite with a role grant" and this button is simply how that is offered —
  one flow for admitting anybody, with the bot case being the one where the
  recipient is a process. Building the button first would harden the special
  case instead of removing it.

- [ ] **Alliance permissions — stop making federation an admin job.** Designed
  2026-09-14 (decisions.md, "Alliance permissions: one hub permission plus a
  per-alliance grant list"). All ten alliance endpoints require `admin`, so
  delegating one federation link means handing over the whole hub — and the
  channel's own settings now offer sharing, which makes that gate visible to
  every operator.

  Named `manage_alliances` when designed on 2026-09-14; the id is
  `alliances.manage` under the catalogue above, substance unchanged. The two
  permissions below are catalogue entries — build them with it, or rename
  them after.

  Two pieces, in this order:
  - **`alliances.manage`**, a hub permission like the others: one constant, the
    check swapped in ten handlers, the catalogue and the roles UI. Carries
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
  manage-this-alliance **and** `channels.manage` on the channel. Sharing is
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
