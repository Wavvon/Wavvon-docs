# Admitting one named key: the pubkey-bound invite

**Status: designed, not built.**
[Wavvon-server#31](https://github.com/Wavvon/Wavvon-server/issues/31).

Two things are missing, and they turn out to be the same missing thing.

**"Only this one may come in" is approximate.** An admin who wants to admit
one specific key — a program they are adding, a person whose key they already
have — mints an invite and sends the code. Invites are **bearer** codes:
whoever holds the string may use it. The promise the admin thinks they are
making is not the one the hub enforces.

**An unattended client cannot get in at all.** With `challenge_mode` set to
anything but `off`, `/auth/verify` requires a challenge token, and earning one
means solving a click or an SVG puzzle ([lobby-survey.md](lobby-survey.md)).
That gate runs *after* the invite gate and applies to everyone holding an
invite or not, so a program with a perfectly good code still cannot join. This
is the hole left open on purpose when the bot distinction was deleted
([decisions.md](decisions.md), "A bot is a client like any other"), recorded
there rather than papered over.

An invite that **names the key it admits** closes both. The first because that
is what it means; the second because an admin minting one is already the human
act the challenge is trying to ask about.

---

## 1. The shape: a column, not a table

`invites` gains one nullable column:

```sql
bound_pubkey TEXT   -- NULL: a bearer code, exactly as today
```

Everything else already exists. `max_uses = 1` makes it single-use,
`expires_at` bounds it, `grant_role_id` carries the role. An invite that names
its recipient is an invite, not a second kind of object — the moment it
becomes its own route family it is the second admission path that 0.6.0 spent
−7,600 lines deleting.

## 2. Redemption, and which key counts

`validate_and_use_invite` takes the joining key as well as the code. When
`bound_pubkey` is NULL nothing changes. When it is set, the join is refused
unless it matches.

**Matches what, exactly** is the one subtle part. The admin binds to whatever
key they were handed, and that is not always the key that shows up:

- a program has one keypair, and presents it directly;
- a person may arrive on a **paired device**, whose roster pubkey is a subkey,
  resolving to a canonical identity that is a third value;
- a key copied out of an [invite-directory](invite-directory.md) listing is
  the **master** pubkey.

So a bound invite is redeemable by any of the three the request resolves to —
the presented key, the canonical identity, or the master named by the
presented cert. `resolve_canonical_identity` already computes all three before
the invite gate runs, so this costs a comparison and no new lookup. Binding to
only one of them would refuse a legitimate holder for a reason nobody could
see, which is the failure shape this repo keeps finding.

Refusal is its own message — *this invite was issued to a different key* —
rather than reusing "invalid code". The code is high-entropy and the existing
path already distinguishes invalid from expired from used-up; an operator
debugging a program that will not join deserves the real answer.

## 3. The challenge exemption, and why it is not `is_bot` again

**Redeeming a pubkey-bound invite satisfies the admission challenge.**

The challenge exists to ask one question: did a human do something a script
cannot do cheaply at scale? An admin opening their hub settings, pasting one
public key and minting one single-use invite for it **is** that act — done by
the person who runs the hub, aimed at exactly one key, and consumed on use.
Asking the recipient to also identify a pattern in an SVG does not add an
answer; it just excludes recipients who have no eyes on them.

This is the line that has to hold, because the last thing shaped like it was
`is_bot`:

> The exemption belongs to **the invite**, not to the identity. It is a row an
> admin wrote, naming one key, with an expiry, consumed once. After redemption
> the invite is used up and the member is an ordinary member with ordinary
> roles. Nothing on the user says "this one skips the puzzle", so there is
> nothing to drift, nothing to be believed forever, and nothing a later read
> can be wrong about.

That is the whole difference, and it is worth restating in the code: `is_bot`
was a *declaration about an identity*; this is a *record of an act*, spent
when used.

**A bearer invite does not get the exemption.** Only a bound one. A bulk code
leaking is exactly the case the puzzle is still there for, and an exemption
that rode on any invite would hand the hub's front door to whoever reposted
the link.

Mechanically the invite gate has to tell the challenge gate what happened —
it currently returns `(created_by, grant_role_id)` and the challenge check
below it reads no state at all. One more value out of the same call.

## 4. Delivery is already designed

Getting the code to its recipient is [invite-directory.md](invite-directory.md)
§3, unchanged: a person's listing names a home hub and the invite arrives as a
federated DM; a program's names an https endpoint and the hub POSTs to it with
the dispatch client it already runs for app webhooks. That document's closing
caveat — *the invite still has to be redeemed, and a program cannot pass the
admission puzzle* — is what this one removes.

A pubkey-bound invite is also the **better** thing to send down either route,
since both routes are public: the POST is explicitly untrusted, anyone can
read a listing, and a bearer code in transit is a code anybody who sees it can
spend.

## 5. Surface

- `POST /invites` accepts an optional `bound_pubkey`. With it set,
  `max_uses` is forced to 1 — a named invite for several people is a
  contradiction, and silently honouring a larger number would be the worse
  reading.
- `GET /invites` returns it, so the admin screen can say who an invite is for
  rather than showing a code with no owner.
- Capability string **`invites.bound`**, in the same commit as the feature.
  A client decides whether to offer the field by testing membership; a hub too
  old to understand `bound_pubkey` would otherwise mint a bearer code while
  the admin believed they had named someone. Dotted segments only, no
  underscore — `capabilities.rs` has a test that says so, and it caught the
  first spelling of this one.
- The admin UI is the existing *Create invite* row with one optional field.
  One flow for admitting anybody — the program case is just the one where the
  recipient happens to be a process.

## 6. Rejected

**A `/admissions` route family of its own.** This is what `POST /bots` was,
and the review that deleted it is the reason this document exists. One
admission path.

**Exempting every invite holder from the challenge.** See §3 — a leaked bulk
code would take the gate with it.

**A per-user "may skip the challenge" flag.** That is `is_bot` with a new
spelling: a declaration about an identity that outlives the act and gets
believed by every later read.

**Binding to the master pubkey only.** It reads tidier and it refuses a person
invited by the roster key an admin could actually see.

## 7. Open

- **Whether a bound invite may ever be multi-use.** §5 forces 1. A program
  that is redeployed and loses its session re-authenticates with the same
  keypair and is already a member, so the case for more than one use has not
  appeared yet; if it does, it is `max_uses` with the binding kept.
- **Pruning.** A bound invite that is never redeemed sits in `invites`
  forever, like every other expired code. Out of scope here, and the same
  question as the stale rows in
  [Wavvon-server#64](https://github.com/Wavvon/Wavvon-server/issues/64).
