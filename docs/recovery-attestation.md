# Recovery-contact attestation collection

**Status**: **SHIPPED 2026-07-20** — server `4240377`, clients `cf6b39d`
(shipped log). Completed Part 2 phase 3 of
[identity-recovery.md](identity-recovery.md) (recovery contacts): the
attestation-gathering step that had shipped only as a stub. Sections 2–5
below are the design as built, kept as the record of *why* it is shaped
this way; §1 is what it replaced.

Scope: how a designated recovery contact *learns of* a rotation request,
*attests* to it with a signed envelope, and how the hub *counts* those
attestations toward the threshold.

> **Which key signs an attestation.** The **roster identity key** — the
> pubkey the hub knows the contact by — not the derived multi-device
> master. Contacts are designated by hub-known pubkeys and the hub verifies
> against those, so a client that reaches for the master key produces
> signatures that never verify. That was a real bug on both clients; both
> repos' `CLAUDE.md` carry the warning. The master signs only multi-device
> material (subkey certs, revocations, designations).

---

## 1. What this replaced — the dead end as it stood

*Historical. Every defect below was fixed by the 2026-07-20 work; the
current code is described in §2–§5.*

Shipped and working before that (`crates/hub/src/routes/recovery.rs`,
Wavvon-server; tables `recovery_settings`, `recovery_contacts`,
`key_rotation_requests`, `rotation_attestations` — note the table names
drifted from the `recovery_rotation_requests`/`recovery_attestations` in
identity-recovery.md):

