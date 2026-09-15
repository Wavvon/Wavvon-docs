# Permissions — Model and Catalog

**Status**: designed 2026-09-15 with the user; **not built**. This file
replaces the permission model that exists today rather than describing it.
Where it says "today", that is the code as of 2026-09-15; everything else is
the target.

The channel overwrite cascade ([nested-channels-ux.md](nested-channels-ux.md)
§3) is the one piece that survives unchanged — this design reuses its
resolver, its tables and its rules.

---

## 0. Why this exists

Four things went wrong at once, and they are the same thing:

1. **`admin` is a wildcard that does 83 jobs.** `has()` returns true for any
   permission when the caller holds `admin`, and 83 check sites across 26
   files ask for nothing else. Delegating "look after the badges" means
   handing over bans, settings, recovery and federation.
2. **The catalog has four copies and no owner.** `ALL_PERMISSIONS` in
   `hub/src/permissions.rs` (20 strings), `ALL_PERMISSIONS` in
   `packages/ui/src/components/admin/RolesSection.tsx` (15),
   `CHANNEL_OVERWRITE_PERMISSIONS` in `packages/ui/src/utils/channelPermissions.ts`
   (18), and the strings actually consulted by the code. No two agree.
3. **The drift hides what is actually unreachable.** Six permissions the hub
   enforces are missing from the roles UI, which reads as "nobody can grant
   these" — but all six are in the overwrite list, so they are grantable per
   channel. The one genuinely unreachable grant is **hub-wide
   `create_events`**: `events.rs:552` requires the non-channel-scoped
   baseline, and only the roles UI grants that.
4. **Nothing keeps them honest.** `create_role` / `update_role` insert
   whatever string arrives into `role_permissions` with no validation, so
   `"banana"` is a storable permission. Only channel overwrites validate
   (`channel_permissions.rs:222`).

The drift produced four ghosts and one invisible gate:

| String | What it actually is |
|---|---|
| `manage_bots` | In the roles UI, absent from the entire Rust workspace. A checkbox that grants nothing. |
| `use_video` | Granted to `builtin-owner` in `migrations.rs:445`, consulted nowhere. |
| `manage_games` | Granted at bootstrap, offered as a channel overwrite, consulted nowhere. |
| `start_game` | Granted to `builtin-everyone`, offered as a channel overwrite, consulted nowhere. |
| `manage_voice` | A **real gate** (voice-zone creation, `ws/handlers/voice.rs:990`) written as a string literal, absent from every list — so no client can show it and the overwrite validator rejects it. |

## 1. The model

### 1.1 No wildcard. Owner is a property, not a permission.

`admin` is deleted from the catalog. "The owner can do everything regardless"
stops being a row in `role_permissions` and becomes a property of the caller:

```rust
pub fn has(&self, permission: &str) -> bool {
    self.is_owner || self.effective.contains(permission)
}
```

`is_owner` is computed from membership of `builtin-owner`. Ownership stays
that role — transfer already manipulates it, recovery already protects it, and
`roles.rs` already refuses to delete or empty it.

Two existing special cases collapse into this one:

- `fold_overwrites` no longer needs "`admin` is immune to a channel deny"
  (`permissions.rs:257`). Owner immunity lives in `has()`, above the fold.
- `channels_with_permission`'s admin shortcut becomes an `is_owner` shortcut.

**Consequence to accept deliberately**: there is no longer any way to hold
every permission except by being the owner. A "co-owner" is a role that
happens to carry the whole catalog, and it will not silently gain permissions
added later. That is the point.

### 1.2 Two axes, both role-scoped

|  | hub-wide | channel (ancestor cascade) |
|---|---|---|
| **role** | `role_permissions` | `channel_permission_overwrites` |
| **single user** | **deliberately absent** | **deliberately absent** |

Precedence is what already exists: the hub-wide baseline, then the channel's
ancestor chain folded root → target, allow beating deny within a level,
deeper levels beating shallower ones.

