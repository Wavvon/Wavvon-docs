# Design Decisions

Why Wavvon is shaped the way it is. Each entry: the decision, the
alternative we considered, and why we chose this. New decisions go at
the top. This file holds the most recent entries; older ones are
relocated verbatim to [decisions-archive.md](decisions-archive.md)
so this file stays small enough to read whole.

## Hub timezone + birthday badge: plain profile field, viewer-local day, triple opt-in

**Decision** (2026-07-21, user idea + calls): two small, decoupled
social features.

1. **Hub timezone** is a `hub_settings` key (`hub_timezone`, IANA name)
   set by admins; clients render an ambient hub-local clock with
   `Intl.DateTimeFormat` (no deps, no server time math yet). It is
   **flavor and a reference point for hub-wide daily features only** —
   message and event timestamps stay rendered in the *viewer's* local
   time. *Alternative considered*: rendering timestamps in hub time —
   rejected, instants must read correctly for every viewer.
2. **Birthday** is a plain nullable `users.birthday` column (`MM-DD`,
   **never a year** — no age PII), riding the existing profile-field
   rails over HTTP. Explicitly NOT a signed envelope / wire-format
   change and NOT federated: shared per hub, deleted per hub.
3. **The badge shows on the viewer's local calendar day** (client-side
   MM-DD comparison). *Alternatives*: hub-timezone day (needs the hub
   setting, confusing when the viewer's calendar disagrees) and
   birthday-owner's timezone (requires sharing a timezone — more PII).
   A birthday is a floating calendar date, not an instant; viewer-local
   matches how humans treat it (and how Facebook renders it).
4. **Triple opt-in, each enforced at its own layer**: user shares
   (setting the field IS the consent; null by default), hub serves it
   (`birthdays_enabled` setting; off = field never leaves the server),
   viewer renders it (`hideBirthdays` in the synced prefs blob). Any
   single "no" wins without coordination.
5. **Badge first; announcement message deferred.** The worker-posted
   "happy birthday" message needs a channel picker, a daily worker,
   hub-midnight math, and chrono-tz — and cannot be un-delivered per
   grumpy viewer. Demand-gated tail.

**Outcome**: in implementation 2026-07-21.

## Recovery attestation: out-of-band id, K=2 default, 14-day expiry, new-key proof

**Decision** (2026-07-20, user calls; design in
[recovery-attestation.md](recovery-attestation.md)): the four open points
of the attestation design, all resolved to the architect's
recommendations. Contacts learn of a rotation request via an
**out-of-band request id** (the hub never pushes vouch requests — no spam
surface); threshold **defaults to K=2 with K=1 allowed** (admin review is
the backstop); pending requests **expire after 14 days**; and opening a
rotation request **requires a signature by the new key** (proves the
requester holds it). Context: the audit behind the design found the hub
was counting attestation signatures **without verifying them** — the
signed `recovery-attestation/v1` envelope + hub-side Ed25519 verification
is the substance of the fix.

**Outcome**: shipped same day — server `4240377` (envelope + verified
attest flow + expiry, 15/15 flow tests), clients `cf6b39d` (TS + desktop
Rust mirrors byte-identical to the vectors, unioned
RecoveryContactsSection with requester/contact UI). One deviation: the
new-key proof carries no nonce (the hub mints it after the request
opens); distinct wire tags keep proof and attestation
non-interchangeable.

## Settings IA unification: desktop adopts multi-account; one cross-platform backup file; one Notifications tab

**Decision** (2026-07-20, user calls; design in
[settings-ia.md](settings-ia.md)): three calls that unblock the last
Settings parity passes.

1. **Desktop adopts web's multi-account model** ("multi-account yes! We
   need that!"). `~/.wavvon/` restructures to per-account identity files +
   an accounts registry; switcher + guarded in-place remount mirror web's
   2026-07-11/12 multi-account decisions; account list stays device-local.
   *Alternative considered* (architect recommendation): stay
   single-identity with a degraded one-account rendering, since web is the
   current delivery target. Rejected — multi-account is wanted on every
   client, and adopting now avoids a permanent single-account conditional
   the web code never exercises.
2. **Backup: phrase-first UI + ONE cross-platform file format.** The user
   rejected per-platform files outright ("the backup should be usable on
   both web or desktop or any other kind of device"). The shared UI leads
   with the 24-word phrase as the canonical backup; the encrypted file is
   secondary but is **one format both clients read and write**: Argon2id
   KDF (web via `@noble/hashes`, desktop via the existing `argon2` crate),
   single JSON envelope, `.wavvon-backup` extension, **one account per
   file** (user call, same day: the user picks which account to export;
   import restores exactly that account — supersedes a multi-account-array
   plaintext considered first). Desktop's `.voxback` (stale Voxply branding, incompatible
   envelope) is retired; alpha rules — no importer for old files.
3. **One Notifications tab on both clients** (mention ping + notify
   sound; desktop's notify-sound moves out of Voice). Per-hub notify
   *mode* stays in the sidebar. The signed-public-profile vs
   favorite-hubs fork stays **deferred** per the 2026-07-19 decision; the
   unified Profile tab renders the web surface and desktop's
   signed-publish control drops from Settings for now.

**Outcome**: shipped 2026-07-20 (clients `2cae216`) — desktop
multi-account storage + switcher, the cross-platform `.wavvon-backup`
format (shared test vector asserted byte-identical in TS and Rust), and
the shared `SettingsShell` (8 tabs / 3 groups on both clients).
Documented cuts in settings-ia.md §7.

## Cross-allied-hub favorite-hubs: defer; reuse the existing envelope, don't mint a new one

**Decision** (2026-07-19): **defer** cross-allied-hub visibility of a
member's favorite hubs. When it is picked up, it reuses the **already-shipped**
`wavvon/public-hub-profile/v1` envelope — no new wire format.

**The premise was stale.** The known issue and the 2026-07-12 Hubs-tab entry
below both say federation "needs a signed public-profile envelope that doesn't
exist yet." It exists: `PublicHubProfile` in `server/crates/identity/src/wire.rs`
(pubkey + `public_hubs[{hub_url, hub_name, joined_at}]` + issued_at, signed by
the identity master key), with a test-vector layout in
[wire-format.md](wire-format.md), stored/verified on the hub in
`public_hub_profiles` (`hub/src/routes/profile.rs`, `GET`/`PUT /profile/{pubkey}`),
and consumed end-to-end by the desktop context menu ("Their hubs",
`fetch_public_profile`). What never happened is reconciliation: the web-shipped
Hubs tab uses a *different, unsigned* per-hub `favorite_hubs` column
(`GET /users/:pubkey/profile`), and nothing fetches either one across an
alliance. So this is two parallel systems, not a missing primitive.

**Why defer anyway**: alpha, no users asking, and the current delivery target
is web-only ([project_delivery_target]) — while the one place the signed
envelope is already wired (desktop) is future. The remaining work is real
cross-repo plumbing (reconcile the two systems, alliance-fetch path, web
render) for a cosmetic feature. The wire-format cost that originally justified
deferring is already paid, but the integration cost isn't worth it now.

**Decided path for when it returns** (so nobody mints `wavvon/favorite-hubs/v1`):
publish the Hubs-tab `favorite_hubs` list *as* a `PublicHubProfile` on change,
only when `show_hubs` is true (publication is the privacy gate — a hidden list
is simply never signed/served, so the gate holds cross-hub with no server-side
enforcement on the reader). Staleness: re-sign on change, keyed by `issued_at`,
newest wins; **no TTL** (consistent with "TTL on the profile is wrong" below).
An allied hub renders a member's favorites by fetching the owning hub's
`GET /profile/{pubkey}` and calling `verify()` — same read-through-proxy shape
as forum federation ([forum.md §9](forum.md)), no new trust infrastructure.

**Alternatives**: mint a new `favorite_hubs` envelope (rejected — the existing
one already carries a signed hub list; ladder says reuse); embed favorites in
the per-hub profile and have allied hubs trust the serving hub's copy (rejected
— unsigned, and it would put personal-axis data on a community hub as
authoritative). Two soft spots to fix on pickup, noted in
[federation.md](federation.md): `display_name`/`avatar` are in the struct but
**not** in the signing bytes (unauthenticated today), and the envelope has no
`icon` field that the Hubs tab's `{url,name,icon}` shape carries.

## Game-bot distribution (gaming Phase 4): reuse invite + discovery, no bot index

**Decision** (2026-07-19): game-bot distribution needs **almost no new
machinery**. A game-bot is structurally just a bot, so *adding* one is the
shipped invite-by-pubkey flow ([bots.md §2](bots.md)) plus the Phase 1
`can_use_interactive_ui` grant — no game-specific step. *Discovering* one
reuses the two shipped opt-in surfaces unchanged: the per-hub bot directory
([bots.md §4](bots.md)) within a hub, and Wavvon-discovery's signed,
pubkey-keyed *hub* listings across hubs ([hub-discovery.md](hub-discovery.md)).
The directory indexes hubs, never bots, so no global bot index appears. Full
design: [bot-capability-layer.md §11](bot-capability-layer.md).

**Alternatives considered**:
- **A global/central game-bot directory** (a browseable index of bots you
  could invite). Rejected outright, not deferred — same ground the central
  hub registry was rejected on ([bots.md Tradeoffs](bots.md)): it needs a
  coordinator Wavvon refuses to be, and is a ROADMAP won't-do.
- **Cross-hub game-bot recommendation over alliances** (an ally surfacing
  its bot list as suggestions). Deferred, not rejected: it reuses federation
  and stays decentralized, so it *would* be design-appropriate — but it
  invents a hub-to-hub bot-list read path with its own trust/staleness cost
  for a benefit no operator has asked for. Revisit on demand.

**Tradeoff**: discovery is coarse — a user finds a *hub* that runs a
game-bot (via a `games` tag on its listing) and tries it there, rather than
browsing bots directly. Accepted: it keeps the federated-not-centralized
boundary clean and adds zero new indexed surface.

**Outcome**: designed 2026-07-19, not built. The only buildable-now slice is
a per-hub directory render tweak — a **Play** affordance on a bot's card
from the Phase 1 `game` descriptor — and it is gated on Phase 1 landing
first. Everything else is deferred-until-demand.

## Multiplayer lobby (gaming Phase 3): a bot-side convention, not hub surface

**Decision** (2026-07-19): the multiplayer session/lobby helper is a
**message convention plus a reusable bot-side Rust module (`wavvon-bot-kit`)
layered over the shipped `mini_app_message` relay** — not new hub surface.
The hub gains no roster, lobby, matchmaking, game state, or game registry;
it stays a content-opaque relay (bot-capability-layer.md decision 4). Join
discovery, roster, and turn/tick sync live in the bot; the mini-app renders
`roster`/`state` and sends `hello`/`bye`/`ping`. Full design:
[bot-capability-layer.md §10](bot-capability-layer.md).

**Alternatives considered**:
- **A hub-side lobby/matchmaking service** (roster query, session registry,
  matchmaking API). Rejected: it is the removed games-platform spec
  (gaming.md history, descoped 2026-06-26) re-entering through a side door,
  and makes the hub the bottleneck for every new game — the exact thing the
  bot-relay bet exists to avoid.
- **A hub `mini_app_session_closed` lifecycle event now**, so the bot sees a
  player close the modal (the one thing the relay can't express today —
  `bot_app_dismiss` is bot→all, and the disconnect path at
  `connection.rs:619-627` never notifies the bot). Deferred, not rejected:
  it is generic session-lifecycle, not game-aware, so it *would* be
  hub-appropriate — but a `bye`-on-unload + `ping` heartbeat convention
  covers leave detection with zero hub work. Build the event only if the
  ~30s heartbeat lag proves too slow.

**Tradeoff**: leave detection is best-effort/heartbeat-latent (up to ~30s to
notice a silent drop) instead of instant, in exchange for shipping Phase 3
with no hub changes at all. Join discovery is already a convention because
`bot_sessions` tracks the bot's own sessions, not a player roster.

**Outcome**: designed 2026-07-19, not built. First buildable slice is
bot-side only (generalize `ttt-bot`'s session map into `wavvon-bot-kit`);
the sole potential hub change (`mini_app_session_closed`) is deferred behind
the heartbeat convention.

## Game icons in Activities: curated emoji row, no game catalog

**Decision** (2026-07-19): "attach game icons to Activities entries"
ships as a **curated game-emoji row** in the profile editor's activities
field — one click inserts the emoji at the start of the cursor's line.
Entries stay what they already are (lines of the free-text `activities`
field); emoji live in the text itself.

**Alternatives considered**:
- **Real per-game artwork** (icon picker backed by a game list). Rejected:
  requires a game catalog, which is either a central authority (won't-do)
  or the undesigned gaming/bot distribution layer (bot-capability-layer.md
  Phase 4). Revisit as part of that layer, with bot-declared games.
- **Token syntax** (`[icon:controller]` swapped to bundled SVGs at render).
  Rejected: invents a private markup for marginal visual gain; breaks
  copy-paste and every non-web surface until each implements the renderer.

**Tradeoff**: emoji are generic (a controller, not *the* game's logo), but
they need zero schema/server/renderer changes and degrade nowhere.

**Outcome**: web shipped 2026-07-19.

## Events calendar: month grid over the already-fetched upcoming window, no date library

**Decision** (2026-07-19): the events calendar view is a **Month / List
toggle inside `EventsPanel`** (Wavvon-clients, `apps/web`) that renders the
**same** hub-scoped, already-read-gated event set the list fetches, on a
native-`Date` 6×7 grid — no calendar library, no new dependency, and for v1
**no server change**. A new prop-only `EventCalendar` + a pure
`utils/calendar.ts` are hoistable to `packages/ui` as-is. Full design:
[events.md](events.md) §9.

**Alternatives considered**:
- **A calendar library (a full month/week/agenda component).** Rejected:
  the month-grid math is ~20 lines of `Date`, the components must stay
  prop-only and ~200 lines to hoist into `packages/ui`, and a new dependency
  contradicts the lazy/minimal rule for the lowest-priority events slice.
- **Add a `from`/`to` date-range query to `list_events` first**, so the grid
  can browse any month. Deferred, not rejected: it's the right eventual
  shape (additive `ListEventsParams` fields + a `starts_at BETWEEN` branch)
  but isn't needed to ship the common case (upcoming events on a month
  grid), and building server surface for browsing nobody has asked for yet
  is speculative.

**Tradeoff / outcome**: v1's grid is meaningful only within the loaded
upcoming window (now → the 100th future event); past-month and
beyond-window browsing render empty and wait on the deferred range query.
Accepted as the lazy first cut for the lowest-priority events feature —
community-axis (hub-scoped), client-only, reuses the one read-gated
`GET /events` call the list already makes.

## Hub-hosted identity vault: opt-in, passphrase-locked, handle-addressed

> **PARKED 2026-07-19 (user call, same day as the design)**: not built,
> not scheduled. Revisit **after the videogamezone.eu pilot** — real
> users will show how identities actually get lost, which is the
> evidence that decides whether hub-held encrypted seed material is
> worth its trade-off. The design below stays as the considered option.

**Decision** (2026-07-19): design an **opt-in** recovery tier that stores the
user's passphrase-encrypted master seed — the same `.wavvon-backup`
envelope family — on their **home hub(s)** as personal-axis state,
retrievable and decryptable on a fresh device that holds **no key
material**. The device fetches by a **handle-derived locator**
(`locator = HKDF(PBKDF2(passphrase, salt=f(handle)))`) computed entirely
client-side, so the hub learns neither the handle nor the passphrase; the
same single KDF pass also yields the AES key (domain-separated by HKDF
label). Design: [identity-vault.md](identity-vault.md).

**Trust model, stated honestly**: this is **strictly weaker** than the
recovery phrase or the local backup file, because the ciphertext lives on a
hub instead of in the user's sole custody. A hub operator (or a DB dump) can
mount an **offline dictionary attack against the passphrase forever** — the
KDF is the only wall, and server-side rate-limiting does nothing against the
party that already holds the DB. We accept this and bound it: memory-hard
KDF path (PBKDF2-100k now, Argon2id as vault-`v2`), a stronger passphrase
warning at creation than the file flow uses, a 256-bit locator plus a PoW
gate so the endpoint is never a *cheaper* passphrase oracle than local
cracking, and key-authorized `purge`. What it buys over **PRF**: recovery
that needs no passkey provider (Windows Hello / Bitwarden PRF proved
unreliable — see the entry below) and no synced credential — just reach a
hub. What it costs versus the **file**: the file is exposed only if the
user's own storage is breached; the vault is exposed to every home-hub
operator, always. Same crypto, wider exposure.

**Alternatives considered**:
- **Keep it deferred** (the prior [home-hub.md](home-hub.md) stance:
  "revisit only with a strong argument"). The strong argument is the
  opt-in + locator + KDF-hardness + purge package above; the concentration
  risk is disclosed, not eliminated. That deferral is now marked
  superseded.
- **Shamir-split across the home hub list** (k-of-n shares; no single hub
  holds a crackable blob). Genuinely reduces per-operator exposure, but
  needs ≥k hubs online to recover and breaks the "remember one hub URL"
  story. Deferred, not rejected.
- **Server-side secret store (SVR / enclave-attested hardware brute-force
  wall)** — the model that makes a weak PIN safe. Rejected for a
  self-hosted federation: it presumes trusted attested hardware every
  operator runs, contradicting "any operator can run a hub on anything." A
  hub is a dumb store, not an HSM.

**Tradeoff / outcome**: designed, not built. The residual concentration
risk is the explicit price; mitigated most by self-hosting a home-hub slot.
Buildable slices in [ROADMAP.md](../ROADMAP.md). Reads anonymous +
PoW-gated; writes/deletes/purge master-signed (reuse the `put_prefs`
pattern). Additive migration (`identity_vault_blobs`).

## Passkey identity: refuse creation unless restore is proven at birth

**Decision** (2026-07-18, user call): identity creation via passkey PRF
performs a **restore self-test** (a scoped PRF sign-in immediately after
creation) and **refuses to create the identity if it fails** — no
identity, an error telling the user the stranded vault entry is safe to
delete, and a route to the recovery-phrase flow. The self-test's output
is also the **canonical seed source** (restores go through sign-in, so a
create-time output that sign-in can't reproduce must never mint an
identity).

**Why**: live provider testing (owner, 2026-07-18) found real platforms
where PRF works at creation but never at sign-in — Windows Hello 25H2
fails every PRF-carrying `get()` — and providers that store the passkey
while returning no PRF at all (Bitwarden extension, all browsers). An
identity created there *looks* passkey-backed but the passkey can never
restore it: a decoy that fails exactly when the user needs it.

**Alternative considered — create with a warning** (shipped briefly the
same day): keep the identity, derive from the create-output, show a
"your phrase is the only recovery" banner with forced acknowledgment.
Rejected by the user as dishonest UX ("what's the purpose of the
passkey if we can't restore from it?") — the passkey button's contract
is restore-by-passkey, and warnings don't fix a broken mental model.

**Tradeoff accepted**: a genuinely-cancelled verification prompt is
indistinguishable from a broken platform (both `NotAllowedError`), so a
cancel also refuses creation — the message invites a retry. Healthy
providers pay one extra authenticator prompt at signup; that's the cost
of the invariant "every passkey identity has proven restore at birth."

**Outcome**: clients `a310f64` (supersedes the warn-and-acknowledge UI
from `a310f64`/`a310f64` the same day). Provider matrix + platform bugs
in [webauthn-auth.md](webauthn-auth.md).

## Voice-move: hub-requested leave-and-join with claim-based auto-consent and ephemeral voice-only presence

**Decision** (2026-07-18, user call): event staging
([events.md](events.md) §7) introduces moving a member between voice
channels. A move is **not** a server-side yank — voice join is always
client-initiated (desktop UDP after a `voice_join` handshake, web over a
`/voice/ws` relay), so the hub instead **pushes a `voice_move` control
message and the target's client runs its normal leave-and-join**. One
mechanism covers both transports. The push is delivered targeted-by-pubkey
using the shipped `WhisperSignal` pattern (a `ChatEvent` returning `""`
from `channel_id()`, filtered on the recipient pubkey in the WS dispatch
loop). A new channel-scoped `move_members` permission gates the mover.

**Consent** follows the existing consent-spine posture (opt-in is
established by a prior deliberate act, not a blanket grant):

- **Auto-accept** when the target has claimed a slot or RSVP'd "going" on
  the event driving the move — claiming a slot *is* opting into being
  organized. The client shows a toast with a "Rejoin previous channel?"
  escape hatch rather than a blocking modal, so bulk marshalling isn't
  gated behind N confirmations.
- **Prompt-or-decline** for a move with no event context (the generic
  Phase-1 right-click primitive) or when the target hasn't
  claimed/RSVP'd. Decline is a server no-op.

**Voice-only presence**: a member moved into a channel they can't read is
still moved, but gains **only** voice — roster presence, speak/hear, and
the channel *name* in the voice HUD — and **no** `READ_MESSAGES` (no text
history, no message stream, no sidebar entry). The organizer's consented
move is the authorization, a deliberately narrower reveal than the
404-hides-hidden-channels posture events read-gating uses. The grant is
**ephemeral in-memory `AppState`** keyed by (pubkey, channel), created
when the move targets an unreadable channel, consumed by the single
voice-join read-gate bypass, and dropped by `leave_voice`. It never
persists, never survives a restart, and **exactly one** enforcement point
bypasses read-gating — the voice-join gate; message history, subscribe,
channel list, and event read-gating all stay strict.

**Alternatives considered**:

- **Server-side forced move** (hub relocates the participant without the
  client) — impossible cleanly: voice join is client-initiated on both
  transports, so there is no server-authoritative "move" without inventing
  a second, transport-specific control path. Request-to-join reuses the
  join path both clients already run.
- **A persisted DB grant for voice-only presence** — rejected: it would
  need its own revocation and cleanup lifecycle and could outlive the
  voice session it authorizes. In-memory state consumed by the join gate
  and dropped on leave can't leak past the session and needs no migration.
- **Full `READ_MESSAGES` on the destination during the move** — rejected:
  it would leak the channel's text history and put it in the sidebar,
  far more than the organizer consented to. The narrowest grant that
  satisfies "be in this voice room" is voice-only.
- **A blocking accept modal for every move** — rejected for slot
  claimants: it defeats the point of marshalling dozens of raiders at
  once. The slot claim is the consent; the toast escape hatch covers
  misplacement.

**Tradeoff / outcome**: designed, not built. Phasing in
[ROADMAP.md](../ROADMAP.md): Phase 1 = `move_members` + `voice_move` +
right-click move (generic primitive, no events); Phase 2 = staging panel
+ queued `event_move_assignments` + voice-only presence; Phase 3 =
optional auto-spawned squad channels. Full design, SQL, WS/API shapes,
and flagged conflicts (list_events/get_event read-gating, reminder
worker, voice_ws auth, invisible-presence roster) in
[events.md](events.md) §7.

## Shared UI components: hoist from web into packages/ui; desktop adapts

**Decision** (2026-07-18, user call): stop maintaining per-app copies of UI
components. The **web client is the source of truth** — going forward,
components ship into `packages/ui` (prop-only, data access via callback
props) instead of `apps/web/src/components`, and existing duplicated
components are **hoisted from the web copy** whenever they're touched;
desktop adapts by passing its own (Tauri `invoke`-based) loaders as props.
Desktop-parity work changes meaning: instead of hand-porting a web feature
into desktop's diverged copy, move the web component into `packages/ui` and
point both apps at it — the last port that component ever needs.

- **Why now**: an audit (2026-07-18) found only ~14 components shared in
  `packages/ui` vs **61 duplicated by filename** across web/desktop, at an
  average **73% divergence** — the July web-only feature run made the copies
  race apart, and the parity backlog grows with every web feature.
- **Alternative considered**: keep the documented per-app-copies model
  (`client-parity.md`: "parity work usually means porting a change into each
  app's copy"). Rejected — porting cost is paid on *every* feature forever;
  hoisting pays it once. The plumbing (prop-only `packages/ui`,
  `packages/platform` interface contract) already existed and was simply
  under-used.
- **Direction is one-way**: web wins on divergence, but strict desktop-side
  improvements (i18n keys where web hardcoded English, `FocusTrap`) are
  folded into the hoisted version rather than discarded.
- **Not everything hoists**: state orchestrators (`App.tsx`,
  `SettingsPage`) and components whose divergence is *feature* divergence in
  both directions (e.g. `ChannelMessageList`, `DmView`) need a real parity
  reconciliation first — those hoist during their parity pass, not
  mechanically.

**Outcome**: first slice shipped 2026-07-18 — `BotAppLaunchCard`,
`ImagePicker`, `BotCard`, `EmojiPicker` hoisted; both app copies deleted.
`client-parity.md` stance updated. `CreateHubWizard` followed 2026-07-19.
**Mechanical phase completed 2026-07-20** (clients `8500c63`): 41 more
components hoisted in one pass; 12 remain app-local pending feature
reconciliation (skip table + missing-command ledger in
[client-parity.md](client-parity.md)). The "not everything hoists"
carve-out proved out: `ChannelSidebar`, `HubAdminPage`, and
`ChannelSettingsModal` all turned out to be bidirectional feature forks.

## Presence: Invisible + "clear after" TTL; custom-text status removed

**Decision** (2026-07-12, user call): the footer presence picker becomes
**Online / Away / Do Not Disturb / Invisible** plus an optional **"clear
after"** duration (Off / 30m / 1h / 3h). The free-text custom status is
removed.

- **Invisible** = connected but shown offline to everyone else. The hub
  keeps the user in `online_users` (delivery, voice, routing all work) but
  gates the roster (`reported_online()` → false) and the realtime presence
  broadcast (emits offline, never the literal "invisible") for other
  members. The user's own client tracks its invisible state locally (hollow
  dot) and sees itself offline in the roster — acceptable for v1; a
  self-distinct indicator is a later nicety. Known gap: an invisible user in
  a voice channel still shows in that channel's participant list.
- **TTL on presence, never on the profile**: earlier we explicitly rejected
  a TTL on the persistent profile "thought" (expiring profile data is
  wrong). Presence is the right home — it's ephemeral/online-only already.
  The timer is **client-side** (reverts to Online on fire); disconnecting
  resets presence anyway, so no hub-side scheduling.
- **Two "status" concepts reconciled**: the persistent per-hub profile
  status_message (the avatar thought bubble) is the lasting tagline; the
  ephemeral presence picker is the transient mood. Removing the redundant
  free-text presence custom keeps them from overlapping.

**Outcome**: hub + web shipped 2026-07-12 (`39c2208`/`844e74d`). The
`presence_custom` column stays (dormant; desktop/Android may still set it).
Desktop/Android presence-picker parity deferred (ROADMAP).

## Profile card is tabbed; interests become free-text status + activities

**Decision** (2026-07-12, user call, same day — supersedes the structured
interests block below): the structured "Now / Looking for" verb-form felt
impersonal ("like a survey"), so it's replaced. The profile card is now
**tabbed** — a fixed header (banner, avatar, name, pronouns, key) over two
tabs: **Bio** (about me + badges) and **Activities** (a short
`status_message` line, placeholder "What are you thinking?", ≤ 140, plus a
longer free-text `activities` field, ≤ 1000). Both are plain per-hub text
fields on the same `/me` + profile plumbing as bio; the old `interests`
JSON column is left dormant (additive-only migrations).

**Why the reversal so soon**: the fixed-verb form was built to enable hub
*grouping* ("who else is Looking for X"), but the user judged that
structure too rigid for a personal profile and preferred free expression.
Grouping/matchmaking-by-interest is not lost forever — if it returns it'll
be a deliberate *browse* feature (the deferred Slice 2), not a data shape
forced onto every profile.

**Still automatic-free**: this remains fully self-authored. Truly automatic
"playing X" detection stays out (OS scanning / connected accounts = the
declined tracking); auto game presence remains a future *gaming/bot-layer*
feature with explicit consent, not a profile field.

**A third tab, Hubs** — opt-in featured hubs, drag-ordered, hidden by
default. `favorite_hubs` (JSON array of {url,name,icon}) + `show_hubs`
(bool) are stored per-hub like the other profile fields (reusing the draft
model), even though a favorite-hubs list is conceptually one cross-hub
thing — uniformity won over a bespoke identity-wide store, and default +
follow propagates it. **Privacy**: the public profile endpoint gates
`favorite_hubs` to empty when `show_hubs` is false, *except* for the owner
(the web editor reads its own profile through that endpoint, so the owner
must always get their real list back). Drag via the app's existing
`@dnd-kit`. Federation of favorites deferred (same reason as the fields).

**Outcome**: hub + web shipped 2026-07-12 (`cde17a5`/`af062e2` for the
tabs; `1a68d2e`/`9400e22` for the Hubs tab).

## ~~Self-authored interests block~~ + profile cosmetics (accent, cover)

**SUPERSEDED same day** by the tabbed free-text redesign above — the
structured interests form was replaced by free-text `status_message` +
`activities`. The accent-color / cover-image cosmetics below still stand.

**Decision** (2026-07-12, user call): members get an opt-in **"Now /
Looking for"** block — an ordered list (≤ 6) of self-written entries, each a
fixed verb (`playing` / `want` / `lfg` / `into`) plus free text (≤ 80
chars). Stored per-hub on the hub next to bio/pronouns, seeded from the
default profile — the same two-axis shape. Plus two cosmetics: an **accent
color** and an uploaded **cover image**, both overriding the key-derived
banner gradient (precedence cover → accent → identity). All three ride the
existing `/me` PATCH/GET and `/users/{pubkey}/profile` — no wire-format or
federation work.

**This reverses the earlier "activity surfacing declined" stance for the
opt-in case only.** The line that still holds: no *automatic* activity
history (see the entry below). This block is the opposite — nothing is
observed or logged; you type "playing X" yourself and delete it yourself.
The four fixed verbs (rather than free tags) exist so a hub can group
members ("who else is Looking for X") without unmatchable-tag noise or a
moderation surface.

**Alternatives**: free-text-only interests (rejected — collapses into bio,
kills grouping); arbitrary user tags (rejected — unmatchable, moderation
surface); identity-wide-only placement (rejected — matchmaking needs *this
hub's* members to see it, which is community-axis); federation now
(deferred — needs a signed public-profile envelope that doesn't exist yet).

**Tradeoff**: interests JSON + two cosmetic columns and more `/me` surface,
in exchange for profiles that help people find common ground. Cover images
reuse the avatar data-URL approach (client-downscaled to a small JPEG,
length-capped server-side) so no new image-storage or moderation surface.
A "browse everyone Looking for X" filter is a tempting Slice 2 but wants
queryable storage (a child table), not the JSON column — deferred.

**Outcome**: hub + web shipped 2026-07-12. Desktop/Android parity pending
(ROADMAP).

## Profile cosmetics: bio + pronouns in; activity surfacing declined

**Decision** (2026-07-12, user call, inspired by Discord's profile
surface): member profiles gain **bio** (≤ 500 chars) and **pronouns**
(≤ 40 chars) — per-hub values stored on each hub next to
display_name/avatar, defaults carried in the account's default profile.
The editor is a **WYSIWYG card**: the profile card itself is the form
(inline inputs, click-to-edit avatar with hover pencil), with per-context
drafts and one "Save changes" persisting everything edited.

**Alternatives**: Discord-style extras were considered — profile widgets,
a wishlist tab, and "last activities". Widgets/wishlist are deferred (they
lean on a store/game ecosystem Wavvon doesn't have; banner + accent color
are the natural next cosmetics instead). **"Last activities" is declined
outright**: surfacing what a user recently did is activity tracking, and
Wavvon's no-telemetry ethos means it must not exist as a default-on
profile filler. If ever wanted, it needs its own explicitly opt-in design.

**Tradeoff**: two more nullable columns on `users` and two more fields on
the /me PATCH surface, in exchange for profiles that feel like a person.
The member_updated WS broadcast stays name/avatar-only — cards fetch live,
so bio edits don't need hub-wide push.

**Outcome**: hub + web shipped 2026-07-12. Desktop/Android parity pending
(ROADMAP).

## Profiles: one default per account; per-hub identity lives on the hub

**Decision** (2026-07-12, user call during the settings redesign): the
client-side named-profile preset pool and its per-hub assignment map are
deleted. Each account keeps exactly one **default profile** (display name +
avatar, local per-account storage) that prefills and auto-applies when the
account joins a hub. How you appear on a hub is edited in place and stored
by that hub itself (member state via `PATCH /me`) — the hub is the source
of truth; nothing per-hub is mirrored client-side.

**Alternatives**: (a) keep the preset pool (status quo) — presets you
"apply" to hubs, with a local hub→profile map; (b) make the pool
device-global so profiles can be reused across accounts, with a per-account
default pointer.

**Tradeoff**: we lose one-click re-application of a persona across many
hubs. In exchange the model aligns exactly with the two-axis rule: per-hub
profile is community-axis state on the community hub (it already was,
server-side — the pool just duplicated it), and the single default profile
is personal-axis state that can later ride the per-account prefs blob to
other devices. Option (b) was rejected because device-global state is owned
by no identity — no keypair to sign it, no home hub to sync it, stuck
per-device forever — and because cross-account profile sharing nudges users
into publicly linking identities that separate accounts exist to keep
apart. Alpha state: no migration; orphaned localStorage keys are ignored.

**Outcome**: shipped web 2026-07-12. Desktop/Android still on the old
model (tracked in ROADMAP known issues).

## Settings IA: "Accounts" macro group with four scoped tabs

**Decision** (2026-07-12, user call, three iterations): user settings nav
gains an **Accounts** group with four tabs — **Profile** (default profile,
per-hub profile, badges/certifications), **Manage accounts** (switcher
table, recovery phrase, identity backup, full archive, home hubs),
**Devices** (paired devices, passkeys, trusted devices — all "what can act
as this account, revoke it"), **Privacy** (blocked/ignored users — about
other people, not account access). The "Managing account" selector is
owned by SettingsPage and shared across tabs, so a selection survives tab
changes; the Profile tab participates too (a non-active account's default
profile is plain local scoped storage — editable without switching). The
language selector moved to Appearance (app-level, not account-level).

**Alternatives**: one mega Account tab (status quo — ~1,400 lines of
sections, and four active-only sections sat *below* the managing selector
while ignoring it); two tabs (accounts list vs. everything else — re-merges
unrelated concerns); splitting Devices further per section (three tabs of
one list each).

**Tradeoff**: more tabs to scan in the nav, but each answers one question,
and grouping certifications under Profile (identity presentation, not
security) and recovery/backup next to the switcher (getting identities
on/off the device) removes the old tab's mixed active-only/managing
semantics.

**Outcome**: shipped web 2026-07-12 with the profile-model change above.

## Account switching is an in-place key-remount, guarded, not a reload

**Decision** (2026-07-12, user call after live testing, supersedes the
"switch = reload" paragraph of the multi-account entry below): switching
accounts remounts the app tree in place — `AccountRoot` renders
`<App key={activeAccountId}>`, so React unmount runs every cleanup and
the new account mounts fresh from local data. No navigation, no
transition overlay (an interim overlay approach was built and rejected
same-day: account data is local, so a loading page was papering over an
unnecessary reload).

What preserved the reload's safety guarantee:

- **Teardown audit** — the one real leak found: the module-level hub
  sessions map (`platform/session.ts`) survives React remounts, so the
  outgoing account's WebSockets would have stayed open;
  `resetHubSessions()` now runs before the key flips. Voice/video/
  screen-share/webcam-processor refs gained a master unmount effect.
- **Voice guard** — switching is *blocked* while joined to a voice
  channel (disabled buttons + surfaced reason), not auto-left; the
  user's explicit call: prevention over interruption.
- **4s switch cooldown** — rapid consecutive switches race the
  remount + per-hub reconnect cycle; refused with a reason.

The e2e proves the contract: a `window` marker planted before the
switch survives it (a reload would wipe it), no overlay is ever
attached, and the cooldown engages. Managing *other* accounts without
switching at all is the companion feature (account selector, same-day).

## Invite role policies: privileged inviters pick, everyone else gets the hub default

**Decision** (2026-07-11, implemented hub + web same day): two-tier
role assignment through invites, replacing the "every newcomer is only
everyone until someone fixes it" default that pushes other platforms'
communities toward auto-role bots.

1. **Inviter with role power picks the role** — any member whose role
   grants `manage_channels` (the invite-creation permission) can mint
   an invite carrying `grant_role_id`, limited to roles strictly below
   their own max priority. Guarded at mint AND at redemption (an
   inviter demoted after minting confers nothing). This tier mostly
   shipped with role-granting invites; this decision extends the UI to
   non-admin members (QuickInviteModal) and pins the non-admin paths
   with tests.
2. **Hub default for everyone else** — a hub setting
   `default_invite_role_id` (admin-configured, on the standard
   hub-settings surface; `""` clears). Applied at redemption to any
   invite with no explicit grant, on both `/auth/verify` and
   `/join/:code`, through the same shared grant helper. Explicit
   grants always win. The default may never be a role carrying the
   `admin` permission — rejected at configuration and skipped at
   redemption if the role later gains admin or is deleted
   (defense-in-depth).

**Alternatives considered**:

- **Per-inviter-role policy matrix** ("invites from role X grant role
  Y") — deferred: a single hub default covers the observed need
  (newcomer trust tier) with one setting; the matrix adds admin UI
  complexity with no demonstrated demand. The redemption helper is the
  seam if it's ever wanted.
- **Applying the default only when the inviter lacks role power** —
  rejected: "no explicit grant → default" is simpler to reason about
  and makes admin-minted plain invites behave identically to member
  ones.
- **Allowing an admin-permission role as default** — rejected outright:
  a standing setting that silently hands out admin to anyone with an
  invite link is a takeover primitive, not a convenience.

**Outcome**: live-verified e2e — a plain-invite joiner received the
configured default role; explicit-grant, priority-guard, and
clear-the-default paths covered by 11 new hub tests.

## Paired-device DMs attribute to canonical via cert-chained envelopes; DH capability is a wrapped canonical scalar

**Decision** (2026-07-11): fix the multi-device DM bug (paired devices
attributing DMs to their subkey and keying E2E against the wrong X25519
key) with two anchored-to-canonical mechanisms, neither of which puts a
signing seed on a paired device:

1. **DH capability** — the canonical DM DH keypair stays what ships
   today: the X25519 scalar derived from the *canonical* (subkey-0 /
   entropy) Ed25519 seed via the SHA-512+clamp recipe, published at
   `/identity/{canonical}/dh-key`. At pairing the enrolling device (which
   holds the entropy) wraps that **32-byte X25519 scalar** — not the
   Ed25519 seed — for the new subkey with the existing ECIES
   `wrapBlobKey`, delivered in `PairingComplete.wrapped_dh_seed_hex`
   next to `wrapped_blob_key_hex`. The paired device stores the scalar
   and uses it for every DM key agreement. It gains decrypt/agreement
   capability with **no** signing capability (the scalar is not
   reversible to either the master or the subkey-0 seed), preserving the
   "paired devices never hold the master seed" invariant. Only a device
   holding the entropy publishes the DH key; paired devices skip publish.

2. **Attribution** — the envelope keeps `sender_pubkey = canonical`
   (unchanged semantics). A paired device signs with its subkey and
   attaches its `SubkeyCert` in a new optional `signer_cert` field.
   Verifiers with an absent `signer_cert` behave exactly as today (verify
   against `sender_pubkey`); with a present one they verify (a) the cert
   (master→subkey), (b) the envelope signature against
   `signer_cert.subkey_pubkey`, and (c) that `sender_pubkey` is owned by
   `signer_cert.master_pubkey`. Binding (c) is tiered: the origin hub
   proves it from the authenticated session's resolved `(canonical,
   master)`; a federated hub or recipient client resolves master→canonical
   from its local `users` row, falling back to the sender's device
   registry (canonical's self-cert) when the user is unknown. The
   `FederatedDmRequest` carries `signer_cert` so downstream hubs verify
   without a session.

**Alternatives considered**:

- **Client signs the envelope as the canonical identity** — impossible
  by design: a paired device deliberately holds neither the master nor
  the subkey-0 (canonical) signing seed.
- **Hub rewrites `sender` subkey→canonical on the DM path** — works on
  the origin hub but breaks downstream: the envelope signature (by the
  subkey) no longer verifies against the rewritten canonical `sender` on
  a federated hub or a recipient client, and a rewrite carries no proof
  that resists a malicious peer hub spoofing `sender`. Cert-chaining
  keeps the proof self-contained across federation.
- **Attribute DMs to the master pubkey** (self-contained with one cert,
  `sender_pubkey = cert.master_pubkey`) — rejected: the DR receive path
  fetches the sender's static DH by `sender_pubkey`, and the DH key lives
  at the canonical pubkey, not the master; it would also make DM
  attribution a third identifier inconsistent with community actions and
  existing DM history (both keyed to the canonical/subkey-0 pubkey).
- **Per-subkey published DH keys with cert-chained binding** — rejected
  for v1: every recipient would re-key existing conversations against a
  new per-device DH key and track which device is current. Wrapping the
  one canonical scalar keeps every shipped conversation working with zero
  re-keying and one small pairing-payload field.
- **Defer to the full home-hub build-out** — rejected: the fix needs
  only a pairing-payload field, an optional envelope field, a publish
  guard, and verification tiering, all on machinery (subkey certs, ECIES
  wrap, device registry, `resolve_canonical_identity`) that already
  ships. It does not need the canonical DM inbox or designation
  replication.

**Tradeoff / outcome**: one refinement to the
[e2e-encryption.md](e2e-encryption.md) "Multi-device" open question —
the DH anchor is the **canonical (subkey-0/entropy) seed's** DH, not the
HKDF-master's, because that is what is already published and what
existing conversations key against; anchoring elsewhere would force a
re-key. Compatibility: historical rows are not rewritten. Because
paired-device E2E sends previously failed hub signature verification
(subkey signature checked against canonical), almost no cert-less
subkey-keyed encrypted rows exist; any orphaned ones from the pre-fix
window stay unreadable and are documented as a bounded loss (multi-device
pairing is recent and web-only). A cert-chained envelope reaching an
un-upgraded hub or client fails its signature check and does not
federate/decrypt until that peer upgrades — a strict improvement over
today (paired-device E2E did not work at all), and the un-upgraded
population shrinks as the single web delivery target updates. Full detail
and file list in [multi-device.md](multi-device.md#implementation--dm-attribution--dh-fix).

## Multi-account is device-local storage namespacing, not a synced concept

**Decision** (2026-07-11, implemented web same day): a device can hold
multiple identities ("accounts") and switch between them. An account is
purely **device-local client state** — the account list is never synced
to any hub, never enters the prefs blob or any personal-axis store, and
no hub knows or cares that two pubkeys share a browser. Each account's
local state (hub list, session tokens, drafts, profiles, notification
prefs, DM ratchet state) is isolated by a localStorage namespace
(`wavvon:acct:<pubkey>:<key>`, one helper module all per-user storage
routes through); the account registry is just the rows of the existing
IndexedDB identity store keyed by pubkey. ~~Switching swaps the
active-account pointer and reloads the app — guaranteed teardown of
sockets/voice, replaceable later by an in-place switch.~~ *(Superseded
2026-07-12: switching is now an in-place key-remount — see the entry
above.)* Removing an account requires typing its fingerprint and purges
its namespace (session tokens and ratchet state must not outlive the
identity on a shared device).

**Alternatives considered**:

- **Simultaneous multi-account sessions** — rejected for v1: parallel
  socket/voice/notification stacks per account for marginal benefit;
  two browser profiles already deliver it for free.
- **Syncing the account list across devices** — rejected: which
  identities live on which device is the user's per-device choice
  (identity A on devices 1+2, identity B only on device 2 is fine).
  Pairing already handles per-identity device enrollment; an
  account-list sync would create a new cross-identity linkage that
  contradicts identities being unrelated keypairs.
- **Cross-account safeguards** (wrong-account posting warnings) —
  rejected: each account has its own hub list; using two accounts on
  one hub is the user's responsibility, not the client's.
- **Backward-compatible migration of the single-account store** —
  deliberately skipped (pre-release): the IndexedDB upgrade drops the
  legacy singleton row; existing installs re-import via
  phrase/passkey/pairing.

## Passkey PRF output is the identity entropy, not a new key layer

**Decision** (2026-07-11, implemented web-only same day): the
"passkey = master key anchor" design from
[webauthn-auth.md](webauthn-auth.md) is implemented by using the
WebAuthn **PRF extension output (32 bytes) directly as the identity
entropy** — the exact slot BIP39 entropy occupies. The PRF eval salt is
the pinned protocol constant `wavvon-master/v1` (in
`packages/core/src/identity/prf.ts`; must be byte-identical on every
client, never changed — only versioned alongside). Everything
downstream (HKDF master derivation, subkey 0, entropy ↔ 24-word
phrase) is untouched, so a passkey-created identity can still reveal
its 24 words, and the phrase remains the domain-independent backup —
offered, not forced, right after passkey creation.

The bootstrap credential is created **fully client-side** (self-signed
challenge, discoverable credential, rp = current origin) and is never
registered with a hub — it exists purely as a PRF oracle. The separate
hub-session passkey ceremony (`/auth/webauthn/*`) is unchanged.

**Alternatives considered**:

- **PRF output feeds a new derivation layer** (PRF → HKDF → entropy) —
  rejected: adds a second protocol constant and breaks the property
  that passkey identities and phrase identities are the same kind of
  identity with interchangeable backups.
- **Register the bootstrap credential with the hub during creation** —
  rejected: identity creation must not require a hub round-trip, and
  the hub gains nothing (PRF results never leave the client).
- **Raw-seed QR export for portability** — rejected: a QR of the seed
  is the plaintext secret in scannable form; screenshots sync to cloud
  photo libraries. The encrypted `.wavvon-backup` +
  recovery-kit idea ([identity-recovery.md](identity-recovery.md))
  is the QR-shaped answer.

**Tradeoff accepted**: the passkey is bound to the rp domain it was
created on (the hub domain serving the web app). If that domain dies,
the passkey can't be asserted elsewhere — the revealed 24-word phrase
is the deliberate escape hatch, and the onboarding copy says so.

## Presence is global across hubs; per-hub quiet is hub mute, not status

**Decision** (2026-07-10, same day as the DND-via-status decision below,
after review): a user's presence status (Online / Away / DND + custom
text) is **one global fact**, not a per-hub setting. Setting it per hub
would conflate two different concepts: *"I am not to be disturbed"*
(a property of the person, visible everywhere) versus *"this hub should
not disturb me"* (a property of the relationship with one hub). The
second concept already has its own tool — the per-hub/per-channel
**notify modes** (`all`/`mentions`/`silent`), where `silent` is hub
mute, already surfaced in the hub sidebar as a muted badge.

Implementation (web, 2026-07-10): the client is the source of truth for
presence — the status picker broadcasts `set_status` to **all** connected
hub sessions (previously only the active one), persists the choice on
the device, and re-applies it to each hub on (re)connect (only when an
explicit choice exists on the device, so a fresh device doesn't stomp a
status set elsewhere). The notification gate now checks **both** quiets
independently: mention pings/popups are suppressed when own presence is
`dnd` *or* when the message's hub/channel effective notify mode is
`silent` — the latter was previously cosmetic (the muted hub still
pinged).

**Alternatives considered**:

- **Per-hub presence** (the accidental status quo — `set_status` went
  only to the active hub) — rejected: nobody is "in a meeting" on one
  hub and free on another; the badge others see would depend on which
  hub happened to be active when you set it.
- **Hub-side fan-out** (a hub propagates your status to your other
  hubs) — rejected: hubs don't know each other's membership and must
  not (privacy); the client already holds every session, so client-side
  fan-out is one loop with no protocol change.

**Superseded**: nothing removed; refines the scope of the decision below.

## Do Not Disturb engages via presence status, not a dedicated toggle

**Decision** (2026-07-10): DND has no control of its own. The presence
status picker in the sidebar footer (Online / Away / Do Not Disturb,
shipped 2026-07-05) is the single surface — selecting **Do Not Disturb**
both broadcasts the badge to other members and arms the local
notification gate (mention pings and system notifications suppressed;
unread counters still accumulate). The gate is a read-time client
transform per [block-mute-ignore.md](block-mute-ignore.md) §3; no new
storage, since the status is already hub-synced and persisted. The
never-mounted `DndToggle` / `DndSettingsSection` components and the
`DndSettings` prefs shape from the earlier draft were deleted from
Wavvon-web.

**Alternatives considered**:

- **Sidebar-footer quick-toggle next to self-mute/deafen** (the original
  block-mute-ignore.md §3 design; a `DndToggle` component was even built
  but never wired) — rejected: it duplicates a state the status picker
  already owns, giving one fact two homes and two controls that can
  disagree visually. One fixed home per control.
- **DND enabled flag in the encrypted prefs blob** — rejected for the
  on/off state: presence is already synced and persisted hub-side;
  mirroring it into the prefs blob invites drift. The blob remains the
  right home for the *future* quiet-hours schedule, which is a private
  preference, not a broadcast state.

**Superseded**: the "quick-toggle" half of block-mute-ignore.md §3
(section revised in place, 2026-07-10). The one-step-downgrade transform
and the deferred schedule are unchanged.

## "Create a hub" from the `+` button is a two-exit router, not a spawner

**Decision** (2026-07-06): the hub-list `+` button gets a Join/Create
fork. "Create a hub" does not pretend the client can stand up a server —
it routes to one of two honest exits and re-absorbs the result as an
owned hub. **(a) Self-host**: hand off to the web wizard
(`discovery.wavvon.app/new`) or the offline `wavvon-hub setup` one-liner;
the operator runs the server, then pastes the shipped first-boot
owner-granting invite back into the client to land as owner. **(b)
Managed/farm**: pick a farm advertising public hosting; the farm
provisions a hub and returns its address plus a server-assigned owner
claim. The buildable **first slice is (a)** — UI-only over already-shipped
primitives (invite-first defaults, one-time owner invite, role-granting
invite redemption, `wavvon-hub setup`), needing **no new farm capability
and no new hub endpoint**. (b) is deferred behind farm lifecycle. Full
design: [hub-creation-wizard.md](hub-creation-wizard.md#4-client-entry--create-a-hub-from-the--button).

**Alternatives considered**:

- **One unified in-client create form** that asks template + name and
  then "picks" a host — rejected: it hides the fact the client can spawn
  nothing itself, and would dead-end for self-hosters who must leave the
  app to run a command. The explicit two-exit fork is honest and lets the
  self-host exit ship now.
- **Embed the whole template wizard in the client** — rejected for the
  same reason Section 3 keeps the wizard on the web: Docker/binary command
  generation and managed-farm signup already live there; duplicating
  template browsing in-client is maintenance for no gain.
- **Ship Create as farm-only** (skip self-host, wait for lifecycle) —
  rejected: it blocks the whole feature on farm lifecycle work when the
  self-host path is fully unblocked today.

**Tradeoff**: the self-host exit sends the user out of the app to run a
command and come back with an invite — more steps than a one-click
managed create. Accepted because it is the only honest thing a client can
offer without a provisioning backend, and it ships now instead of waiting
on farm lifecycle (`farm/src/hub_manager.rs` + the `agent` crate,
Wavvon-server).

**Outcome**: designed; self-host slice queued as the buildable next step
(ROADMAP #13). Client change is the `+` fork + self-host handoff panel +
owner-invite paste (delegating to the existing invite-redeem path), in
Wavvon-web first. Managed path deferred to Phase 3 §C
([farm-impl.md](farm-impl.md#c-user-facing-hub-creation-flow)) once
`POST /farm/hubs` provisioning + auto-spawn lifecycle land.

## Farm reverse-proxy routes by hub serial, not opaque hub_id

**Decision** (2026-07-05): the farm's shared-domain reverse proxy keys
on the **hub serial** (its Ed25519 pubkey) as the client-facing routing
segment — `https://farm.example.com/hub/<serial>/<path>` resolved via a
unique index on `hubs.hub_pubkey` to the hub's `process_port`. The
opaque 8-12 hex `hubs.id` PK stays, but only as the farm-internal
management handle (`/farm/hubs/{hub_id}`), not as the proxy key. Path
prefix, not subdomain or header. Full design:
[farm-impl.md](farm-impl.md#serial-routing--first-slice).

**Alternatives considered**:

- **Opaque `hub_id` as the routing key** (the original Phase 2 choice) —
  reversed. Shipped farm-ready invites already carry the serial
  (`wavvon://<host>/i/<serial>/<code>`), so routing on `hub_id` would
  force a serial→id resolution round-trip before any client could reach
  the hub. The serial is also the identifier federation and DM
  addressing already use.
- **Subdomain per hub** (`<serial>.farm.example.com`) — rejected: a
  64-hex serial exceeds the 63-char DNS label limit, and subdomains
  need a wildcard cert + wildcard DNS, defeating the one-cert
  self-hoster goal.
- **Header (`X-Hub-Serial`)** — rejected: invisible to links, breaks
  the shipped invite URL shape, can't be shared or bookmarked.

**Tradeoff**: 64-char path segments on every request (cosmetically ugly,
well within HTTP limits) and a second identifier space for the same hub
(serial for routing, `id` for management). Accepted because the serial
is the durable, federation-consistent, already-public identity, and the
"pubkey exposes routing details" objection behind the original opaque-id
choice no longer holds once the serial ships in every invite.

**Outcome**: designed; implementation slice queued (ROADMAP farm
wishlist). The concrete change is a `hub_pubkey` unique index, a
serial-keyed lookup in `farm/src/proxy.rs`, and a WS-upgrade socket
bridge — the existing proxy handles HTTP-by-`id` only. Supersedes the
Phase 2 routing text in [farm-impl.md](farm-impl.md), which now carries
a forward pointer.

## Schema baseline reset at v0.3.0 (pre-production)

**Decision** (2026-07-05): collapse the hub's accumulated migration
history — every `ALTER TABLE ADD COLUMN` layered on since the first
schema — into a single clean baseline in `migrations.rs`. A fresh
install now creates the final schema in one pass; the wizard/template
first-run bootstrap ([hub-creation-wizard.md](hub-creation-wizard.md))
is the one and only first-setup path. The additive-only migration rule
resumes **from this baseline**: future changes are still
`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN` only.

**Why**: no production deployments exist yet, and the upgrade-ALTER
ballast made the schema unreadable as a whole and slowed every fresh
test database. Resetting now is nearly free; resetting after GA never
is.

**Alternatives considered**:

- **Keep accumulating ALTERs** — rejected: pure cost with no
  beneficiary; no deployed hub needs the upgrade path yet.
- **Adopt a versioned migration framework** (numbered files, journal
  table) — deferred, not rejected: worth revisiting before the first
  supported production upgrade, but overkill while a baseline reset is
  still an option.

**Tradeoff**: hubs created before v0.3.0 (the videogamezone.eu pilot)
cannot upgrade in place — they must wipe the database and re-run first
setup (the wizard makes this cheap). Accepted explicitly as the last
moment this is acceptable.

## Alliance space-sharing v2: read-time recursive-CTE expansion

**Decision** (2026-07-05): recursive alliance sharing resolves the
effective shared set — explicit shares ∪ all descendants of any
`include_descendants` share — at **read time** via a recursive CTE
(depth-guarded at 32), not by materializing a row per shared descendant.
A single `include_descendants BOOLEAN` on `alliance_shared_channels`
records intent; `GET /alliances/:id/channels` and the message endpoints
expand it on each call. Full design: [alliances.md](alliances.md).

**Why**: the expansion is correct **by construction**. Sub-channels
created after a category is shared are shared automatically; unsharing a
root drops the whole subtree; moving a channel out of a shared category
un-shares it — all with no bookkeeping, because nothing derived is
stored to go stale.

**Alternatives considered**:

- **Materialized per-descendant rows** — rejected: every channel
  create / move / delete would have to fan out inserts and deletes into
  the shared set, needing triggers or a sync worker, and any missed hook
  leaves stale shares. Trades a cheap read for fragile write-time
  bookkeeping.
- **Path-prefix matching** (store a materialized path, match by prefix)
  — rejected: no foreign-key integrity, and re-parenting a subtree means
  rewriting every descendant's path anyway.

**Tradeoff**: a CTE walk per list/message call instead of a plain index
lookup. Accepted — alliance share sets are small (a hub shares a handful
of spaces), the depth guard bounds the walk, and correctness beats
micro-optimizing a low-frequency read.

## LAN mode: explicit flag + hard private-address guard

**Decision** (designed 2026-07-04, not yet implemented): a hub runs on
a LAN via mDNS/DNS-SD discovery (`_wavvon._tcp.local`) and one of three
trust tiers — CA cert (today), self-signed + out-of-band fingerprint
pinning, or gated plaintext. All non-CA paths are reachable **only**
under an explicit `WAVVON_LAN_MODE=1` flag, and under that flag the hub
**refuses to bind or advertise a non-private address** (loopback /
RFC 1918 / link-local only), exiting otherwise. Ships server-first;
native mDNS-discovery UX is deferred to the client era. Full design:
[lan-mode.md](lan-mode.md).

**Why**: "works at a LAN party with no internet" is a structural
differentiator over centralized platforms, and the Rust hub is already
self-contained. The dominant risk is a self-signed/plaintext hub
accidentally exposed to the internet — the explicit flag plus the
address guard make that structurally impossible rather than merely
discouraged.

**Alternatives considered**:

- **Local CA / ACME-on-LAN** — rejected: heavy PKI, and browsers still
  wouldn't trust the root without a manual import. Fingerprint-in-invite
  TOFU is simpler and needs no PKI.
- **Auto-detect LAN and relax TLS silently** — rejected outright: the
  whole point is that relaxed trust must be a loud, explicit,
  un-exposable opt-in, never inferred.
- **Block the feature until the browser can do it** — rejected: the
  browser can't do mDNS or self-signed trust and web is the delivery
  target, but the safe *server* half stands alone and is shippable now;
  coupling it to deferred client work would strand a useful capability.

**Tradeoff**: full LAN UX (in-app nearby-hubs list, fingerprint
pinning, QR scan) is native-client work that lands later; on web today,
LAN works only in the plaintext tier when the web bundle is also served
over http from the LAN. Accepted — the server capability is the
valuable, safety-critical part.

## Discord import: two-stage CLI with a neutral, reviewable manifest

**Decision** (designed 2026-07-04, not yet implemented): the migration
tool is a standalone workspace CLI (`discord-import`, modeled on
`demo-seed`) with two stages: `export` reads a guild's structure via a
read-only **bot** the owner invites (channels, roles, permission
overwrites — no privileged intents) and writes a neutral, versioned,
human-editable `import-manifest.json`; `apply` replays that manifest
onto a **fresh** hub through existing public HTTP routes only.
Structure only in v1 — members, history, and emoji are reported as
skipped, never silently dropped. Full design:
[discord-import.md](discord-import.md).

**Why**: "do we have to rebuild everything?" is the first objection
every switching community raises, and structure is the cheap 90% of
the answer. The manifest between the stages gives the operator a
review/edit step, decouples the Discord-facing half from the
hub-facing half, and becomes an input format other sources (Matrix,
Slack, generators) can emit later.

**Alternatives considered**:

- **Single live Discord→hub pipe** — rejected: no review step, couples
  both APIs in one process, can't run the halves on different machines.
- **User-token scraping / data package** — rejected: user tokens
  violate Discord ToS; the personal data package doesn't contain
  server structure at all.
- **DiscordChatExporter output as primary input** — rejected:
  third-party, message-centric format; may become another manifest
  *producer* later.
- **Message history in v1** — rejected: imported messages have no
  author keypair (identity is a keypair, not an account), so history
  import is an attribution-design problem with 10× the surface.

**Tradeoff**: a fresh-hub-only, fail-forward apply means no
merge-into-existing and "wipe and re-run" as the recovery path.
Accepted for a v1 migration tool.

## Role categories are display-only; role color/icon ships with them

**Decision** (designed 2026-07-03, not yet implemented): roles gain
native grouping via a `role_categories` table plus a nullable
`roles.category_id`, and cosmetic identity (`color`, `icon` — emoji
only in v1) on both roles and categories. Categories carry **no
permissions** and render on exactly two surfaces: the hub-admin Roles
tab (grouped list) and the user profile card (badges sectioned under
category headers). The member sidebar is untouched — hoisting stays on
`display_separately`. Full design: [role-categories.md](role-categories.md).

**Why**: communities on centralized platforms fake this with
permissionless divider roles (`─── Staff ───`), polluting the
permission system, role pickers, and mention search. Native grouping
removes the hack without adding a second permission axis.

**Alternatives considered**:

- **Categories with permissions** (roles inherit from their category) —
  rejected: a second grouping axis competing with roles and the
  channel-overwrite cascade ([nested-channels-ux.md](nested-channels-ux.md) §3);
  the permission model keeps exactly one unit, the role.
- **Sectioning the member sidebar by category** — rejected for v1: the
  profile card is where flat role chips hurt most; re-sectioning every
  member list on day one of a cosmetic feature is disproportionate.
- **Icon image uploads** — rejected for v1 in favor of emoji: uploads
  need storage, quotas, and moderation for a decoration; the TEXT
  column upgrades to an asset-id scheme later if justified.

**Tradeoff**: display-only categories can't express "everyone in this
group of roles may…" — bulk permission tooling, if ever wanted, must
operate on roles, not categories. Accepted; that's the point.

## Web voice via a WebSocket Opus relay, not WebRTC

**Decision** (shipped 2026-06-13): the browser client joins the same voice
channels as native clients by relaying Opus frames over a hub WebSocket
endpoint (`/voice/ws`), not over WebRTC. Native clients keep their UDP
path; the hub fan-out routes each relayed frame to both UDP (desktop,
Android) and WS (web) participants in one channel. The browser frames the
same Opus wire format as UDP, encoding/decoding with the `opusscript` WASM
codec. Hub handler is `hub/src/routes/voice_ws.rs` (Wavvon-server); the
client side is `VoiceWsSession` in `apps/web/src/platform/voice.ts`
(Wavvon-client). Full data flow in [voice.md](voice.md).

**Why**: the browser cannot open raw UDP sockets, so the existing transport
was a hard wall. The WS relay reuses what already exists — the hub's Opus
fan-out, the session-token auth, and the exact UDP wire format — adding
only a second sender registry (`voice_ws_senders`) and a socket handle to
`AppState`. It got browser voice working end-to-end against the live pipeline
with no new media stack on the hub.

**Alternatives considered**:

- **WebRTC (SFU on the hub)** — rejected for v1: it forces the hub to
  terminate ICE/DTLS-SRTP and run a real SFU, a large new subsystem, for
  no gain over relaying the Opus frames we already produce. WebRTC stays
  the right answer for a future P2P/lower-latency upgrade and is already
  the chosen path for screen-share v2 ([screen-share-webrtc.md](screen-share-webrtc.md)),
  but voice did not need it to ship.
- **Leave browser voice deferred (status quo)** — rejected: it was the
  largest remaining parity gap and produced the "join voice button + voice
  unavailable banner" contradiction the design review flagged.

**Tradeoff**: the WS relay carries audio through the hub's WebSocket layer
rather than a dedicated media transport, and the browser path has no
RNNoise/VAD denoise (the WASM codec and `ScriptProcessorNode` graph are the
v1 ceiling). Per-stream WS framing is heavier than UDP; acceptable because
the browser audience is smaller and latency-tolerant relative to native.

## Client apps consolidate into one monorepo; hub server stays separate

> **Status (2026-06-13): shipped.** The three client repos were merged into
> the Wavvon-client monorepo across five staged commits — `apps/desktop`,
> `apps/web`, `apps/android/android` plus shared `packages/core|ui|platform|i18n`.
> The decision below is preserved as written (future tense); the structure
> it describes is now live. See [architecture.md](architecture.md) for the
> current repository map.

**Decision**: the three client repos — Wavvon-desktop, Wavvon-web,
Wavvon-android — merge into a single client monorepo (`wavvon`) with
internal pnpm workspace packages (`packages/core`, `packages/ui`,
`packages/platform`, `packages/i18n`) for shared code and per-app
projects under `apps/*`. The Rust hub server (Wavvon-server) stays its
own repo. Full plan, staged migration, and CI/release/updater details in
[client-monorepo.md](client-monorepo.md).

**Why**: the clients already share code, but through three fragile edges.
A `file:` dep from desktop into Wavvon-web (`@wavvon/utils`,
`@wavvon/i18n`) pulled a **second copy of React** into the packaged
desktop build and crashed it, forcing a `dedupe` band-aid in the desktop
Vite config (desktop `7844c31`). The desktop release workflow checks out
**two repos** just to resolve i18n. The Android web fork reaches across
repos via a Vite alias (`@components` → `../wavvon-desktop/src/...`) that
only works with both repos checked out side by side. And the trigger:
invite-link parsing (`#invite=` / `?invite=`) would otherwise be written
2–3 times — the desktop has `parseHubInput()`, the web client has no URL
invite parser at all. A workspace makes the double-React class
structurally impossible (single hoisted React), collapses the dual
checkout to one, and lets a shared-code change plus all consuming clients
land in one commit. [browser-client.md](browser-client.md) already
flagged this refactor as deferred; this is it.

**Alternatives considered**:

- **Keep multi-repo + the cross-repo Vite alias / `file:` deps (status
  quo)** — rejected: it is the source of the double-React crash, the
  dual-checkout release, and the side-by-side-checkout requirement; every
  shared-code change is a multi-repo dance.
- **Standalone published `@wavvon/core` npm package (separate repo)** —
  rejected: the publish / version-bump / update-consumers cycle adds
  *more* friction than today, not less. An internal workspace package
  shares code with zero release machinery and lets a shared-code change
  and all its consumers ship in one commit.
- **Full monorepo including the Rust hub server** — rejected: the hub is
  a different deploy unit (server binary / Docker image with its own
  release cadence and its own CI), not an installed app. Co-locating it
  buys nothing and couples unrelated release pipelines.

**Tradeoff**: consolidating three public repos into one drops the org's
public repo count six → four, a minor negative against the stated
stars/visibility goal (mitigated by keeping the old repos archived but
visible, and by one well-documented clients repo being a stronger
newcomer entry point). The Wavvon-server Docker web-builder stage must
re-point its Wavvon-web checkout to the monorepo's `apps/web` — a
cross-repo coordination point called out in the migration. The TS
identity crypto stays byte-pinned to the hub's wire-format vectors; that
contract was already cross-repo and is unchanged (now one TS
implementation instead of three).

## Hubs may optionally self-serve the web client (operator sovereignty, not central hosting)

**Decision**: a hub can serve the browser client from its own origin. Setting
`WAVVON_WEB_CLIENT_DIR` makes the hub serve a directory of built web-client
assets at `/` with SPA fallback; unset, the hub is API-only exactly as before.
The official Docker image bakes a version-matched web-client build in and sets
the var by default, so `docker compose up` yields a working client at the hub's
own URL. The served client defaults its first hub connection to its serving
origin (via an injected `window.__WAVVON_HOME_HUB__`) while keeping the
type-a-URL flow for adding other hubs.

**Why**: the highest-value growth lever for a small operator is "send a link, a
friend is in" — no app install, no typing a hub URL into a separate hosted page.
Serving the client from the hub's own origin delivers that and is also the most
federation-honest shape: each operator serves their own client from their own
domain. This is not a Wavvon-operated service — it reinforces operator
sovereignty rather than centralizing anything, and it does not phone home.
Requested by the first external hub operator (videogamezone pilot, 2026-06-12).

**Alternatives considered**:

- **Compile-time embed (rust-embed) behind a toggle** — rejected: freezes a
  web-client build into every hub binary, bloats the binary for the
  proxy/hosted-client majority, and forces a hub recompile to ship a web-client
  fix.
- **Hosted client only (status quo) + documented nginx/Caddy sidecar** — kept as
  a documented option for advanced operators, but doesn't meet the zero-config
  bar the pilot operator asked for.
- **Runtime-dir only, no Docker baking** — leaves the dominant Docker path
  needing a manual mount; baking into the image is what makes it frictionless.

**Tradeoff**: the Docker image grows by the web-client bundle and the hub
release pipeline gains a cross-repo Wavvon-web checkout (same pattern the
desktop release uses for i18n). The served client is pinned to the web-client
release current at the hub release cut; the floor is that the served client
never requires API surface newer than the hub shipping it. API 404 semantics
are preserved by serving the SPA fallback only to `Accept: text/html`
navigations.

## Demo Hub removed — discovery is the entry point for new users

**Decision**: the "Try a demo hub" button and `DEMO_HUB_URL` constant are
removed from all clients. There is no Wavvon-operated demo hub. New users
find entry points through the discovery site; communities that want to be
newcomer-friendly can tag themselves accordingly there.

**Why**: a Wavvon-operated hub is a service relationship — the project
would run infrastructure, make uptime commitments, and own a community
space. That directly contradicts the "we publish software, not services"
posture. The code was always a single constant and one conditional button;
a dead code path with no operational backing is worse than no path at all.

**What we ruled out**:

- **A community-volunteer "official demo hub"** — possible, but gives one
  community a privileged label the project can't sustain or control. A
  "newcomer-friendly" tag in discovery is the right shape.
- **Keeping the constant as `null`** — the feature was already half-dead.
  Removing the code removes the implication that someone will fill it in.

---

## Missions, sparks, and cosmetic catalog removed — Wavvon operates no monetization infrastructure

**Decision**: the missions system (sponsor-funded spark rewards), spark
balance, cosmetic catalog, and entitlement blobs are removed entirely from
all clients and from Wavvon-discovery. `MISSIONS_ENABLED`,
`MISSIONS_SERVICE_URL`, `MissionsSection`, `CosmeticsSection`, and all
related discovery API routes are deleted. Wavvon ships software only; it
operates no monetization service. Sustainability is an open question
handled by donations and community support, without building a revenue
mechanism into the protocol.

**Why**: missions required the project to permanently run a central service
— handling sponsor relationships, anti-fraud, PoW on claims, entitlement
signing. That is infrastructure debt that grows with adoption and assumes
the project always operates it. More importantly, it puts a sponsor
relationship structurally inside the software, even when well-scoped. The
sovereignty pitch is cleaner and more honest without it: Wavvon publishes
software, anyone can run it, no part of the software phones home to a
project-operated service.

**What we ruled out**:

- **Keeping missions behind `MISSIONS_ENABLED = false`** — dead code with
  a constant implies future intent. If the intent is gone, so is the code.
- **Farm hosting as a Wavvon revenue line** — anyone can operate a farm;
  the project publishing farm software is not the same as the project
  running a farm for money. If someone at Wavvon wants to run a commercial
  farm later, that is an independent business decision, not something baked
  into the software design.
- **A "supporter flair" cosmetic tied to donations** — tying any cosmetic
  to money reintroduces missions complexity at a smaller scale. Donations
  remain a simple link with no in-software perks.

**What's still open**: how the project sustains itself long-term. Donations
are the current answer. Other approaches (grants, commercial support,
community funding) can be explored without adding any code to the protocol.

---

## Observability: operator-scoped infrastructure metrics only — no PII in spans or metrics

**Decision**: Wavvon ships two observability surfaces for hub operators:
a Prometheus-compatible `GET /metrics` endpoint (aggregate counters —
uptime, DB size, active connections, message throughput) and optional
OTLP trace export via `WAVVON_OTLP_ENDPOINT`. Both are **infrastructure
observability tools for the hub operator**, not user analytics. The
hard rule: **no personally-identifiable information may appear in any
span, metric label, or structured log field**. Permitted: HTTP
method/route, status code, query latency, error type, aggregate counts.
Forbidden: user IDs, pubkeys, display names, channel names, message
content, DM participants, social graph edges, or any value that
identifies a specific user, conversation, or relationship.

**Why**: the metrics endpoint and OTLP export are opt-in, operator-run
surfaces — the hub admin points them at their own Grafana, Jaeger, or
Prometheus instance. But "operator-only" is not a sufficient privacy
guarantee on its own, because operators differ in trust level depending
on the hub, and the data shape matters regardless of who receives it.
An attribute like `user_id=<pubkey>` or `channel=general` appearing in
a span means a leaked trace file or a compromised monitoring stack
becomes a surveillance artifact. Keeping spans strictly technical
eliminates that class of risk entirely, with no loss of operational
value — latency, error rates, and throughput do not require identity.

**What we ruled out**:

- **Per-user request tracing** (attaching `user_pubkey` to spans for
  debugging auth flows). Rejected: the debug value can be achieved in
  a dev environment with a local trace sink and a test account; shipping
  it in the production path permanently associates identity with traffic
  patterns in the operator's monitoring store.
- **Message-count metrics labelled by channel** (`wavvon_messages_total{channel="general"}`).
  Rejected: channel names are community content, not infrastructure. The
  existing aggregate `wavvon_messages_total` counter carries no label.
- **Opt-in "detailed mode"** that unlocks PII labels when the operator
  enables it. Rejected: any opt-in expands the surface and the rule
  becomes "PII is ok in some deployments," which is the wrong invariant
  to hold over time. The technical spans are sufficient; detailed mode
  offers no observability benefit that can't be met without identity.

**Tradeoff**: a stripped span for a failed auth request contains the
error type but not the pubkey that failed. Debugging an auth bug in
production requires correlating with server logs, not just the trace.
We accept that because structured logs are the right tool for
per-request debugging and traces are the right tool for latency
profiling — the two should stay separate. Nothing in this decision
prevents operators from adding a non-PII correlation ID (a random
request ID) to both.

---

## Hub admin panel removed — hub management moves to desktop client

**Decision**: the web-based hub admin panel (`/admin/panel`) is removed
entirely. Hub management — banning users, managing roles, channels, and
reports — belongs in the desktop client, not a separate web UI. Hub ownership
is set at hub-creation time through the client wizard, so there is no
bootstrapping problem to solve.

**Why**: the hub panel duplicated what the desktop client already does or
should do. Adding a full Ed25519+TOTP web auth system to a panel that manages
things the client already handles is the wrong abstraction. One entry point for
hub management.

**What we ruled out**:

- **Web panel with static token auth** — already existed; removed for security.
- **Web panel with Ed25519+TOTP auth** — designed and built, then reverted
  because the underlying use case was wrong. Supersedes the entry below
  ("Admin panel auth: desktop-app signing + TOTP"); see
  [`admin-panel-auth.md`](admin-panel-auth.md) (now archived).

---

## Architecture: Farm → Server → Hub; standalone hub binary deprecated

**Decision**: the canonical deployment unit is Farm (control plane, manages
multiple servers) → Server (compute node, runs hub processes) → Hub (community
space, the product users experience). A hub is never run directly — it is
always started and managed by a server agent connected to a farm. Standalone
`wavvon-hub` binary usage is deprecated.

**Why**: the original "hub = server" assumption no longer holds. The farm needs
to manage geographically distributed servers. A standalone hub creates a
separate bootstrapping and management problem that complicates both the client
wizard and the farm's control surface.

**What we ruled out**:

- **Standalone hub with web-panel bootstrap** — the original approach; removed.
- **Hub binary as a first-class deployment target** — superseded by the
  server-agent-managed model.

---

## OAuth account linking — rejected as an auth mechanism; deferred as a social badge

**Decision**: OAuth login (Google, Steam, GitHub, etc.) will not be used as an
identity mechanism or recovery path in Wavvon.

**Why rejected for auth/recovery**: linking a Wavvon identity to a centralized
provider account means that if the provider bans the user, suspends the app, or
changes its API, the user loses Wavvon access too. This directly conflicts with
the "your hub can't take your identity" sovereignty pillar that justifies the
Ed25519 keypair model.

**Better path for the same UX problem** (the "I forgot my 24-word phrase" case):
encrypted-passphrase identity backup — the user picks a passphrase, the recovery
phrase is encrypted with it, and the result is stored wherever the user chooses
(their hub, a password manager, cloud storage). Gives the "login with passphrase"
feel without any third-party dependency. Design in
[`identity-recovery.md`](identity-recovery.md) — Part 1 (Backup / export).

**OAuth may still ship as**: a "verified badge" feature — "this Wavvon identity is
linked to my GitHub / Steam profile". That is metadata for social proof, not auth.
Tracked in [`future-features.md`](future-features.md).

**Alternative considered**: use OAuth only for first-time onboarding to smooth
key creation. Rejected: the keys the OAuth flow would create would still be tied
to the provider — losing the provider account loses the key. The recovery phrase
is a better first-time safety net and doesn't require any external account.

---

## Admin panel auth: desktop-app signing + TOTP, not a shared bearer token

**Decision**: the web admin surfaces (hub web panel, farm console) drop the
shared `web_admin_token` for a two-factor login tied to real identity. Factor
one is an Ed25519 challenge signed by the user's **desktop app** — the browser
shows a challenge, a `wavvon://sign-admin` deep link hands it to the Tauri app,
which confirms with a dialog and signs with the user's existing key
(`auth_creds.rs`), then POSTs the signature to the server's own
`/admin/auth/signed` endpoint (desktop→server, so no browser localhost listener
and no CORS). Factor two is RFC 6238 TOTP, secret stored server-side keyed by
canonical pubkey, with a QR enrollment on first login. A successful login mints
a short-lived, server-side, opaque cookie session (12h, instantly revocable) —
not a signed blob. The panel is **role-aware**: farm admin (`farms.admin_pubkey`)
gets the farm console, a hub admin (role with `admin` on that hub) gets that
hub's panel, multi-hub admins get a desktop-side picker. A signed, 8-hour
`admin_panel: true` farm token is the remote/headless fallback (still requires
TOTP). TOTP applies to the web panels only, never the desktop client. Full design
in [`admin-panel-auth.md`](admin-panel-auth.md).

**Alternatives considered**:

- **Keep the shared bearer `web_admin_token`** ([`hub-admin-panel.md`](hub-admin-panel.md)
  Feature 1). Rejected: a single secret with no identity behind it, no second
  factor, and no link to the role system; a leak grants full admin with nothing
  to revoke per-person. This entry supersedes that flow.
- **Sign in the browser** (import the key into the page / WebCrypto). Rejected:
  the private key must never enter the browser. Keeping the desktop app as the
  signer matches the rest of Wavvon's auth and behaves like a hardware key.
- **A browser localhost callback server** for the signature. Rejected: it
  reintroduces the CORS/preflight problem and an open local port. Routing the
  signature desktop→server over HTTPS avoids both — the browser only ever talks
  same-origin and polls for completion.
- **A farm-level `hub_admin_grants` table** to centralize who admins which hub.
  Rejected: hub-admin authority is community-axis and already lives in each hub's
  `user_roles`. A farm-side grant store would put a community decision on the
  hosting layer, violating the two-axis rule ([`home-hub.md`](home-hub.md)). Hub
  admin is managed per-hub; the multi-hub picker is client-side convenience.

**Tradeoff**: the flow needs the desktop app installed and adds a browser
poll-for-callback round trip, which is more moving parts than pasting a token.
We accept that because it buys real identity (the same key the user already
holds), a true second factor, instant per-person revocation, and reuse of the
existing role and `admin_pubkey` authorization — and the remote-token fallback
covers the headless case for operators without the desktop app on the box.

---

## Custom themes: CSS design tokens, not CSS injection; personal-axis, file-portable

**Decision**: user-created skins expose a curated set of CSS custom properties
(surfaces, text, accent, status, borders, effects, shadows, one radius scale knob)
as a JSON `.wavvonskin` file with a `base` fallback theme and a `tokens` override
map. The active skin is applied via `element.style.setProperty()` on
`document.documentElement`; a `[data-theme="custom"]` block in `styles.css` holds
the base fallback. The skin is stored in `~/.wavvon/appearance.json` (desktop/android)
or `localStorage` (web) using the same `#[serde(default)]` pattern as `voice.json`.
The existing four-theme picker gains a fifth "Custom" card that shows the skin name
and three swatches when a skin is active. Full design in
[`custom-themes.md`](custom-themes.md).

**Alternatives considered**:

- **Arbitrary CSS injection** (a raw textarea the user types CSS into). Rejected:
  a shared `.wavvonskin` file becomes an attack vector (`url()` for external
  fetches, `;`/`}` to break out of declarations, `expression()` in older engines).
  Even locally, an accidental layout breakage is unrecoverable without a "reset all."
  A validated token allowlist is the correct blast radius.
- **Full CSS custom property surface** (every `--r-*`, `--space-*`, `--text-*` token
  exposed). Rejected: spacing and type-scale tokens are load-bearing for layout and
  are not theme-specific — the built-in themes don't touch them. Exposing them means
  a skin can overflow text, collapse panels, or break grid math. Only the tokens the
  built-in themes actually override are skinnable.
- **Theme stored entirely in the profile file** (alongside the theme selection today).
  Rejected: the profile is the identity/hub-membership document, not a settings bag.
  The `voice.json` sidecar pattern is the established precedent for audio settings;
  `appearance.json` follows the same shape and will migrate cleanly into the personal
  prefs blob when home hubs land.
- **Hub-level themes as the first skin feature.** Rejected for v1: community-axis
  operator branding is a separate design problem — it requires hub DB storage,
  federation of the token blob, operator permissions, and a "user opt-out" story.
  Personal skins have none of those dependencies and deliver user value sooner.

**Tradeoff**: the `base` + sparse overrides model means a skin file is tiny and
forward-compatible (new tokens just inherit from `base`), but it means a skin and its
base theme are coupled — if the base theme's values change in a future release, the
skin's unset tokens change with them. We accept that because the alternative
(snapshotting all token values into every skin file) makes files verbose, breaks when
token names change, and loses the benefit of upstream theme improvements. The skin
author sets only what they want to differ; the theme maintainer owns the rest.

---

## Database abstraction: trait-based store crate split, not inline raw SQLx

**Decision**: the hub's data layer will move from a bare `sqlx::SqlitePool` embedded directly in `AppState` and raw `sqlx::query*` calls scattered across every route handler, to a set of domain-split traits (`AuthStore`, `UserStore`, `ChannelStore`, `MessageStore`, `RoleStore`, `InviteStore`, `ModerationStore`, `SettingsStore`, and more) collected into a `HubStore` super-trait, implemented by `wavvon-store-sqlite` (the current code, moved) and eventually `wavvon-store-postgres` (community contribution). `AppState.db: SqlitePool` becomes `AppState.store: Arc<dyn HubStore>`. A `StoreError` enum (`NotFound`, `Conflict`, `PermissionDenied`, `Internal`) replaces per-route ad-hoc `.map_err()` and `"UNIQUE"` string-sniffing. `#[async_trait]` is the dispatch mechanism. Transaction scope is managed by a `with_transaction<F, T>` closure. Migration contract: each backend owns its schema via a `Migrate` trait; the hub calls `store.run_migrations()` on startup. Full design in [`store-trait-design.md`](store-trait-design.md).

**Alternatives considered**:

- **Keep the current raw-SQLx approach indefinitely.** Rejected: it makes every handler a database-backend coupling point. Swapping the database means touching every route file, and error normalization requires ad-hoc per-handler decisions. The current design accidentally bakes SQLite's FTS5 and UNIQUE-conflict message text into the application layer.
- **One God trait `HubStore` with all methods.** Rejected: a single 100-method trait is unimplementable in pieces — the compiler demands all methods at once, so a backend author can't work domain by domain. Domain-split traits with a blanket super-trait impl give a seam per domain.
- **An explicit `Transaction<'conn>` object** (begin/commit/rollback). Rejected: the lifetime of a SQLite transaction handle (`&mut Connection`) differs from Postgres's pooled `Transaction<'c>`, so abstracting it leaks backend types. The closure form (`with_transaction<F, T>`) keeps the transaction type private to each backend.
- **Feature-flag the backend at compile time** (one `Cargo.toml` feature, conditional impls). Rejected: forces recompilation to switch backends and cannot support runtime selection (an operator editing `hub.toml` without recompiling). `Arc<dyn HubStore>` supports runtime selection by `database_url` prefix.
- **Move to `sea-orm` or `diesel` with their own abstraction layers.** Rejected: both introduce significant LoC overhead and ORM conventions that fight the existing `sqlx` query patterns. The trait layer is thinner and lets each backend stay idiomatic to its own engine.

**Tradeoff**: `Arc<dyn HubStore>` with `#[async_trait]` adds one heap allocation (a boxed `Pin<Box<dyn Future>>`) per database call — negligible against any real IO round-trip. The `with_transaction` closure pattern is awkward when callers need to branch on intermediate results inside a transaction; those flows must be written as linear closures. Both costs are accepted: allocation is noise; transaction shape discipline is necessary regardless of the abstraction.

**Status**: shipped (2026-06-27). The `store` crate implements all `HubStore` sub-traits with a PostgreSQL backend. The `wavvon-store-sqlite` intermediate step was skipped; PostgreSQL landed directly as the canonical backend. SQLite was removed from the workspace entirely.

---

Older entries (everything from "Discovery v2" back to the founding
"No proof-of-work yet" entry) are relocated verbatim to
[decisions-archive.md](decisions-archive.md).
