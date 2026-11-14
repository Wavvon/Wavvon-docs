# Future features

**On the list to build, not yet designed.** The intent is settled; the
thinking is not. An entry graduates to an **issue** once it has a design
someone could execute from.

This is the one work file left. Designed work and open bugs are issues on
[Wavvon-server](https://github.com/Wavvon/Wavvon-server/issues) and
[Wavvon-clients](https://github.com/Wavvon/Wavvon-clients/issues); ideas we
have not committed to are [Ideas
discussions](https://github.com/Wavvon/Wavvon-docs/discussions/categories/ideas).
It stays a file because most of what is below is not one piece of work — see
[decisions.md](decisions.md). Anything shipped is removed from here — see
[shipped-log.md](shipped-log.md) for history.

Three entries that were single, nameable pieces of work became `help wanted`
issues on 2026-09-16 and are no longer described here: alliance member
discovery, Android QR pairing, and passkey registration from desktop. What
stays below is what is not one piece of work — a set of small questions, a
backlog, or project work rather than a feature.

> See also: [farm-model.md](farm-model.md) (multi-hub server layer),
> [gaming.md](gaming.md), [apps.md](apps.md),
> [alliances.md](alliances.md).

---

## Hub menu — entries the reference clients have and this one does not

The gesture and the menu are both built: the chevron beside the hub name and a
right-click on the hub header open the same list — invite people, hub settings,
create channel, a notifications submenu, hide silenced channels, mark all as
read, and remove-from-this-device — with the admin-only entries gated on
permission. They render from one component since 2026-09-05, so an entry added
here appears under both gestures and cannot drift (they already had: same
items, different order).

What is left is which entries to add at all, each its own small question rather
than a given:

- **Create category** and **create event** — both exist elsewhere in the UI;
  the question is only whether the hub menu is a second door to them.
- **Per-hub profile** — Wavvon has hub profiles already
  ([client-parity.md](client-parity.md)); this would be a shortcut into the
  editor for the hub under the cursor.
- **Show all channels** — meaningful only once there is something hiding
  channels beyond `hide_silenced`.

None of it is blocking. Adding one is now a single edit in `HubMenuItems`
rather than two that have to agree.

## Desktop parity backlog

Named custom themes and LAN discovery UX (mDNS + QR). The measured list of
controls that reach only one client lives in
`clients/scripts/parity-baseline.json`, which is the one CI enforces. The whisper gaps, the `SoundboardPlayed` chip,
`hub_updated`/`channels_updated`/`member_updated`, the duplicate
channel-appearance modal and paired-device E2E (pairing Mechanism A) all
closed 2026-08-08. Details in [client-parity.md](client-parity.md).
**Desktop-only by definition** — deferred with desktop itself, and coupled to
the Windows code-signing blocker, which is an issue on
[Wavvon-clients](https://github.com/Wavvon/Wavvon-clients/issues).

## Project visibility push

Directory listings, launch post. Needed for adoption and for
the code-signing re-application ([code-signing.md](code-signing.md)). Not a
feature and not designed as a campaign.

## A client catalogue the admin panel picks from

A hub already serves a pinned third-party web client from a URL and hash
(decisions.md, "An operator chooses the web client a hub serves, from a pinned
download"). The intent is that an operator picks one from a list instead of
pasting a hash: client authors publish builds in the directory next to their
signed `.wavvonclient` listing, the admin panel shows them, and the hub downloads
and verifies the chosen one. Open questions: whether the listing carries the
hash or an author signature over each build, and how a hub follows an author’s
releases without auto-updating to code the operator never chose. Gated on a
third-party client existing to put in it.

---

> Demand-gated tails of shipped features live in their own docs, not here:
> forum federation ([forum.md](forum.md) §9 deferred list), gaming
> ([gaming.md](gaming.md)), LAN
> federation ([lan-mode.md](lan-mode.md) §6), farm follow-ups
> ([farm-model.md](farm-model.md)).

**Game launch / lobby federation across an alliance used to sit here and does
not belong** (removed 2026-09-14). A game is an app ([apps.md](apps.md)), and
cross-hub sessions are already ruled out: a mini-app session is scoped to one
hub and one channel ([mini-apps.md](mini-apps.md)), and a game session is
single-hub first ([gaming.md](gaming.md)). Underneath that, the multiplayer
lobby does not exist single-hub either — it is `gaming.md` "What's needed"
item 2, undesigned — so federating it was a plan for the tail of something
unbuilt. (Game-bot recommendation over an alliance was filed in the old
`apps.md` §11, which went with the bot docs on 2026-09-26; it is unclaimed.)
