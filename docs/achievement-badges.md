# Achievement badges: a catalogue, rules and programs

**Status**: design (2026-11-27), not built. Extends the badges in
[hub-certifications.md](hub-certifications.md#achievement-badges-shipped-2026-07-05),
which today are one-off: an admin types a label, an icon and a description
every time they grant one, to one person.

## What changes

A badge stops being free text on a single grant and becomes an **entry in the
hub's catalogue**: a name, an icon, a description, and **how it is earned**.
Granting a badge still issues the same signed badge cert as today, so a badge
earned here travels in the member's portfolio to every hub, verifiable and
revocable, with no change to the wire format of the cert itself.

Three ways to earn a badge:

1. **By hand**: someone holding `badges.manage` gives it to chosen members,
   several at once. This is today's feature with the label typed once.
2. **By rule**: the hub checks a condition periodically and grants the badge
   to whoever meets it.
3. **By a program**: a bot creates its own badges and gives them out, so a
   program can run a tournament or a game ladder with nobody supervising it.

## Rules

| Rule | Measured by the hub | Example |
|---|---|---|
| Membership age | time since joining | 1 week, 1 month, 1 year, 5 years |
| Presence | time connected | 100 hours online |
| Chat | messages sent, or days with at least one message | 1,000 messages; 100 active days |
| Voice | time in voice rooms | 50 hours in voice |
| Role held | time a role has been held without a break | Moderator for 2 months → "Senior Moderator" |

How much someone played with a bot is deliberately **not** a hub rule: the hub
does not know what a game, a round or a win is. The program that runs the game
knows, and grants the badge itself (below).

**Counting chat by days, not only by messages.** A message counter rewards
spam. The chat rule offers both measures, and the admin picks one per badge.

**Levels.** A badge can have thresholds: "Veteran" at 1 month, 1 year and 5
years. A member holds one badge at their highest level, not one badge per
threshold. Reaching a level revokes the previous level's cert and issues the
new one, so the portfolio shows one current badge.

**Kept or conditional.** Each rule badge says whether it is kept for good
("1 year in the hub" cannot be undone) or held only while the condition is
true ("Senior Moderator" goes when the role does). A conditional badge is
revoked through the existing revocation path the moment the worker sees the
condition fail.

**Retroactive.** A new rule badge applies to everyone who already qualifies.
The editor shows how many members would receive it before it is saved.

## Programs

A program holding the new `badges.programs` permission (granted by a role, as
every program permission is: [apps.md](apps.md#2-appsregister)) may:

- create badges in its own part of the catalogue, marked with the program's
  name wherever they show;
- grant and revoke those badges, and only those;
- not touch the hub's own badges or another program's.

Program badges are created only through the SDK, never from the admin's
"New badge" dialog. The hub knows for certain which program owns a badge and
made each grant, since the program authenticates with its own key; it cannot
know *why* a grant happened. So a program badge carries a "how to earn it"
text the program declares when creating it, shown as declared by the program,
apart from the hub's own rules, which the hub applies itself.

Limits keep a runaway bot from flooding the catalogue and every portfolio: a
cap on how many badges one program can define, and a rate limit on grants.
An admin can hide or delete any program badge; deleting one revokes its
grants.

This is the same thin-SDK line as everything else a program does: the SDK
exposes create, grant, revoke and list, and the program decides the rules of
its tournament.

## What the hub has to start keeping

- **Presence and voice time**: per member, a running total updated when a
  session or a voice stay ends. Neither is recorded today.
- **Role held since**: nothing new. `user_roles.assigned_at` already records
  when a member got a role; a role taken away and given back starts the
  clock again, which is what "without a break" means.
- **Chat counters**: messages and active days per member, maintained on send
  rather than counted over the message table on every check.

All of it is community-axis data the hub already sees as it happens; it only
starts adding it up. A member's profile shows badges, never the counters.

## The worker

The existing certificate worker (Wavvon-server: `crates/hub/src/cert_worker.rs`)
already runs on a timer and issues standing certs. Rule badges ride the same
tick: for each rule badge, find members who newly qualify (grant), who reached
a new level (revoke and reissue), and, for conditional badges, who no longer
qualify (revoke).

## Admin UI

The Certifications area's Badge tab becomes the catalogue: one card per badge
with its icon, name, how it is earned and how many members hold it, and a
"New badge" button. Opening a badge shows who holds it, with "Grant to…" for a
hand-granted badge. Program badges carry the program's name and can be hidden
or deleted. Design: the hub-settings canvas, page D.

## Open questions

- Whether a member can refuse a badge, beyond hiding it in their own profile
  as they already can.
- How a level change is announced, if at all (a system message, a toast to the
  member, nothing).
- Whether presence time should count while a member is set to invisible.