- Owner designation: `PUT`/`GET /recovery/contacts`,
  `DELETE /recovery/contacts/:pubkey` (max 5 contacts, `1 ≤ K ≤ N`, owner
  can't be own contact).
- Requester: `POST /recovery/rotate-key` opens a request;
  `GET /recovery/requests` lists own requests.
- Admin: `GET /admin/recovery/pending`, `POST /admin/recovery/:id/approve`
  (transfers non-owner roles to the new key, deletes old sessions),
  `.../deny`.

Three defects made the feature inert end to end. **All three are closed** —
if you are reading this to decide whether the feature works, it does:

1. ~~**No split request/attest flow.**~~ `rotate-key` took attestations
   *inline* in the requester's single POST, with no standalone endpoint for
   a contact to submit one and no per-request GET to fetch what to sign.
   **Fixed**: `GET /recovery/rotation-request/{id}` and
   `POST /recovery/rotation-request/{id}/attest` exist and are registered
   in `server.rs`; inline attestations are now *rejected* with a message
   naming the new flow, rather than silently accepted.
2. ~~**No signature verification.**~~ The hub stored `signature` as an
   opaque string and counted it, so a requester could fabricate one per
   known (public) contact pubkey and hit threshold with zero real vouching.
   **Fixed**: `post_attest` verifies Ed25519 over the bound bundle
   (`wavvon_identity::verify_signature`) and rejects a non-contact attester;
   `post_rotate_key` additionally verifies a new-key proof, so the opener
   is proven to hold `new_pubkey`.
3. ~~**No identity-crate envelope.**~~ **Fixed**:
   `recovery_attestation_signing_bytes` and `recovery_request_signing_bytes`
   live in the identity crate under `wavvon/recovery-attestation/v1` and
   `wavvon/recovery-request/v1`, mirrored in TS with shared vectors.

## 2. The design, as built

Minimal completion of the already-committed design: keep the tables and the
admin path; add the missing envelope, split the flow, and verify signatures.

**Envelope (identity crate, Wavvon-server).** Add
`recovery_attestation_signing_bytes(hub_pubkey, old_pubkey, new_pubkey,
request_nonce)` under tag `b"wavvon/recovery-attestation/v1\0"`,
length-prefixed like every sibling in `wire.rs`. The contact signs those
bytes with their **roster identity** key — the pubkey the hub knows them by
(see the note at the top). `hub_pubkey` binds the attestation to one
hub; `request_nonce` binds it to one request. This is the exact bound
bundle identity-recovery.md §"What a contact can attest" already specified.

**Nonce (hub).** Add `nonce TEXT` to `key_rotation_requests` (additive
`ALTER TABLE ADD COLUMN`). `rotate-key` generates it and returns it; it no
longer needs inline attestations (empty list becomes the normal path).

**How a contact learns of a request: out-of-band request id.** The
committed stance holds — the hub does **not** push to contacts on the
requester's say-so (that would let anyone spam "I'm Alice, vouch for me" at
Alice's contacts). The requester shares the request id over an existing
trust channel (DM, in person). An optional best-effort in-app pending list
for contacts who are online on the hub is a convenience, never the proof.
(See decision point below.)

**How a contact attests.**
- `GET /recovery/rotation-request/:id` → `{hub_pubkey, old_pubkey,
  new_pubkey, nonce, status, attestation_count, threshold}` — the bundle to
  sign plus progress.
- `POST /recovery/rotation-request/:id/attest` → `{attester, signature}`.
  The hub: (a) verifies the Ed25519 signature over the canonical bundle
  bytes, (b) confirms `attester ∈ recovery_contacts(old_pubkey)` and
  `attester ∉ {old,new}`, (c) upserts (dedupes per contact), (d) flips
  `pending → ready_for_review` when the count reaches `threshold`.

**Collection, threshold, finalize — unchanged.** Threshold only routes the
request into the admin queue; a human admin approves/partial/denies;
approval transfers non-owner roles and kills old sessions; owner role needs
the separate successor path. Community-axis only, per hub, no cross-hub
propagation — two-axis and no-central-authority preserved.

## 3. Security analysis

- **Signature verification is the fix.** After it, an attestation counts
  only if signed by a designated contact's roster identity key over the
  hub-bound, nonce-bound bundle. The fabrication hole in defect 2 closes.
- **Stolen device / contact key.** An attacker holding one *contact's* key
  produces one real attestation — below threshold for `K ≥ 2`. An attacker
  holding the *owner's* key doesn't need recovery. An attacker holding
  neither must forge `K` distinct contact signatures (cryptographically
  infeasible) *and* fool a human admin.
- **Compromised hub.** A malicious hub can invent attestation rows — but it
  already fully controls its own roles ([threat-model.md](threat-model.md):
  "hub admin abuse of own users — not defended"). No new trust assumption;
  a hub you distrust can't be socially recovered *against* either way.
- **Replay/freshness.** `hub_pubkey` in the bundle blocks cross-hub replay;
  the server-generated per-request `nonce` blocks cross-request replay. A
  bounded-window expiry sweep (the 14-day flip to `expired`, in
  `crates/hub/src/retention_worker.rs`) limits how long a half-gathered
  request lingers.
- **Why threshold holds.** It is a *filter to earn admin attention*, not an
  authorization. K colluding/compromised contacts still can't grant
  anything; the admin scopes the transfer and the owner role never rides
  along. Consistent with identity-recovery.md §"threshold-then-human".

## 4. Decisions — DECIDED 2026-07-20 (user calls, all four)

- **Notification channel: out-of-band request id** for v1. The hub never
  pushes vouch requests (anti-spam stance holds); a best-effort in-app
  pending list is a possible later nicety.
- **Threshold: default `K = 2`, `K = 1` allowed.** The human admin review
  is the backstop; owners with a single trustworthy contact aren't locked
  out.
- **Expiry: 14-day sweep** — pending requests flip to `expired` after 14
  days (background sweep alongside the existing retention workers).
- **New-key proof: required.** `rotate-key` must carry a signature by
  `new_pubkey` over the request bundle, proving the requester holds the
  key they're rotating to.

## 5. Implementation sketch and order

Wire-format changes are cross-repo: the identity crate and TS
`packages/core` must match **byte-for-byte**, with a shared test vector.

1. **Identity crate** (Wavvon-server `identity/src/`, mirrored in
   Wavvon-clients `packages/core/src/identity/wire.ts`): add
   `recovery-attestation/v1` signing-bytes helper; add its hex test vector
   to [wire-format.md](wire-format.md) and `wire.test.ts`.
2. **Hub** (Wavvon-server `hub/src/`): `ALTER TABLE key_rotation_requests
   ADD COLUMN nonce`; generate + return nonce in `post_rotate_key` (drop
   the inline-attestation requirement); add `GET
   /recovery/rotation-request/:id` and `POST
   /recovery/rotation-request/:id/attest` (Ed25519 verify + contact-set
   check) to `routes/recovery.rs`; register both in `server.rs`. Happy-path
   + bad-signature + non-contact rejection tests in
   `hub/tests/*_flow.rs`.
3. **Clients** (Wavvon-clients; web leads per
   [client-parity.md](client-parity.md)): requester status view (poll
   `GET :id`, show count/K, shareable id); **contact review card** (paste
   id → `GET :id` → sign the bundle with the roster identity key → `POST attest`).
   This unblocks hoisting `RecoveryContactsSection` into `packages/ui`.

Order 1 → 2 → 3; step 1 gates 2 and 3 because both sign/verify the same
bytes.

## What's deferred

- Reliable in-app push to contacts, QR-assisted hand-off, contact-set
  rotation history, cross-hub propagation — all as in
  [identity-recovery.md](identity-recovery.md) §"What's deferred".
- Reconciling the drifted table names (`key_rotation_requests` vs the
  doc's `recovery_rotation_requests`) is cosmetic; leave as-is to avoid a
  no-value migration.
