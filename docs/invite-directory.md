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
  // …or, for something that runs a server of its own:
  // "contact": { "endpoint": "https://tallyman.example/invites" },
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
- **`contact`** carries exactly one of `home_hub` or `endpoint`, and one of
  them is **required** — see §3. A listing nobody can reach is a listing that
  wastes the time of whoever tries.
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
- Naming a `contact.home_hub` tells the world where your DMs land — **and
  where the rest of them land too**: the designation at
  `GET /identity/{master}/designation` is public on that hub, so one URL
  discloses the whole signed list. There is no partial disclosure to offer;
  the choice is the list or the other route.

## 3. How the invite arrives: one of two routes, and one is required

A listing that says "invite me" is only half a mechanism — an invite code is a
string, and the string has to reach somebody. The directory cannot resolve a
pubkey to a location: DM delivery today reads `home_hub_designations` from
the *sending* hub's own database (`dms/messages.rs`), which works because the
two already share a hub. A stranger from a listing shares nothing, and there
is no global lookup by design.

So the listing carries the route, and **a submission without one is
rejected**. Two are allowed, and between them they cover who is listing:

**A person has a home hub.** `contact.home_hub` is a pointer, not a list: the
inviter's hub fetches `GET /identity/{master}/designation` from it — public,
unauthenticated — and delivers to every URL in the signed list through the
federated DM outbox that already exists. It lands where the person already
reads.

**A program has a server.** `contact.endpoint` is an https URL that takes a
POST. This is the webhook it already runs for slash commands, so the hub is
reusing the dispatch client it already has, and the program **needs no hub at
all to be reachable**: a keypair, an endpoint and a listing are enough to be
found, invited and bootstrapped from zero. Nobody has to stand up a hub to
host a program.

Three rules the POST path needs, none of them new machinery:

- **The POST is a hint, not an authorization.** Anyone can knock on a public
  URL claiming to be a hub. The program treats it as untrusted — *hub X says
  you are invited with code Y* — and decides whether to try. The authority is
  in the code, and a forged POST costs one wasted join attempt.
- **Same URL rule as an app webhook**: https only, no private or loopback
  range in production. A hub POSTing to a URL it read out of a public
  document is an SSRF surface otherwise, and the validation already exists.
- **The invite still has to be redeemed.** On a hub with `challenge_mode` on,
  a program cannot pass the admission puzzle — the directory makes it
  findable, admission is still the bottleneck
  ([future-features.md](future-features.md),
  [Wavvon-server#31](https://github.com/Wavvon/Wavvon-server/issues/31)).

**Rejected: a mailbox on the directory.** Holding pending invites for a pubkey
— even sealed to a key the directory cannot read — is per-identity mutable
state, a write surface for anyone, and it makes the directory a participant in
admission rather than a place to look things up. With both routes above
covering a person and a program, what is left over is an identity that wants
to be found but not reached, and that one does not get listed.

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
- **Spam.** An invite DM is a DM: block lists and the hub's DM rate limits
  apply. An invite POST lands on a URL its owner published and can stop
  serving. If either turns out insufficient, the lever is the author deleting
  the listing or switching route, not a global control the directory
  enforces.
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
