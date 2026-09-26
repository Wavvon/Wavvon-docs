# The invite directory: listing an identity that wants to be found

**Status: designed, not built.** Replaces the bot listing the directory
carried until 2026-09-26, and is deliberately not a rename of it — the shape
changed with the model.

A hub publishes itself so people can find it. Nothing published the other
direction: an identity that wants to be invited somewhere had no way to say
so. That is the half this adds, and because [apps.md](apps.md) settled that a
program is a client like any other, it is **one list, not two**. A program
that wants to be added to hubs and a person who is open to invitations are
saying the same sentence — *find me and invite me* — and the directory should
not need to know which one is talking.

---

## 1. One listing, one document

The same shape as the client and skin listings already in the directory: a
signed document, kept whole in `payload`, with only the filtered fields
promoted to columns (`Wavvon-discovery: src/lib/signed-listing.ts`,
`src/lib/clients-db.ts`). Nothing new to build there.

```json
{
  "format": "wavvon.identity",
  "version": 1,
  "pubkey": "ed25519:…",
  "name": "Tallyman",
  "tagline": "Counts things so you do not have to",
  "description": "…markdown, 8 KB…",
  "kind": "program",
  "tags": ["moderation", "italian-speaking"],
  "languages": ["it", "en"],
  "contact": { "home_hub": "https://hub.example" },
  "app": {
    "commands": [{ "name": "tally", "description": "count the votes" }],
    "mini_app": true
  },
  "listed_at": 0,
  "signature": "…"
}
```

- **`kind`** is `"person"` or `"program"` and is **a tag the publisher
  chose**, never something the hub or the directory asserts. This is the one
  line in this document that must not drift: the moment `kind` becomes
  something anybody verifies, it is `is_bot` again — declared once, believed
  forever, and wrong about whoever it was wrong about
  ([decisions.md](decisions.md)). It exists so a human browsing can filter,
  and lying about it costs nothing and gains nothing, which is exactly why it
  is safe.
- **`app`** is present only when there is something to say: an identity
  running a program can advertise its commands the way `GET /apps` does on a
  hub. Absent for most people.
- The signature covers the document, verified against `pubkey` on submit —
  identical to how a client listing proves authorship today.

## 2. Consent is the act of publishing

Nobody appears here because a hub knows them. The only way in is to sign and
submit a document, and `DELETE` with a signature takes it out again.

Three things the form has to say plainly, because they are true and a person
listing themselves deserves to know before they click:

- The listing is **public**, and a public key beside a description is a
  correlation anybody can keep. The pubkey was already public; the
  description is new.
- Removal removes it **here**. Mirrors, caches and screenshots are not ours
  to recall.
- Naming a `contact.home_hub` tells the world where your DMs land. It is
  optional for that reason.

## 3. The open question: how the invite actually arrives

A listing that says "invite me" is only half a mechanism. An invite code is a
string, and the string has to reach the person.

**(a) A DM to the home hub.** The listing carries `contact.home_hub`; the
inviter's hub delivers through the federated DM outbox that already exists.
Cheapest by far, and it lands where the person already reads. Costs: it
publishes a home hub, and it opens a channel a stranger can write to — which
is what the listing asked for, but block lists and DM rate limits have to
cover the case where they change their mind.

**(b) Nothing: the listing is a profile, and contact happens elsewhere.** Zero
machinery. Honest, but then "invite me" is aspirational and the directory is
a noticeboard.

**(c) The directory holds pending invites for a pubkey and the client polls.**
Rejected as designed: the directory holds signed public documents and nothing
else, and an inbox is per-identity mutable state with a delivery guarantee
attached. It would also make the directory a participant in admission rather
than a place to look things up.

**Recommendation: (a), with (b) as the floor** — ship the listing first, add
the DM path once a pubkey-bound invite exists
([Wavvon-server#31](https://github.com/Wavvon/Wavvon-server/issues/31)), so
what arrives is an invite only that identity can redeem rather than a code
anybody could forward.

## 4. Filters

The same facet machinery the client listing uses: `kind`, `tags`,
`languages`, and free-text over name and tagline. A program looking for hubs
and a person looking for a community are the same query with a different
`kind`, which is the point of one list.

## 5. Abuse

- **Harvesting.** The list is public by construction; that is the feature.
  What it must never carry is anything the identity did not publish here —
  no hub memberships, no activity, no last-seen. A listing says what its
  author wanted said and nothing the network observed.
- **Spam, once (a) exists.** An invite DM is a DM: block lists apply, and the
  hub's DM rate limits apply. If that turns out insufficient, the lever is a
  per-listing "invites open / closed" flag the author controls, not a global
  one the directory enforces.
- **Impersonation.** The signature proves the pubkey signed it, and nothing
  else. A listing claiming to be someone famous is as true as its key —
  which is the same guarantee everywhere else in Wavvon.

## 6. Deferred

- Badges or reputation on a listing. Trust is one hop and viewer-decided
  ([hub-certifications.md](hub-certifications.md)); a directory-wide score is
  the central authority this project does not have.
- "Hubs looking for members" as a distinct surface — hubs already list
  themselves, and a `looking_for` tag on the hub listing would cover it if
  anyone asks.
- Any automatic listing of an identity, from a hub roster or anywhere else.
  The consent is the submission.