**Why no per-user axis** (decided 2026-09-15): it was considered and dropped.
A role with one member already expresses "this one person, here", so the axis
buys convenience rather than capability — and it buys it at the price of a
fourth place a grant can hide. The reason for dropping it was narrower than
tidiness: four resolution levels is where a permission bug stops being
visible. An escalation that lands in a per-user row is invisible to anyone
reading the roles screen, because the roles screen is not where it lives.
Two axes, both role-scoped, means every grant on the hub is reachable from
the list of roles.

### 1.3 Hierarchy stays one number

Moderating a person requires out-ranking them: `require_can_moderate`
(`routes/moderation/models.rs:48`) compares `max_priority` and refuses equal
or higher. That is kept as-is.

**Rejected**: TeamSpeak's numeric duel — a `*_power` on the actor paired with
a `*_needed_power` on the target, per action. It is two numbers per action to
express what one number per person already expresses, and the cases it buys
(out-rank someone for kicking but not for banning) are better said by holding
one permission and not the other.

### 1.4 Naming: dotted prefixes

`area.resource.qualifier` — `messages.send`, `moderation.ban.permanent`,
`banlist.sources.manage`. Matches the existing capability strings
(`voice.alliance`, `alliance.permissions`).

This is not cosmetic. The catalog is ~40 entries against today's 15, and 40
flat checkboxes is the TeamSpeak failure at smaller scale. With a prefix, the
roles UI groups by splitting the string, so the grouping cannot drift from the
catalog — there is no second list to keep in sync. Role templates
(`bootstrap.rs` already ships some) become the normal way to configure a hub;
nobody ticks 40 boxes by hand.

### 1.5 One source of truth

The server owns the catalog. Clients stop carrying their own copies:

- The hub exposes the catalog — each entry with its id and its valid scopes.
  The roles UI and the channel-overwrite UI both render from it, which
  deletes `RolesSection.ALL_PERMISSIONS` and
  `CHANNEL_OVERWRITE_PERMISSIONS` and the "which of these has a channel
  dimension" decision that currently lives in a TypeScript comment.
- `create_role` / `update_role` validate against the catalog. Missing today.
- Labels stay in the i18n catalogs keyed by id, as
  `hub.admin.roles.perm.<id>`. `templateLabels.test.ts` already fails when an
  id has no label in one of the four languages; it keeps working, and now
  covers the overwrite UI too, which today ships hardcoded English strings
  (`channelPermissions.ts`, rendered raw at `ChannelPermissionsTab.tsx:159`).
- A **derivation endpoint** — "why can this member do X here" answering
  *role Moderators, allowed on #general*. Two axes are debuggable by reading;
  they are not debuggable by guessing, and every operator question about
  permissions is this question.

## 2. Granularity rule

**One permission per resource. Split only where the acts differ in
reversibility or in blast radius — never because the verbs differ.**

Creating and deleting an emoji have the same audience; banning for an hour
and banning forever do not. The splits this rule licenses, and no others:

| Split | Why |
|---|---|
| `moderation.kick` / `ban.temporary` / `ban.permanent` | Escalating irreversibility. A kick is a door; a permanent ban is a decision. |
| `banlist.sources.manage` from the rest of the ban list | Adding a source imports a stranger's bans. The subject is not this hub's members and the authority is not this hub. |
| `certs.issue` / `certs.revoke` | A revocation invalidates trust that already left the hub. |
| `surveys.manage` / `surveys.responses.read` | The responses are personal data. Running a survey and reading who said what are different jobs. |
| `moderation.reports.read` / `moderation.reports.review` | Same shape: seeing the queue is triage, closing an item is a verdict. |
| `directory.publish` | Makes the hub publicly discoverable. Nothing un-indexes it. |
| alliance hub acts / per-alliance acts | Already designed — see [decisions.md](decisions.md), "Alliance permissions". Leaving an alliance destroys the mirrored state. |

