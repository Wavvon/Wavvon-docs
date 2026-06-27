# Hub Certifications

**Status**: design committed, not built. Anti-spam **Layer 2** — the
reputation layer that sits on top of the proof-of-work layer
([future-features.md](future-features.md) "Anti-spam"). Layer 1 (PoW)
has primitives in `identity/src/pow.rs` (Wavvon-server) and is enforced
through the lobby ([lobby-bot-survey.md](lobby-bot-survey.md)).

A **certification** is a signed statement by a hub about a user:
*"this user has been a member in good standing since date Y."* Anyone
can verify it against the issuing hub's published pubkey. Users collect
certs from the hubs they belong to — a **reputation portfolio** — and
present them to new hubs, which can require a cert from a trusted hub
before letting a fresh key in. This is the cross-hub answer to "you're
new everywhere even though you're trusted somewhere."

## Certifications vs. badges — one primitive, two subjects

Wavvon has exactly one portable-attestation primitive: an Ed25519
signature over a canonical JSON payload, verified locally against a
published pubkey. It already has two subjects:

| | **Badge** ([server-tags.md](server-tags.md)) | **Certification** (this doc) |
|---|---|---|
| Issuer | A hub | A hub |
| Subject | **Another hub** | **A user** |
| Claim | "I vouch for that hub" | "this user is a member in good standing since Y" |
| Signer key | Hub identity key (`hub_identity.json`) | Same hub identity key |
| `subject_kind` | `"hub"` | `"user"` |
| Carried by | Subject hub, served on its `/info` | The user, in their identity portfolio |
| Verified by | Anyone, against issuer `/info` pubkey | Anyone, against issuer `/info` pubkey |

server-tags.md established the shared signer for the hub-subject case
and explicitly deferred the user-subject case to "the
future-features.md anti-spam Layer 2." This doc is that case. The two
must not be conflated: a badge says "hub A trusts hub B"; a cert says
"hub A has hosted user U well." They share `hub/src/federation/`
signing code and nothing else.

> The shared signer lives in `hub/src/federation/` (Wavvon-server) with
> a `subject_kind: "hub" | "user"` discriminant, exactly as
> server-tags.md "Relationship to user certifications" specifies.

## 1 — Certification shape

The issuing hub signs, with its **hub identity key** (the same key that
signs directory listings, federation payloads, and badges):

```
CertPayload {
  subject_kind:   "user",                // discriminates from badges
  issuer_pubkey:  Ed25519PublicKey,      // hex, the hub's identity key
  issuer_url:     String,                // the hub's URL (convenience)
  subject_pubkey: Ed25519PublicKey,      // hex, the user's MASTER pubkey
  member_since:   u64,                   // unix seconds, first-joined date
  standing:       "good" | "revoked",    // statement of standing
  pow_level:      Option<u8>,            // highest PoW level the hub verified
  issued_at:      u64,                   // unix seconds
  expires_at:     u64,                   // unix seconds (never null — see §7)
  capabilities:   Vec<String>,           // optional hints, e.g. ["voice","verified-human"]
}

Certification {
  payload:   CertPayload,
  signature: Ed25519Signature,           // issuer hub sig over canonical(payload)
}
```

Key points:

- **`subject_pubkey` is the user's master pubkey, not a device
  subkey.** A cert is about the *identity*, so it must survive device
  rotation. This is the master+subkey model
  ([multi-device.md](multi-device.md)): subkeys come and go, the master
  is the durable identity. Legacy single-key identities use their one
  key as `subject_pubkey` — it is their "subkey 0" and also their
  master, so the cert is valid before and after migration with no
  re-issue.
- **`member_since` is the standing claim's anchor.** The hub is
  asserting continuous membership in good standing since that date.
  Account age alone is weak ([future-features.md](future-features.md)),
  but age *attested by a hub that observed the behaviour* is meaningful.
- **`pow_level` is the portable-PoW vehicle** (§8). It records the
  highest level this hub verified for the user, so a new hub can trust
  that level without recomputation.
