# Alliances

Alliances are Wavvon's differentiator: named groups of hubs that share
channels, reactions, and (eventually) voice and games. A hub can be in
multiple alliances; users access alliance content through their home hub
without joining every member hub separately.

```
"WoW Alliance" = Hub A + Hub B
  Hub A shares #raids
  Hub B shares #guild-chat
  Users on Hub A see both. Users on Hub B see both.
```

## Tables

Defined in `hub/src/db/migrations.rs` (Wavvon-server):

- `alliances` — alliance id, name, creator, created_at. The `name` here
  is the **local label** this hub uses for the alliance; there is no
  canonical cross-hub name (see "Local labelling" below).
- `alliance_members` — alliance_id × hub_pubkey, with hub_name + hub_url
- `alliance_shared_channels` — alliance_id × channel_id (local channels
  the hub has chosen to share), plus `include_descendants BOOLEAN NOT
  NULL DEFAULT FALSE`. When true, the row shares not just that space but
  the whole tree beneath it (see "Recursive space sharing" below).
- `pending_alliance_invites` — alliance_id, from_hub_pubkey, from_hub_url,
  alliance_name (as labelled by the sender), optional message, invite
  token, created_at. Holds push-invite cards until the receiving admin
  accepts or declines.

## Routes

All in `hub/src/routes/alliances.rs` (Wavvon-server):

| Route                                                | Who      | Purpose                              |
|------------------------------------------------------|----------|--------------------------------------|
| `POST   /alliances`                                  | admin    | Create alliance                      |
| `GET    /alliances`                                  | any auth | List alliances this hub is in        |
| `GET    /alliances/:id`                              | any auth | Details + members                    |
| `POST   /alliances/:id/invite`                       | admin    | Generate signed invite token (pull)  |
| `POST   /alliances/:id/push-invite`                  | admin    | Push invite directly to a target hub |
| `GET    /alliances/pending-invites`                  | admin    | List pending push invites received   |
| `POST   /alliances/pending-invites/:id/accept`       | admin    | Accept a pending push invite         |
| `POST   /alliances/pending-invites/:id/decline`      | admin    | Decline a pending push invite        |
| `POST   /alliances/:id/join`                         | admin    | Use invite token to join (hub-to-hub)|
| `DELETE /alliances/:id/leave`                        | admin    | Leave alliance                       |
| `POST   /alliances/:id/channels`                     | admin    | Share a local space (see below)      |
| `DELETE /alliances/:id/channels/:ch_id`              | admin    | Unshare a space                      |
| `GET    /alliances/:id/channels`                     | any auth | Effective shared set (local + remote)|
| `GET    /alliances/:id/channels/:ch_id/messages`     | any auth | Read messages (local or via peer)    |
| `POST   /alliances/:id/channels/:ch_id/messages`     | sender   | Post (federated to owning hub)       |

## Join flow

```
Hub A creates alliance        →  alliance_id (local)
Hub A: POST .../invite        →  signed invite token
Hub A → Hub B (out of band: paste link, etc.)
Hub B: POST .../join          →  authenticates to Hub A,
                                  Hub A verifies invite,
                                  both hubs persist membership
```

Out-of-band delivery is intentional — it's the same trust model as
sharing a server invite link in any community tool.

## Push invite flow (additive)

The pull flow above stays. Push invites are useful when the inviting
admin already knows the target hub's URL.

```
Hub A admin: Settings → Alliances → pick alliance → Invite tab
             "Send invite directly" — enters Hub B's URL + optional note
Hub A: POST /alliances/:id/push-invite { target_url, message? }
Hub A → Hub B: POST /federation/alliance-invite
               { alliance_id, alliance_name (Hub A's local label),
                 from_hub_url, message?, invite_token (Hub A-signed) }
Hub B: row in pending_alliance_invites; admins see card in
       Settings → Alliance invites (Accept / Decline)
Accept → same POST /alliances/:id/join as the pull flow,
         reusing the stored invite_token
Decline → row deleted, no callback
```

The receiving hub **polls `/alliances/pending-invites` on mount** of
the Alliance invites tab — no WebSocket push for this. The volume
(admin-to-admin, rare) doesn't justify a new realtime channel.

### Federation endpoint is unauthenticated

`POST /federation/alliance-invite` accepts unauthenticated POSTs. The
trust comes from the **invite token** inside the payload, which is a
Hub-A-identity signature over the alliance id (same primitive as the
pull-flow token). Anyone can drop a card in Hub B's pending list, but
accepting it triggers the normal join path — the join only succeeds
if the token verifies against Hub A's pubkey. A fake push invite at
worst clutters the pending list; it cannot create membership.

### Local labelling

The `alliance_name` shipped in the push payload is **Hub A's local
label** for the alliance. Hub B may store its own label after accept
and is never forced to adopt Hub A's. This matches the sovereignty
rule already implicit in the schema (`alliances.name` is per-hub) and
keeps the design symmetric with the pull flow, where Hub B picks the
name it stores at join time.

## Reading remote alliance messages

When Hub B fetches messages for an alliance channel that's owned by Hub A,
Hub B's `get_alliance_channel_messages` calls Hub A's federation endpoint
and caches results. For local channels, it loads from SQLite directly.
**Reactions are loaded in both branches** via
`messages::load_reactions` (the helper was made `pub(crate)` for this).

## Recursive space sharing

Sharing extends beyond text/forum leaves: **any space type** is
shareable, and sharing a container shares the tree beneath it. "Space"
is the same nested unit as in
[nested-channels-ux.md](nested-channels-ux.md): banner / channel /
category / forum, and spaces nest.

**Sharing.** `POST /alliances/:id/channels` accepts an optional
`include_descendants` (defaults false). Clients send `true` when
sharing a category, so the whole subtree comes along. Sharing a single
leaf leaves it false.

**Effective set (computed at read time).** The effective shared set is
`explicit shares ∪ all descendants of include_descendants shares`,
resolved on each `GET` via a recursive CTE, depth-guarded at 32. This
gives **live semantics**:

- a sub-channel created after a category was shared is automatically
  shared;
- unsharing the root removes the whole subtree;
- a channel moved out of a shared category stops being shared.

No per-descendant rows are materialized — see
[decisions.md](decisions.md) (2026-07-05).

**Response shape.** `GET /alliances/:id/channels` entries gain:

- `channel_type` — `"text"` | `"forum"` | `"banner"` | `"spawner"`;
- `parent_id` — null unless the parent is **itself in the shared set**,
  so entries always form well-rooted trees;
- `is_category` — whether the entry is a container.

Old peers omit these fields; responses parse via serde defaults
(`channel_type` `"text"`, `parent_id` null, `is_category` false), so
the change is wire-compatible with un-upgraded alliance members.

**Message endpoints** resolve against the effective set (descendants
included). `POST` to a banner / category / spawner returns **400**;
`GET` on those returns an empty list.

**Client.** The web client (Wavvon-web) renders the shared tree in the
sidebar — categories as non-clickable folders, text/forum clickable,
banner/spawner dimmed — and now wires alliance channel open/post
(previously stubbed).

## What's not done

- **Voice in alliance channels** — the UDP relay is single-hub; cross-hub
  voice needs a relay redesign.
- **Forum post federation** — forum posts/replies stay hub-local even on
  an alliance-shared forum channel; federating them is undesigned.
- **Member discovery beyond invite tokens** — no way to browse an
  alliance's membership; joining is still invite-driven.
- Game launch/lobby federation across alliance

See [ROADMAP](../ROADMAP.md) and [future-features.md](future-features.md).