**Owner-only, not a permission**: approving an identity recovery
(`recovery.rs` `admin_approve`) hands one person control of another person's
account. It is the single most dangerous act the hub offers and there is no
delegation of it that is worth the failure mode. Same for ownership transfer.

## 3. The catalog

`H` = grantable hub-wide. `C` = grantable as a channel overwrite. The channel
column is a subset by design: a permission gets `C` only when its object
lives in a channel. There is no channel-scoped hub administration.

### Messages

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `messages.read` | H C | `read_messages` | Reading a channel; also the visibility filter for lists and WS auto-subscribe |
| `messages.send` | H C | `send_messages` | Posting, polls, reactions |
| `messages.manage` | H C | `manage_messages`, `admin` on `delete_poll` | Deleting and editing others' messages, pinning, deleting a poll |

### Forum

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `forum.posts.create` | H C | `create_posts` | Opening a thread, replying |
| `forum.posts.manage` | H C | `manage_posts` | Editing/deleting others' posts, lock, pin, tags |

### Channels

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `channels.manage` | H C | `manage_channels`, `manage_voice`, `admin` on `update_channel`, `set_talk_power` | Create, rename, move, delete, re-parent; voice zones; talk power |
| `channels.appearance` | H C | `manage_channel_icons` | Icons, colors, banners on a channel |
| `channels.permissions` | H C | `manage_roles` at channel level | Editing this channel's role overwrites |

`manage_voice` folds in here: a voice zone is channel configuration, not an
activity. `set_talk_power` likewise — it is a channel setting that was gated
hub-admin by accident.

### Voice

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `voice.join` | H C | — (**new gate**, see §5) | Entering a voice channel, screen share |
| `voice.soundboard.use` | H C | `use_soundboard` | Playing a clip |
| `voice.soundboard.manage` | H | `manage_soundboard` | Uploading and deleting clips |
| `voice.move_members` | H C | `move_members` | Moving a participant; resolved against the **destination** channel |

### Moderation

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `moderation.kick` | H | `kick_members` | Eject from the hub; the member may return |
| `moderation.mute` | H C | `mute_members` | Permanent text/voice mute, unmute, lower hand |
| `moderation.timeout` | H | `timeout_members` | Self-expiring mute |
| `moderation.ban.temporary` | H C | — (**new behavior**, see §5) | Ban with an expiry |
| `moderation.ban.permanent` | H C | `ban_members` | Ban with no expiry, unban, list |
| `moderation.reports.read` | H | `admin` | Seeing the report queue |
| `moderation.reports.review` | H | `admin` | Acting on a report |
| `moderation.settings` | H | `admin` | Moderation settings, challenge/PoW settings |

All of these keep the `max_priority` out-ranking check.

### Federated ban lists

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `banlist.read` | H | `admin` | Reading entries, sources and overrides |
| `banlist.sources.manage` | H | `admin` | Adding, editing, removing a source — importing another hub's bans |
| `banlist.overrides` | H | `admin` | Local override of an imported entry |
| `banlist.settings` | H | `admin` | Ban list settings |

### Roles and members

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `roles.manage` | H | `manage_roles` | Create, edit, delete roles and role categories; assign roles. Bounded by priority |
| `members.read` | H | `admin` on `list_members` | The member list with roles |

### Hub

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `hub.settings` | H | `admin` | Hub profile, lobby, PoW, channel depth, search reindex |
| `hub.appearance` | H | `manage_hub_icons`, `admin` on emojis and tags | Icon library, custom emoji, hub tags |
| `hub.admission` | H | `admin` on `list_pending`/`approve_user` | The join queue and admission posture |
| `invites.manage` | H | `manage_channels` (**wrong today**) | Mint, list and revoke invites |

Listing invites requires `manage_channels` today (`invites.rs:47`). Nothing
about an invite is a channel.

### Events

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `events.create` | H C | `create_events` | Creating an event. Hub-wide events additionally require the hub-wide grant, as today |
| `events.manage` | H C | `admin` on `update_event`/`delete_event` | Editing and deleting others' events |

