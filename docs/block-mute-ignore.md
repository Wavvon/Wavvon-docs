# Block / Mute / Ignore — User-Level Controls

**Status**: design — partial code exists (`blocked_users.json`,
`load_blocked_users`/`save_blocked_users` in Wavvon-desktop). This doc
designs the full system and the migration of the existing per-device
list onto personal-axis storage.

This is the **user-level** toolset, distinct from hub moderation. A hub
ban/kick/timeout/hub-mute is a *community* acting on a member; it lives
on the community hub, affects everyone, and is the admin's call. Block /
ignore / DND is a *person* curating their own experience; it follows the
user across every hub and is invisible to the community. The two never
substitute for each other — see
[hub moderation interaction](#interaction-with-hub-moderation).

Three independent features share this doc because they share a storage
home (the prefs blob) and a settings surface, not because they're tiers
of one thing:

1. **Block** — strongest. "I never want to see this person anywhere."
2. **Ignore / hide** — softer, chat-only, no enforcement.
3. **Quiet hours / DND** — time-based notification downgrade, no
   per-person targeting. Picks up the deferred item from the
   notifications decision in [decisions.md](decisions.md).

## Where the state lives

All three are **personal-axis** state. Per the two-axis rule
([home-hub.md](home-hub.md)), personal-axis state lives in the user's
**home hub prefs blob**, encrypted, replicated across the home hub list.
It does **not** live on community hubs (a community hub must not learn
your full cross-hub block list) and it is **not** per-hub.

Today's `blocked_users.json` is a per-device file that doesn't sync. The
migration: the block list, ignore list, and DND schedule become fields
inside the encrypted prefs blob (`home-hub.md` already lists "blocked
users" as a prefs-blob field). Until the home hub list ships, the
existing per-device file is the fallback store — the client reads the
blob if home hubs are configured, else the local file. This mirrors the
master-key legacy fallback: new path preferred, old path still works.

```
PrefsBlob {
  ...existing fields...
  blocks:  Vec<BlockEntry>,    // { pubkey, since }
  ignores: Vec<IgnoreEntry>,   // { pubkey, since }
  dnd:     DndSettings,        // schedule + quick-toggle state
}
```

Because the blob is encrypted to the user (AEAD, master-derived key),
no home hub can read who you've blocked. That's the point — block is
private, and the storage layer must not leak it.

### Why prefs blob, not community-hub-side

A per-hub block list on each community hub would (a) make the block
public to that hub's operator, (b) require N writes to N hubs and drift
between them, and (c) not cover federated DMs from someone whose hub you
don't share. The tradeoff we accept: **DM enforcement needs a server
copy of one bit** (see below), so the block list is not *purely* private
— a hub you receive DMs through learns the pubkeys you've blocked *for
DM purposes*. That single-bit leak is scoped to your home hub (which
already holds your DM inbox) and is the minimum needed for server
enforcement. The full list, and the ignore list, stay encrypted.

## 1. Block

### Scope

**Global** across all hubs. A block is keyed by the target's **master
pubkey** (not a subkey, not a per-hub membership), so it applies
everywhere that identity appears — every channel on every hub, DMs,
voice, federated surfaces. Legacy single-key identities block by their
single pubkey, which is their subkey-0 pubkey, so the same key matches.

### What it does

| Surface | Effect | Enforced by |
|---|---|---|
| Channel chat (shared community) | Messages hidden client-side, replaced by a collapsed placeholder | Client filter |
| DMs to you | Blocked user **cannot** send you a DM | **Server** (home hub) |
| DMs you send | You can still DM them (blocking is one-directional and private) | n/a |
| Voice in a shared channel | Their audio is muted **client-side** for you; you stay in the channel | Client |
| Reactions, typing, presence | Their reactions on your view are hidden; typing indicator suppressed | Client |
| Mentions | A mention *from* a blocked user produces no notification and no unread pin | Client (notification gate) |

### Mutual channels — messages hidden, with a placeholder

In a channel you share with a blocked user, their messages are
**collapsed to a one-line placeholder** ("Blocked message — click to
reveal") rather than fully absent. Rationale: full absence breaks reply
context and thread continuity — a reply to a blocked user's message
would dangle, and other people quoting them would be incomprehensible.
The collapsed placeholder keeps the conversation legible while honoring
"I don't want to read this person." Click-to-reveal is per-message, not
a global unhide. This is the same render path the **ignore** feature
uses (below); block just also carries the DM and notification
enforcement that ignore doesn't.

### Voice

You stay in the channel; their audio is **locally muted** for you. We do
not remove you from voice and we do not tell the hub to stop relaying
their packets (that would be a community-visible side effect of a
private action, and the hub relay has no per-listener filtering today).
Client-side gain-to-zero on their stream is the right cut: private,
immediate, no protocol change. The cost is the hub still relays their
audio to your client and you discard it — negligible at community scale.

### Privacy

The blocked person is **never told**. From their side, their DMs to you
appear sent (the home hub accepts and silently drops, or returns a
generic non-committal success — see enforcement). Their messages in
shared channels still post normally for everyone else. There is no
"you've been blocked" signal anywhere.

### Server enforcement — the one bit that leaves the blob

DM blocking is the only part that must be server-enforced, because a
client filter can't stop a message from being *stored* on your home hub
and pushed to your other devices. So:

- The home hub keeps a **DM-block set** per user: just the pubkeys that
  may not DM this user. This is a projection of the block list — the
  client pushes adds/removes as the list changes. It is *not* the full
  encrypted blob; it's a plaintext deny set the hub can act on.
- On inbound DM (local or federated), the home hub checks the sender's
  master pubkey against the recipient's DM-block set. If blocked, the
  hub **does not store and does not push** the message. It returns a
  success-shaped response to the sending hub so the block stays private
  (the sender's hub cannot distinguish "delivered" from "blocked").
- Federated case: the *recipient's* home hub enforces, because that's
  where the recipient's block set lives. The sender's hub is not asked
  to enforce another user's block (it couldn't be trusted to anyway).

Everything else (channel hiding, voice mute, reaction/typing
suppression, notification gating) is **client convenience** — no server
involvement, works offline, and degrades safely (a stale client just
shows a message it would have hidden).

### Unblock

Removing a block is a prefs-blob write (replicated) plus a DM-block-set
removal on the home hub. After unblock, their new messages render
normally; previously-collapsed placeholders in scrollback un-collapse on
next render. No notification to either party.

## 2. Ignore / hide

### What it is

A softer block: "mute this person in chat, but don't sever them." Their
messages collapse to the same placeholder as a block, **but**:

- They can still DM you (no server enforcement at all).
- Their voice is **not** muted (ignore is a chat-only concern; if you
  want to mute their voice without blocking, use a per-participant
  voice-volume control — out of scope here).
- A mention from an ignored user **still** notifies, unlike a block.
  Ignore says "I find their chatter noisy," not "I want nothing from
  them." Mentions are an explicit address; ignore doesn't suppress them.

### Storage and scope

Same prefs blob, separate `ignores` list. **Global** like block (keyed
by master pubkey). No server copy exists — ignore is 100% client-side
filtering, never enforced, never leaves the encrypted blob. A home hub
cannot tell you've ignored anyone.

### Why a separate feature, not a block flag

The use case ("this person spams reactions / posts constantly, but I
still want their DMs and their @-mentions to reach me") is real and
distinct from block ("I want this person gone"). Collapsing them into
one feature with sub-toggles multiplies the UI and forces every user to
reason about a matrix. Two named verbs — Block (severs) and Ignore
(quiets) — each map to one mental model. This is the same "name the
distinct features" reasoning as the notifications decision.

## 3. Quiet hours / DND

### What it is

A global override that **downgrades every channel's notification mode by
one step** for the duration:

```
all      -> mentions
mentions -> silent
silent   -> silent   (already floor)
```

This is exactly the layering the notifications decision in
[decisions.md](decisions.md) reserved ("Quiet hours / DND windows… layer
on top as a global override that downgrades all modes one step"). It
does **not** change the stored per-channel `NotifyMode`; it's applied at
the moment the client decides whether to fire a notification/pin. When
DND ends, the per-channel modes are unchanged and behave as before.

### Two ways to engage

- **Quick-toggle** — a Do Not Disturb switch in the **sidebar footer**,
  next to the existing self-mute/self-deafen controls. One click on/off,
  no schedule. This is the common case ("I'm in a meeting, shut up for a
  bit").
- **Schedule** — an optional active window (e.g. quiet 22:00–08:00
  local) configured in Settings. While inside the window, DND is on
  automatically. The quick-toggle can override the schedule in either
  direction until the next window boundary.

### Interaction with the three-mode system

DND is a **read-time transform**, not a fourth mode. The notification
decision's rule still holds: notification implies unread pin. Under DND,
a channel in `all` mode behaves as `mentions` — mentions still pin and
ping, non-mention traffic goes quiet. A user in `silent` stays silent.
We deliberately do **not** add a "DND = total silence" option distinct
from per-channel `silent`-everywhere; one-step-downgrade keeps mentions
reaching you during quiet hours, which is the behavior people expect
from a DND that isn't "airplane mode."

### Storage and scope

`DndSettings { enabled: bool, schedule: Option<{ start, end, tz }> }` in
the prefs blob (replicated, so phone and desktop agree). Multi-device
note: DND is a *display/notify* preference; with cross-device chat push
deferred ([multi-device.md](multi-device.md)), each device applies DND
locally from the shared setting. No server involvement — DND is purely a
client notification-gate transform.

## Route changes

All server-side work is on the **home hub** (personal-axis), reusing the
identity/prefs surface from [home-hub.md](home-hub.md). No community hub
changes.

| Route (home hub) | Purpose |
|---|---|
| existing prefs-blob PUT/GET | Carries `blocks`, `ignores`, `dnd` inside the encrypted blob. No new route. |
| `PUT /identity/dm-blocks` | Replace the plaintext DM-block set (projection of the block list). Authenticated as the user. |
| `GET /identity/dm-blocks` | Read it back (for a freshly-paired device to reconcile). |

DM ingestion (`hub/src/routes/dms.rs` and the federation inbound handler
in `hub/src/federation/handlers.rs`, both Wavvon-server) gains a
block-set check before store-and-push. Nothing else on the wire changes.

## Client UI

All three are mirrored across Wavvon-desktop, Wavvon-web, Wavvon-android
— same prefs-blob shapes, same surfaces.

### Where to block / ignore

- **Right-click a user** (message author, member list, voice
  participant) -> context menu with **Block** and **Ignore** items
  (and their inverses when already set).
- **Profile card** (click a name/avatar) -> Block / Ignore buttons.
- **DM header** -> a Block action (the strongest, most likely place to
  want it). No Ignore here — ignore is a chat-channel concept.

### How blocked/ignored messages appear

Collapsed one-line placeholder, click-to-reveal per message (shared by
block and ignore). Not fully absent — preserves reply/thread context as
described above. A blocked user's reactions and typing indicator are
suppressed entirely (no placeholder for those — they're ambient, not
content).

### Unblock / un-ignore flow

- Inline: clicking a revealed placeholder offers "Unblock / Un-ignore
  this person."
- Settings -> a **Blocked & Ignored** list (two sections) showing each
  pubkey, optional cached display name, and the date set, with a remove
  button per entry. This is the canonical management surface; it reads
  from the prefs blob.

### DND surfaces

- Sidebar-footer DND quick-toggle (next to self-mute/deafen).
- Settings -> Notifications -> a "Quiet hours" subsection with the
  optional schedule (start/end time pickers, timezone = local).
- When DND is active, the footer toggle shows an active state and a
  tooltip ("Quiet hours active — notifications downgraded").

## Interaction with federation

- **Block propagates to federated DMs** via the recipient's home hub
  enforcing its DM-block set on inbound federation DMs — the same check
  as local DMs, applied at the recipient side. A sender on a distant hub
  the recipient has never shared a community with is still blocked,
  because enforcement is recipient-home-hub-side, not community-hub-side.
- **Channel hiding in alliance/shared channels** is client-side like any
  other channel — a blocked user's messages read from a federated
  alliance channel collapse the same way. No federation protocol change.
- The block list itself never federates between hubs — it lives only in
  the user's home hub list, encrypted.

## Interaction with hub moderation

These are **orthogonal systems** and must not be conflated:

- A **personal block** is invisible to the community, affects only your
  view + your DM inbox, and follows you across hubs.
- A **hub ban** ([data-model.md](data-model.md)) is the community
  removing a member; it's public to admins, affects that hub only, and
  is the admin's authority.

Blocking someone does **not** ban them, report them, or signal anything
to any hub admin. Being a hub admin does **not** give you a way to see
who has blocked whom. A user who blocks a hub admin still receives that
admin's *moderation actions* (a ban still bans you) — block hides chat
and DMs, it does not exempt you from a community's rules. Conversely,
un-banning a user at the hub level does not touch any personal block.

## Threat-model notes

Relative to [threat-model.md](threat-model.md), this closes the
"block-by-pubkey would help (TODO)" gap on the mention-noise/harassment
row, and the DM-block set is the server-enforced piece behind it.

| Surface | Mitigation / note |
|---|---|
| Home hub learns the recipient's DM-block pubkeys | Minimum bit needed for enforcement; scoped to the home hub that already holds the DM inbox. Full block list and ignore list stay encrypted. |
| Blocked user crafts a new identity to evade | Block is per-master-pubkey; a new identity is a new pubkey and isn't covered. Same limitation as every pubkey-keyed control; anti-Sybil is the lobby/PoW design's job, not block's. |
| Hostile home hub ignores the DM-block set (delivers anyway) | Detectable: the message would appear on the user's other home hubs only if *those* also ignore it. The user can drop a hub that misbehaves, same as any home-hub trust failure. |
| Client filter bypassed (forked client shows blocked chat) | Acceptable — channel hiding is convenience for the blocker's own view; a fork only harms its own user, not the blocked person, and changes no server state. |

## Phasing

1. **Phase 1 — client-side block/ignore on the existing local file.**
   Ship the render placeholder, context-menu/profile/DM-header entries,
   voice local-mute, notification gating, and the Settings management
   list. Reads/writes today's `blocked_users.json` plus a sibling
   ignore/DND store. No server change, works now, no home hub needed.
2. **Phase 2 — DND quick-toggle + schedule.** Pure client; the
   downgrade transform in the notification gate. Independent of 1.
3. **Phase 3 — move to the prefs blob.** When home hubs land
   ([home-hub.md](home-hub.md)), `blocks`/`ignores`/`dnd` move into the
   encrypted blob and replicate. Local file becomes the legacy fallback.
4. **Phase 4 — DM-block server enforcement.** Add the `dm-blocks`
   projection routes and the inbound-DM check on local + federated DM
   paths. This is the only phase that touches the hub server.

## What's deferred

- **Block-by-IP or device** — block is identity-keyed only.
- **Temporary / expiring blocks** — all blocks are until-unblocked.
- **Block a whole hub / "snooze a server"** — that's a hub-level
  notification/leave concern, not a per-person block.
- **Voice mute of an *ignored* (not blocked) user** — folds into a
  per-participant voice-volume control, a separate small design.
- **Reporting / shared block lists / blocklist import** — a personal
  block is private and local to the user; community-scale shared
  blocklists belong in the future hub-certifications / anti-abuse space,
  not here.
- **"Restrict" middle tier** (allow DMs but hide from member lists) — no
  demonstrated need beyond block + ignore.
- **Cross-device DND with per-device overrides** — DND is one shared
  setting today; per-device "quiet on phone only" waits on the
  multi-device per-device-prefs distinction noted in
  [multi-device.md](multi-device.md).