- **`capabilities` are advisory hints**, never authority. A receiving
  hub MAY read them (e.g. "this user passed a human-challenge here") but
  must never treat them as a grant. Same posture as a game manifest's
  requested capabilities ([decisions.md](decisions.md) gaming) — request
  vs. grant.
- The signature is over the **canonical (deterministic) serialisation**
  of the payload — the same convention as the directory listing
  signature, the badge signature, and farm session tokens. One signing
  shape across the whole protocol.

## 2 — Issuance — when a hub issues a cert

**Default: automatic on a standing threshold, admin-tunable.** A hub
issues (and renews) a cert for a member when **all** hold:

1. The member has existed for at least `cert_min_age_days` (hub
   setting, default 30).
2. The member is not banned, not muted, `approval_status = 'approved'`,
   and `standing = 'good'`.
3. The member has logged in at least once since issuance window opened
   (avoids certifying abandoned keys).

Issuance is a periodic sweep (a cheap job alongside the existing
DM-worker pattern) plus an on-demand mint when a member asks via the
client. An admin can also **manually issue** a cert to any member
ahead of the age threshold (e.g. a known person), and can set the
hub's auto-issue policy off entirely for invite-only communities that
prefer to vouch by hand.

Why auto-with-threshold rather than the alternatives:

- **Manual-only** is too much admin toil for the common case and means
  most legitimate members never get a cert, so the portfolio stays
  empty and the feature does nothing.
- **PoW-level-triggered only** conflates two different signals — PoW
  proves CPU was burned, a cert proves a *hub observed behaviour over
  time*. We carry PoW level *inside* the cert (§8) rather than gating
  issuance on it. A hub can still set `cert_min_pow_level` if it wants
  to refuse certifying low-PoW members, but that is opt-in.
- **Auto on N days of good standing** is the right default: it is the
  exact claim the cert makes, it needs zero admin attention, and a hub
  that wants tighter control turns auto-issue off and issues by hand.

The hub-side trigger reuses the same standing data moderation already
maintains (bans, mutes, approval status) — no new behaviour tracking is
invented.

## 3 — Storage

Two sides, mirroring the badge model's "issuer records, subject
carries."

**On the user side — the home hub list** (not client-only
`identity.json`). Certs are personal-axis identity-bearing state, the
same category as subkey certs and revocations
([home-hub.md](home-hub.md) device registry). They live in the home hub
list so that:

