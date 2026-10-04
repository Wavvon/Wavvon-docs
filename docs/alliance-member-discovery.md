# Alliance member discovery: finding people on allied hubs

> **Proposal — not yet decided.** Drafted 2026-10-04 for
> [Wavvon-server#36](https://github.com/Wavvon/Wavvon-server/issues/36). Nothing
> here is settled until the user decides; no `decisions.md` entry exists yet.
> The open questions are at the end.

[alliances.md](alliances.md) makes an allied hub's *channels* reachable and its
*member hubs* browsable (`GET /alliances/{id}`). The people on those hubs have
no surface: nothing federates a user list, so meeting someone on an allied hub
means an invite token or already knowing they are there. This is the design for
that gap — **people, not hubs**.

## 0. Prerequisite: the roster is already open to any hub

Found while reading for this design, **not yet proved on real binaries**:
`GET /users` and `GET /users/{pk}/profile` (`hub/src/routes/users.rs`,
Wavvon-server) take any `AuthUser` and never look at who the caller is. A
federating peer gets an ordinary `scope = "member"` session — `/auth/verify`
exempts `is_hub=true` from the invite gate (`auth/handlers.rs`) — and **any key
may self-assert `is_hub`**. So a stranger hub, in no alliance at all, can page
through every member's name, avatar, presence and birthday today. Same shape as
the `alliancesplit` finding (root `CLAUDE.md`), one route family over.

That decides the order of work: an opt-in discovery surface is no privacy
boundary while the full roster sits behind a free key. **Step zero is refusing
peer sessions on `/users*`** (the federation client never calls them —
`federation/client.rs` uses `/channels`, `/alliances/*`, `/federation/*`),
proved by an `e2e-topology` stage run against the unfixed build first. The wider
question — whether a peer session should be its own allowlisted scope, as
`alliance_voice` is — is worth its own issue.

## 1. What "discover people" means

**Recommended:** a member on hub B can **browse and search the opted-in members
of one named allied hub A**, by display name, and open a DM. Not search across
the whole alliance at once, not "who is active in shared channels", not anyone
who did not say yes.

- *One hub at a time*, because each hub answers for its own members and nobody
  else's. Merging pages from N hubs with N cursors is the fan-out cost this
  slice declines (§10).
- *Browse as well as search*, because a small allied community is exactly where
  "who's over there?" is the question. Search-only does not stop a scraper (it
  iterates prefixes) and does annoy everyone else.
- *Not channel activity.* Someone who posts in a shared channel has already
  shown allies their name and pubkey through the messages, but a hub that
  computes "people active in #raids" is building an activity index nobody
  consented to. A client may still offer "message this author" from a message
  row it already has — no new endpoint, and §5 applies unchanged.

## 2. Consent: two switches, both off by default

| Switch | Who | Where it lives | Default |
|---|---|---|---|
| **People visible to this alliance** | alliance manager on A | `alliances` row on A (per alliance) | off |
| **Findable by allied hubs** | the member | A's `users` row (per hub) | off |

Both must be on for a member to appear. The member flag is **community-axis**,
not a prefs-blob entry: it is how you appear *in this community*, and A must
enforce it without your client present — same as `show_hubs`
([federation.md](federation.md)). It is one bool per hub rather than per
alliance, so a member is not asked to reason about alliances they cannot see;
the hub switch picks which alliances. Turning either off hides the member on
the next request — there is no copy elsewhere to recall (§4).

**Opt-in, not opt-out**, because the reach is new: allied hubs are chosen by an
admin, not by the member, and an opt-out default would publish every existing
member the day a hub upgrades.

## 3. What an allied hub may learn, and what it must never

Per listed member: **roster pubkey, master pubkey, display name, avatar.** The
master is what DM routing needs (§5); it is already public in the member's
designation. That is the whole entry.

Never served: presence, `last_seen_at`/`first_seen_at`, roles, badges, birthday,
pronouns or bio (the profile card stays a member-only read), favourite hubs,
which channels they read or post in, device list, the DM-block set, anything
about non-opted members including **their count**. And by the standing rule —
*a hub holds what you signed or encrypted, never what can reconstitute you*
([decisions.md](decisions.md), 2026-09-05) — nothing here moves key material,
prefs, or anything that is not already a profile field A holds.

## 4. Who serves what to whom

Read-through, owning hub authoritative — the shape of alliance messages and
forum §9 ([forum.md](forum.md)). **No replication**: A never pushes a list.

```
client (on B) ── GET /alliances/{id}/people?hub={A_pubkey}&q&limit&cursor ──▶ hub B
hub B ── same route, B's peer token, + viewer={client pubkey} ──▶ hub A
hub A ── array of entries ──▶ B ──▶ client
```

One route in `hub/src/routes/alliances/people.rs` (new, Wavvon-server), two
branches like `get_alliance_channel_messages`:

- **Remote** (`hub` ≠ self, caller is a local member of B): B checks its own
  alliance rows name A, then calls A. B rate-limits per viewer.
- **Local** (`hub` = self): answers from `users`. If the caller is a peer it
  must pass `require_alliance_visibility` for **this** alliance id
  (`alliances/models.rs`) **and** the hub switch must be on; otherwise **404**,
  as the existing alliance routes do, because whether the alliance or the
  surface exists is itself withheld. A peer asking with `hub` ≠ self is refused
  — no transitive proxying through A to C.

**Paging**: the server dialect — a bare array, `limit` and a keyset `cursor` on
`(display_name, public_key)`, the same order `/users` uses. `limit`/`cursor`
spelled out in the query struct (no `#[serde(flatten)]`), and the opt-in,
`is_member`, ban and designation filters (§5) **in the SQL before `LIMIT`**, so a
page is never short. `q` is capped like `/users`' search.

**`viewer`** is hub-vouched, like `display_name` in the voice grant: A cannot
verify it, only use it to subtract — a viewer banned on A, or on a
`block`-policy federated ban source, gets an empty array. It can never add
anyone.

## 5. Reaching a discovered person

**DM** is the action. Today B resolves a recipient's delivery hubs from its
*own* `home_hub_designations` and otherwise falls back to the stored
`hub_url` (`routes/dms/messages.rs`); for a stranger on A, B has neither, and a
DM dropped on A is invisible unless A is one of their home hubs.

So: **turning the member switch on also makes the client publish its
`HomeHubList` to A** (`PUT /identity/{master}/designation`, which A accepts —
the master is known there), and **A lists only members whose designation it
holds**. B's send path then fetches `{A}/identity/{master}/designation`
(public, master-signed, verified before use) when it has no local copy. That
remote fetch is the same piece [invite-directory.md](invite-directory.md) §3
needs; build it once. The member is told plainly that being findable means
allies can see where their DMs land.

**Friend request** stays what it is today: a one-sided add with `hub_url`. The
federated request flow is home-hub v3 ([home-hub.md](home-hub.md)); this does
not pull it forward.

## 6. Abuse

- **Scraping.** What can be scraped is what members opted to show allies —
  that is the consent, said honestly. Bounded by a per-viewer limiter on B and a
  per-peer-hub limiter on A, both in `hub/src/rate_limit.rs`; A's manager can
  turn the hub switch off or leave the alliance.
- **Harassment.** Blocks are enforced where they always were: the recipient's
  home hub drops a blocked sender's DM with a success-shaped reply
  ([block-mute-ignore.md](block-mute-ignore.md)). A cannot hide a member from
  the viewers they blocked — the block set is on the home hub, and B's word
  about the viewer is only advisory — so the listing does not pretend to. DM
  rate limits apply as usual.
- **Hostile allied hub.** It can ignore `viewer`, lie to its own clients, or
  scrape A's opted-in list. It cannot read non-opted members, forge entries
  (the designation is master-signed), or see who on A is online.

## 7. Degrading

Capability **`alliance.people`** in `hub/src/capabilities.rs`. The client gates
the affordance on **its own** hub advertising it, as alliance voice does, and
the member toggle on the hub it is set on. A without the route answers 404; B
returns `409 peer_unsupported` and the client says "this hub does not share its
member list", never an empty list that reads as "nobody is there".

## 8. Alternatives

- **A — opted-in listing, read-through, one hub at a time** (above).
  Recommended: no replication, consent at both ends, reuses the alliance
  visibility gate, the paging dialect and DM federation.
- **B — replicate member lists across the alliance.** Every hub pushes its
  roster; search is local and instant. Rejected: copies on every ally that
  outlive an opt-out or a departure, reconciliation on every rename, and the
  same reason forum federation rejected replication.
- **C — reuse the invite directory** ([invite-directory.md](invite-directory.md)).
  Zero new hub routes. Rejected as the answer: it is *public* to the world, and
  "findable by my allies" is a narrower consent people will give more readily.
  The two compose — a person can do both.
- **D — shared-channel authors only.** No consent problem, nothing new to
  serve. Kept as a free client affordance (§1), rejected as the feature: it
  finds the talkative and nobody else.

## 9. Smallest first slice

1. Step zero (§0), with its e2e stage.
2. The two switches, the local and remote branches of
   `GET /alliances/{id}/people`, `alliance.people`, `openapi.yaml`.
3. Remote designation fetch on DM send (§5).
4. Web client: a "People" tab on an allied hub's row in the alliance view,
   the member toggle in that hub's profile settings beside `show_hubs` (not
   the account-wide Privacy tab — the flag is per hub), in
   `clients/packages/ui`, and "Message" on an entry.
5. An `e2e-topology` stage with **three** hubs: a member of C in the alliance
   but not the one being asked is refused, and a non-opted member never
   appears.

## 10. Deferred

Alliance-wide search across all members; profile cards beyond name and avatar;
viewer-specific hiding on A; federated friend requests; desktop.

## Open questions for the user

1. Browse **and** search (recommended), or search-only with a minimum length?
2. Member switch per hub (recommended) or per alliance?
3. Should B pass `viewer` to A? It enables ban subtraction and per-viewer
   limits on A, at the cost of A learning who browses.
4. Include the master pubkey and require a designation on A (recommended), or
   list unreachable members too?
5. Step zero ships first, as its own bug fix — agreed?