### Trust

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `certs.issue` | H | `admin` | Issuing a certificate, granting a cert badge |
| `certs.revoke` | H | `admin` | Revoking; listing |
| `certs.settings` | H | `admin` | Certificate requirement tier |
| `badges.manage` | H | `admin` | Badge CRUD, issue, revoke, pending accept/decline |

### Federation and presence

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `alliances.manage` | H | `admin` | Create, accept, decline, leave — designed as `manage_alliances`, see [decisions.md](decisions.md) |
| `alliances.peers` | H | `admin` on `add_peer` | Direct peer registration |
| `directory.publish` | H | `admin` | Signing for the directory, the public listing |

Per-alliance acts (invite another hub, share/unshare a channel, per-share
policy) stay on the `alliance_managers(alliance_id, role_id)` grant list from
the 2026-09-14 design, not on this catalog. Sharing a channel additionally
requires `channels.manage` on that channel.

### Integrations

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `webhooks.incoming.manage` | H | `admin` | Incoming webhook CRUD, secret regeneration |
| `webhooks.outgoing.manage` | H | `admin` | Outgoing webhook CRUD, subscriptions, secret rotation, delivery log |
| `bots.admit` | H | `admin`, `manage_roles` | Admitting and removing a bot |
| `bots.capabilities` | H | `admin` | Granting a bot's capabilities and channel scope |
| `bots.audit.read` | H | `admin` | The bot audit log |

`bots.admit` is provisional: if the `is_bot` review concludes that a bot is an
ordinary user admitted by a pubkey-bound invite, this collapses into
`invites.manage` and only `bots.capabilities` survives. See
[next-up.md](next-up.md).

### Surveys

| Permission | Scope | Replaces | Covers |
|---|---|---|---|
| `surveys.manage` | H | `admin` | Defining the survey |
| `surveys.responses.read` | H | `admin` | Reading responses, including per-member |

**Owner only, ungrantable**: identity recovery review, ownership transfer.

## 4. Deleted

| String | Why |
|---|---|
| `admin` | Replaced by owner-as-property (§1.1) |
| `manage_bots` | Gated nothing. What it would gate is admission plus capability-granting, which is `bots.admit` + `bots.capabilities` — a second key to that door is a duplicate, not a delegation |
| `use_video` | Turning your own camera on is not a privilege. Stopping someone else's is moderation, and lives with mute |
| `manage_games` | Consulted nowhere. Starting an activity on a hub needs no gate |
| `start_game` | Same |

## 5. What this needs that does not exist

- **A temporary ban.** The `bans` table (`migrations.rs:487`) has
  `target_public_key, banned_by, reason, created_at` and **no `expires_at`** —
  bans are permanent-only. `mutes` has the column, which is how a timeout is
  distinguished from a permanent mute. `moderation.ban.temporary` is a gate
  for behavior that has to be built: the column, expiry enforcement in the
  admission path, and the existing ban-list worker's view of it.
- **`voice.join` is a new gate.** Entering voice is gated by `messages.read`
  today (`ws/handlers/voice.rs:127`): the right to speak hangs off the right
  to read text. Splitting them is what "one permission per action" means, and
  it changes behavior — a voice-only channel becomes expressible, and every
  existing hub needs `voice.join` wherever `messages.read` was the intent.
  Decide before building: split, or keep the piggyback and document it.
- **The catalog endpoint and the derivation endpoint** (§1.5).
- **Validation in `create_role` / `update_role`** (§0). This one is
  independently useful and can land before anything else here.

## 6. Migration

Alpha, no backward compatibility ([ROADMAP](../ROADMAP.md)). The catalog is
rebuilt rather than mapped: drop the contents of `role_permissions` and
`channel_permission_overwrites`, reseed `builtin-everyone` and
`builtin-owner`, and reseed the bootstrap role templates with the new ids.
No old-to-new mapping table, and no dual-reading period.

`builtin-owner` loses its `admin` row and gains nothing in its place — its
power comes from `is_owner`.