- every paired device sees the same portfolio (multi-device);
- the portfolio survives a device wipe (it is not trapped in one
  device's `identity.json`);
- it is served with the same write-to-all / read-from-any replication
  the home hub list already provides.

Unlike subkey certs, a hub certification is signed by the **issuing
hub's** key, not the user's master. The home hub stores it as an opaque
verifiable blob; it cannot forge one (it lacks the issuer's key) and a
consumer verifies against the issuer, not the home hub. The client also
keeps a local cache in `identity.json` for offline presentation and
fast auth, but the home hub list is canonical.

**On the issuing hub side — a `cert_issuances` row.** The hub records
what it issued so it can renew, expire, and revoke: `(subject_pubkey,
issued_at, expires_at, standing, signature)`. This is community-axis
state about that hub's own members — it stays on the community hub,
never on the user's home hub list. (Two-axis rule: the *issuance record*
is about the hub-member relationship; the *cert blob* the user holds is
about the user. The blob goes to the home hub list; the issuance ledger
stays on the issuer.)

## 4 — Presentation

**Both push-at-auth and pull-by-pubkey**, so a receiving hub can use
whichever fits:

- **In the auth payload.** When a hub advertises a cert requirement
  (via `/info`, §6), the client includes the relevant certs in the
  `/auth/verify` body as a `certifications: Certification[]` array. This
  is the low-latency path — the hub already has what it needs to admit
  the user in one round-trip, no callback.
- **Pull by pubkey.** A receiving hub (or anyone) can fetch a user's
  portfolio from any hub in the user's home hub list at
  `GET /identity/:master_pubkey/certs`. This is how a hub that wants to
  *re-check* a cert, or that received a thin auth payload, gets the full
  set.

The client decides *which* certs to present: it sends the ones that
satisfy the target hub's advertised requirement, not the whole
portfolio, to avoid leaking the user's full membership list to every
hub they join. (Presenting a cert reveals "I am a good-standing member
of hub X" — a privacy cost the user opts into per-join by virtue of what
the target requires.)

## 5 — Verification

A receiving hub verifies a presented cert by:

1. **Signature** — verify `signature` over `canonical(payload)` against
   `payload.issuer_pubkey`. This proves the cert is authentic without
   contacting the issuer.
2. **Issuer identity** — confirm `issuer_pubkey` actually belongs to a
   hub at `issuer_url` by checking it against the issuer's `GET /info`
   `hub_pubkey` field. **Cached, not live per-auth**: the hub keeps a
   short-TTL cache (e.g. 6 h) of `issuer_url → hub_pubkey` so a flood of
   joins doesn't hammer the issuer. A cache miss does one live `/info`
   fetch. The signature is the real authority; the `/info` check only
   binds pubkey↔URL for display and trust-list matching (§6).
3. **Subject binding** — confirm `subject_pubkey` equals the master
   pubkey the user is authenticating as (from the subkey cert in the
   auth handshake, [multi-device.md](multi-device.md)). A cert cannot be
   lifted onto another identity.
4. **Expiry** — reject if `now > expires_at`. Certs always expire (§7).
5. **Standing** — reject if `payload.standing != "good"`.
6. **Trust** — confirm the issuer is on the hub's configured trust list
   or satisfies a property rule (§6). A valid cert from a hub the
   receiver doesn't trust is informational, not admitting.

The client ships with **no built-in trust roots** — there is no
Wavvon-blessed certifier, same stance as badges. Trust is entirely the
receiving hub admin's configuration.

## 6 — Hub requirements — how an admin configures "require a cert"

A new hub-admission gate, expressed in `hub_settings` and advertised on
`/info` so the client knows what to present before authenticating. Two
rule shapes, combinable:

- **Trusted-issuer list** — `cert_trusted_issuers`: a JSON array of
  `{ pubkey, url, label }`. "Admit if the user presents a valid cert
  from any of these hubs." This is the explicit, sovereign choice — the
  admin names hubs they trust.
- **Property rule** — `cert_require`: a small predicate such as
  `{ min_pow_level: 15 }` or `{ min_member_since_days: 90 }`. "Admit if
  the user presents *any* valid cert (from any issuer) whose `pow_level
  ≥ 15`" or whose `member_since` is at least 90 days ago. This lets a
  hub accept reputation it can't enumerate by name.

The two combine with an admin-chosen mode (`cert_mode`): `off` (today's
behaviour), `any` (satisfy either rule), or `all` (must satisfy the
trusted-issuer list). The gate composes with the existing
`min_security_level` lobby: a hub can require *both* a cert *and* a PoW
level, or accept a cert's carried `pow_level` in lieu of local
computation (§8).

There is deliberately **no global "PoW level ≥ 15 from any trusted hub
network-wide" property** — that is web-of-trust, which we reject (§10).
A property rule is satisfied by *any* validly-signed cert; the admin who
wants issuer restriction uses the trusted-issuer list. Composing
"property rule" + "trusted-issuer list" gives "PoW ≥ 15 from a hub I
named" without any global trust graph.

`/info` advertises the requirement as
`cert_requirement: { mode, trusted_issuers: [{pubkey,url,label}],
require: {...} } | null` so the client can pre-select which certs to
present and can show the user "this hub needs a cert from X" before they
try to join.

## 7 — Revocation

Certs **always carry an expiry** (`expires_at`, never null), default 90
days, renewed automatically by the issuing hub's sweep while the member
stays in good standing. Expiry is the primary revocation tool — the same
posture as badges and farm tokens: a signed blob can't be un-signed, so
short-lived-and-renewed beats a global revocation registry.

For *early* retraction (a member who turned bad before their cert
expires), two paths, both honoured, neither requiring global
coordination:

1. **Re-issue with `standing: "revoked"`.** The hub mints a new cert
   for the same `subject_pubkey` with `standing = "revoked"` and a fresh
   `issued_at`. A careful verifier that pulls the user's portfolio sees
   the newer revoked cert (higher `issued_at` for the same issuer wins)
   and rejects. This works on the *pull* path.
2. **Issuer revoke-check endpoint** — `GET /certs/revocations` on the
   issuing hub, listing revoked `(subject_pubkey, issued_at)` pairs a
   careful receiving hub MAY poll, with a short TTL cache. Same opt-in
   shape as the badge `/federation/badge-revocations` endpoint. This
   closes the *push-at-auth* gap, where the user simply wouldn't present
   a revoked cert.

v1 relies on **expiry + re-issue-as-revoked on pull**. The polled
revoke-check endpoint is deferred until early retraction before expiry
is a demonstrated need — identical to the badge decision.

## 8 — Cross-hub portable PoW credit

This is the concrete payoff that
[lobby-bot-survey.md](lobby-bot-survey.md) and
[decisions.md](decisions.md) ("Hub-issued partial-PoW credit
transferable across hubs" — rejected for the lobby, folded into here)
deferred to this design.

PoW is expensive by design — level 23 is ~30 min of CPU. Re-computing it
for every hub a user joins is hostile to legitimate users while barely
slowing a bot farm (which automates joins anyway). A certification
carries the issuer's *verified* `pow_level`, letting a new hub trust
that work without re-running it:

1. User computes PoW once and reaches, say, level 20 on hub A. Hub A
   verifies the proof (one hash check) and records `pow_level: 20` in
   the cert it issues.
2. User joins hub B, which has `cert_require: { min_pow_level: 15 }` and
   trusts hub A (or accepts the property rule). The client presents hub
   A's cert.
3. Hub B verifies the cert (signature + issuer + subject + expiry),
   reads `pow_level: 20 ≥ 15`, and admits the user **without** issuing
   any PoW work or sending them to the lobby.

This is *credit*, not *transfer* — hub B trusts hub A's assertion
because hub B's admin chose to (trusted-issuer list) or chose to accept
any signed assertion of that level (property rule). A hub that doesn't
trust anyone simply leaves `cert_require` unset and computes PoW locally
as before. No global PoW ledger, no coordination — the trust decision is
local to hub B, exactly as the sovereignty pillar demands.

Note the asymmetry the cert makes safe: a bot *could* burn PoW once and
get a level-20 cert, but to get a *good-standing* cert it must also
survive `cert_min_age_days` of not-being-banned on a real hub — the
behavioural cost PoW alone can't impose. The two layers compose: PoW
gates the cheap-key flood, the standing claim gates the patient-bot
case.

## 9 — Data model & route changes (all Wavvon-server unless noted)

**Shared signer** (`hub/src/federation/`):
- Extend the badge signer with the `subject_kind: "user"` arm and the
  `CertPayload` shape. One canonical-serialisation + sign + verify path
  for both subjects.

**Issuing hub DB** (`hub/src/db/migrations.rs`):
- New `cert_issuances` table: `subject_pubkey`, `issued_at`,
  `expires_at`, `standing`, `pow_level`, `signature`. Indexed on
  `subject_pubkey`. The issuer's ledger of what it signed.
- New `cert_revocations` table (for the deferred revoke-check):
  `subject_pubkey`, `issued_at`, `revoked_at`.
- New `hub_settings` rows: `cert_auto_issue` (bool, default `1`),
  `cert_min_age_days` (default `30`), `cert_validity_days`
  (default `90`), `cert_min_pow_level` (nullable), and the admission
  side `cert_mode` (`off`/`any`/`all`, default `off`),
  `cert_trusted_issuers` (JSON), `cert_require` (JSON).

**Home hub DB** (`hub/src/routes/identity.rs`, the home-hub identity
store from [home-hub.md](home-hub.md)):
- New `user_certs` table: the portfolio. `master_pubkey`,
  `issuer_pubkey`, `issuer_url`, `payload_json`, `signature`,
  `expires_at`. Replicated write-to-all / read-from-any like the device
  registry. The home hub never forges these — it stores opaque
  issuer-signed blobs.

**Issuing-hub routes**:
- `GET /certs/me` (auth required) — the user's cert from *this* hub,
  minting on demand if eligible and not yet issued.
- `POST /admin/certs/issue` (admin) — manual issue / pre-threshold
  vouch for a named member.
- `POST /admin/certs/revoke` (admin) — re-issue as `standing:"revoked"`
  and append to `cert_revocations`.
- `GET /certs/revocations` — deferred (§10), the opt-in poll target.
- Issuance sweep: a periodic job (DM-worker-pattern) that mints/renews
  certs for eligible members.

**Home-hub routes**:
- `GET /identity/:master_pubkey/certs` — the public pull endpoint
  returning the portfolio (array of `{ payload, signature }`).
- `PUT /identity/:master_pubkey/certs` (auth: subkey + cert) — the
  client deposits a freshly-minted cert into the portfolio,
  write-to-all across the home hub list.

**Receiving-hub auth** (`hub/src/auth/handlers.rs`,
`hub/src/auth/middleware.rs`):
- `/auth/verify` accepts an optional `certifications: Certification[]`.
- When `cert_mode != off`, the handler verifies presented certs (§5)
  and, on success, may skip lobby placement / accept the carried
  `pow_level`. On failure with a hard requirement, returns the same
  lobby/refusal path the PoW gate uses.
- `GET /info` (`routes/health.rs`) gains `cert_requirement` (§6) so the
  client knows what to present pre-auth.

**Client** (`Wavvon-desktop`, mirrored `Wavvon-web` / `Wavvon-android`):
- `desktop/src-tauri/src/lib.rs` — store/cache the portfolio in
  `identity.json`; fetch-and-deposit on the home hub list.
- Tauri commands: `fetch_my_cert(hub_url)`, `list_my_certs()`,
  `present_certs_for(hub_url)` (selects the subset satisfying that
  hub's advertised `cert_requirement`).
- UI: a "Reputation" section in Settings showing the portfolio (issuer,
  member-since, PoW level, expiry); the Add-Hub flow shows "this hub
  needs a cert from X / a cert with PoW ≥ N" and auto-attaches matching
  certs; admin Hub Settings → "Certifications" tab (auto-issue toggle,
  thresholds, trusted-issuer list editor, property-rule editor).

## 10 — What's deferred

- **Web of trust / transitivity** ("trust whoever hub A trusts"). Out,
  same verdict as badge transitivity. Trust stays one hop, receiving-
  admin-decided. A property rule satisfied by any signed cert plus an
  explicit trusted-issuer list covers the real needs without a global
  trust graph.
- **Issuer revoke-check polling** (`GET /certs/revocations` as a live
  poll target). v1 leans on expiry + re-issue-as-revoked on the pull
  path. Build the poll only if early retraction before expiry becomes a
  real need — same posture as the badge revoke-check.
- **Cross-farm cert relay** — a farm vouching for users across its hubs,
  or relaying certs between farms. The farm already unifies identity
  within itself ([farm-impl.md](farm-impl.md) — identity-axis routes
  move to the farm), so a farm-issued cert is a natural later extension;
  cross-*farm* relay reintroduces multi-authority coordination and waits
  until farms are stable.
- **Negative reputation / shared ban lists.** A cert asserts *good*
  standing; a network-wide "this user is bad" list is a different, more
  dangerous primitive (censorship-prone, no due process) and is
  explicitly out of this design.
- **Certs as a discovery / ranking signal** on `Wavvon-discovery`.
  Ranking hubs by how many users they've certified invites gaming — the
  same unsolved anti-gaming problem flagged for the gaming catalog and
  monetization paid-placement. Out until ranking is designed.
- **Capability certs as grants.** `capabilities` stay advisory hints in
  v1. Treating a carried capability as an actual permission grant on the
  receiving hub is a larger trust design and is deferred.
- **Per-device cert presentation policy.** All a user's devices present
  the same portfolio in v1; a "this device only presents cert X" policy
  layers onto the subkey cert later, same as the deferred per-device
  permissions in [multi-device.md](multi-device.md).
