# Identity Recovery UX

**Status**: design — no code yet. Builds on the shipped recovery phrase
([identity.md](identity.md)) and the committed multi-device + home-hub
designs ([multi-device.md](multi-device.md), [home-hub.md](home-hub.md)).

The recovery phrase already covers "I formatted my PC" — paste 24 words,
get the same keypair. This doc designs the **two next layers** that sit
on top of it:

1. **Backup / export** — a guided export-import of the identity file
   wrapped in a user passphrase (`.wavvon-backup`). Pure client-side
   crypto + UX. No hub involvement.
2. **Recovery contacts** — trusted users who can *vouch* for a key
   rotation to a hub's admins when the owner loses their key. Hub-side,
   community-axis state. Contacts never restore access automatically;
   they attest, humans decide.

These are independent features. Backup is the everyday safety net;
recovery contacts are the last resort for the case backup didn't cover.

---

## Where each layer sits relative to what's shipped

| Layer | What it protects against | Trust model | Where state lives |
|---|---|---|---|
| Recovery phrase (shipped) | Device loss when you *have* the phrase | The phrase is the secret | Nowhere — deterministic from phrase |
| Backup / export (this doc) | Losing the phrase but having an exported file + passphrase | Passphrase wraps the file | A file the user stores (cloud, USB, password manager) |
| Recovery contacts (this doc) | Losing *everything* — phrase and any backup | Social: K trusted humans vouch | Per-hub, community-axis |

The progression is deliberate: backup is strictly better than the phrase
for users who won't reliably store 24 words (a passphrase-protected file
in their password manager is a habit they already have). Recovery
contacts are the only path back when *both* the phrase and any backup are
gone — and they only recover hub-level standing, not the key itself.

---

# Part 1 — Backup / export

## What's in the backup

The shipped identity file lives at `~/.wavvon/identity.json` (written by
`desktop/src-tauri/src/lib.rs` in Wavvon-desktop). Under the multi-device
model it holds the master seed material plus this device's subkey. A
backup is **that file's secret material, encrypted under a user
passphrase**, in a self-describing envelope.

What the plaintext payload contains:

- The 24-word phrase entropy (the master seed). This is the load-bearing
  secret — everything else derives from it.
- This device's subkey secret, if the device holds one distinct from
  subkey 0 (multi-device, [multi-device.md](multi-device.md)).
- The current home hub list designation, *unsigned-copy* — a hint so an
  imported identity knows where to look for its personal-axis state. The
  authoritative designation still comes master-signed from the home hubs
  themselves; this is only a bootstrap pointer.

What the backup does **not** contain: community memberships, channel
history, friends, DMs. Those are not identity — they re-derive or
re-fetch once the imported key authenticates to its hubs. A backup is an
identity restore, not a profile snapshot.

## The `.wavvon-backup` file format

A small JSON envelope with the ciphertext base64'd inside. JSON (not a
raw binary blob) so the version and KDF parameters are inspectable
without decrypting, and so the format can evolve.

```
{
  "format":  "wavvon-backup",
  "version": 1,
  "kdf": {
    "alg":         "argon2id",
    "salt":        "<base64, 16 bytes>",
    "mem_kib":     65536,
    "iterations":  3,
    "parallelism": 1
  },
  "cipher": {
    "alg":        "aes-256-gcm",
    "nonce":      "<base64, 12 bytes>",
    "ciphertext": "<base64 of AEAD output over the plaintext payload>"
  },
  "created_at": "<unix seconds>",
  "label":      "<optional user-set string, e.g. 'desktop 2026'>"
}
```

- **`version`** gates the whole envelope. Bump on any format change.
  Import refuses an unknown major version with a clear "this backup was
  made by a newer Wavvon" message rather than guessing.
- **KDF**: Argon2id with the parameters stored in the file, so a backup
  made with stronger parameters later still decrypts on an older client
  that knows the `argon2id` alg. We store the params rather than hardcode
  them precisely so we can raise cost over time without breaking old
  backups.
- **Cipher**: AES-256-GCM. The GCM tag is the integrity check — a wrong
  passphrase fails the AEAD verify, which is exactly the signal "wrong
  passphrase or corrupt file." No separate MAC, no separate
  passphrase-verifier field (which would leak a check oracle).
- The KDF output (32 bytes) is the AES-256 key directly. No second
  derivation step.

The `.wavvon-backup` extension is a convenience for the OS file picker;
the `format` field is what the importer actually checks.

## Export flow

**Where**: Settings → Security → "Back up your identity," directly below
the existing recovery-phrase reveal block. The two live together because
they answer the same user question ("how do I not lose my account?"). The
export entry point is also reachable from the onboarding recovery nudge
as a secondary action, but onboarding stays non-blocking
([decisions.md](decisions.md), first-run entry).

**Steps**:

1. **Explainer** — one screen: "This file plus your passphrase can
   restore your identity on any device. Anyone with both can become you.
   Store the file somewhere safe; never share the passphrase." Same
   threat framing as the phrase reveal.
2. **Passphrase entry** — two fields (enter + confirm) with a strength
   indicator. Strength is estimated client-side (a zxcvbn-style estimator
   bundled in the client; no network). The indicator is **advisory**, not
   a hard gate: we show a clear warning under a weak passphrase but let
   the user proceed, because a forced-complexity rule trains users to
   write the passphrase on a sticky note. An optional label field
   (free text, e.g. "laptop backup May 2026") goes into the envelope's
   `label`.
3. **File save** — native save dialog (Tauri's dialog plugin), default
   filename `wavvon-identity-<short-fingerprint>-<date>.wavvon-backup`.
   The user picks the location. We never auto-upload anywhere — where the
   backup lives is the user's sovereignty call, consistent with
   self-hosting being the privacy answer everywhere else.
4. **Confirmation** — "Backup saved. Test it: you can import this file on
   another device or after a reset." We do not store any record that a
   backup was made (no server state, nothing that could become a tracked
   "you haven't backed up" nag beyond the existing local
   `recoveryAcknowledged` flag).

All crypto runs in the Rust side (`desktop/src-tauri/`), not in JS — the
plaintext seed must never cross into the webview. The React layer only
handles passphrase input, strength display, and the file dialog result.

## Import flow

**Where**: the welcome/first-run screen gains a third path next to "Add a
hub" and "Enter recovery phrase": **"Restore from backup file."** Also
reachable from Settings → Security on an existing install (for the
"I want this identity here too" case, which then becomes a device-pairing
question — see the next section).

**Steps**:

1. **File picker** — native open dialog filtered to `.wavvon-backup`.
   Reject anything whose `format` field isn't `wavvon-backup` with a
   clear error; reject an unknown major `version` with the
   "made by a newer Wavvon" message.
2. **Passphrase entry** — single field. On submit, run Argon2id with the
   file's stored params, attempt AES-GCM decrypt. A failed AEAD tag →
   "Couldn't unlock — wrong passphrase or the file is damaged." No
   distinction between the two (don't confirm to an attacker that the
   passphrase was close).
3. **Conflict resolution** — if the device already holds an identity
   (an `identity.json` exists):
   - Compute the incoming master fingerprint and the existing one.
   - **Same fingerprint**: "This backup is the identity already on this
     device. Nothing to do." (No-op; importing your own current backup is
     harmless.)
   - **Different fingerprint**: a blocking choice — "This device already
     has a different Wavvon identity (`ab:cd:…`). Replacing it means this
     device stops being that identity. Make sure that identity is backed
     up first." Two actions: **Replace** (with a second confirm that names
     both fingerprints) or **Cancel**. We never silently overwrite an
     existing identity. This mirrors the phrase-paste semantics in
     [identity.md](identity.md): pasting a phrase *replaces* the device's
     identity, and import is the same operation with a file instead of 24
     words.
4. **Post-import bootstrap** — write the identity file, then use the
   embedded home-hub-list hint to fetch the authoritative master-signed
   designation and pull personal-axis state (prefs blob, friends, DM
   inbox) per [home-hub.md](home-hub.md). Community memberships re-appear
   as the user re-adds or re-authenticates to community hubs.

## Backup vs. device pairing — two different flows, do not conflate

This is the cross-cutting trap. Both flows end with "this device acts as
my identity," but they are **not** the same operation and the UI must
keep them distinct:

| | Backup import | Device pairing ([multi-device.md](multi-device.md)) |
|---|---|---|
| What moves | The master seed (the whole identity) | A *new subkey* authorized by the master |
| Result on the device | The device **becomes** the master-holding identity (replaces any existing) | The device gets its own subkey; master stays where it was |
| Revocation story | None — it's the same key; losing the file = phrase compromise | The new subkey can be revoked independently |
| When to use | Disaster recovery; moving to a primary device | Adding a second concurrent device under one identity |
| Trust input | A file + passphrase | A live QR confirm on an already-paired device |

The decision rule the UI encodes: **if you still have a working device,
pair (QR).** Pairing gives you a revocable per-device subkey and never
moves the master seed over any channel. **Only import a backup when you
have no working device** (or you are deliberately designating a new
primary). The import screen says this explicitly so a user with a working
phone doesn't import a backup onto their new laptop when they should
scan-to-pair instead.

Concretely: the master-holding device is the one that can mint subkey
certs and sign home-hub designations. A backup import is how you
re-establish a master-holding device after total loss; pairing is how you
add a non-master device while a master-holding one still exists.

---

# Part 2 — Recovery contacts

## The problem this solves

Backup covers "I have the file." The phrase covers "I have the words."
**Recovery contacts cover "I have neither."** The key is gone, there's no
backup, and the user has lost their standing — admin/owner roles on hubs,
membership — that was tied to the dead pubkey.

What recovery contacts do **not** do: they do not regenerate the lost
private key (impossible — it's gone), and they do not automatically grant
anyone access. They let a *new* key the user controls present social
proof to each hub's admins: "K people you've designated as trusted vouch
that this new key is the same human as the old one." A human admin then
decides whether to rotate the old key's roles onto the new key.

This is **per-hub, community-axis** state. There is no global "your
identity was recovered" event — federation has no global source of truth
([decisions.md](decisions.md), federated-not-centralized). Recovery
happens hub by hub, on each hub where the user wants their standing back.

## What a recovery contact is

A recovery contact is **another Wavvon user's master pubkey, designated
by the owner on a specific hub**, marked as trusted to vouch for a key
rotation. Properties:

- Designated **per hub** by the owner, while they still hold their key.
  You set up recovery contacts *before* you lose your key, the same way
  you'd back up a phrase before a disaster.
- A contact is identified by master pubkey. The contact does not have to
  accept or even know they were designated (designation is the owner's
  unilateral act), but a contact *does* have to actively sign an
  attestation later for it to count — so a contact who refuses simply
  never produces a signature.
- The owner sets a **threshold K** per hub: how many contact attestations
  a rotation request must carry before admins will even see it as
  "vouched." K-of-N, with N being the designated contacts.

Recovery contacts are deliberately **not** put on the home hub list as a
personal-axis primitive. Vouching is about a *place's* decision to
re-grant *that place's* roles, so the designation lives on the community
hub whose roles are at stake. A user with admin on five hubs designates
contacts on each (the client makes this a "copy my contacts to these
hubs" convenience, but each hub stores its own copy and makes its own
decision).

## What a contact can attest

Exactly one thing: **"I know this person, and this new key is them."** A
contact signs an attestation binding:

- the **old (lost) pubkey** being recovered,
- the **new pubkey** claiming to be the same person,
- the **hub** the rotation is requested on,
- a nonce/timestamp so the attestation can't be replayed for a different
  request.

The contact signs that bundle with their own master key. That signature
is the entire payload of a contact's involvement. A contact cannot grant
roles, cannot pick which roles transfer, cannot act without the new key
initiating a request — they can only co-sign a specific, scoped claim.

## How key rotation works with contacts — the flow

Actors: **O-old** (the lost key, gone), **O-new** (the key the user
controls now, e.g. freshly generated or restored on a new device),
**contacts** C1…Cn, **hub admins** A.

1. **O-new opens a rotation request** on the hub:
   `POST /recovery/rotation-request` with `{ old_pubkey, new_pubkey,
   reason? }`, signed by O-new. The hub checks `old_pubkey` actually has
   recovery contacts configured and a threshold K; if not, the request is
   rejected (you can't socially recover an account that never set
   contacts up). The hub creates a `gathering` request and returns a
   request id + the nonce contacts must sign over.
2. **O-new distributes the request id to the contacts out-of-band** —
   over a DM, another chat, in person. This is intentionally out-of-band:
   it's the same trust channel by which the contacts know the human. The
   hub does not push a notification to contacts on the requester's say-so
   (that would let anyone spam "I'm Alice, vouch for me" to Alice's
   contacts). Optionally, a contact who is online on that hub can be shown
   pending requests naming them, as a convenience — but the binding proof
   is still the contact's signature.
3. **Each contact attests** (or declines). A contact reviews "X says they
   lost key `old…` and now use `new…`; do you confirm this is the same
   person you know?" If yes, the contact's client signs the bound bundle
   and `POST`s it to `/recovery/rotation-request/:id/attest`, signed by
   the contact's master key. The hub verifies the signature, verifies the
   contact is in `old_pubkey`'s recovery-contact set for this hub, and
   records the attestation. Duplicate attestations from one contact
   collapse to one.
4. **Threshold reached → admin queue, not auto-grant.** When the count of
   valid attestations reaches K, the request flips from `gathering` to
   `ready_for_review` and appears in the hub admin panel's recovery queue.
   **Nothing is granted automatically.** Reaching threshold only earns the
   request a place in front of a human.
5. **An admin decides.** The admin sees: old pubkey, new pubkey, which
   roles the old pubkey held, which contacts attested (with their
   fingerprints), the requester's optional reason. The admin chooses to
   **approve** (rotate the old pubkey's membership + roles onto the new
   pubkey), **partially approve** (transfer membership but, say, not the
   `manage_hub` role — the admin re-grants sensitive roles deliberately),
   or **reject**. Owner-role transfer specifically requires the existing
   owner's action and is called out separately below.
6. **On approval**, the hub updates the membership row: the new pubkey
   inherits the chosen roles, the old pubkey's membership is marked
   superseded (kept for audit, not deleted). The new key authenticates
   normally from then on. The request is closed.

## Why threshold-then-human, not threshold-then-auto

The threshold is a **filter to earn admin attention**, not an
authorization. Auto-granting at K signatures would mean K colluding
contacts (or a contact whose key is itself compromised) could silently
seize an admin's roles on a hub. Keeping the final grant in a human
admin's hands means:

- A compromised or coerced set of contacts still can't complete a
  takeover without an admin also being fooled.
- The admin can scope what transfers — owner-level roles never ride along
  on a social-recovery rubber stamp.
- It matches the existing approval-queue mental model hub admins already
  have (pending members, alliance invites, bot invites) rather than
  inventing a new auto-grant authority.

This is consistent with the threat model's stance that the hub admin is
trusted within their own hub ([threat-model.md](threat-model.md): "Hub
admin abuse of own users" is explicitly *not* defended — the admin is
already the authority on their hub, so making them the decision-maker
adds no new trust assumption).

## Owner / sole-admin edge cases

- **Recovering the owner role.** The owner role is non-revokable
  ([threat-model.md](threat-model.md)) and is the most dangerous thing to
  rotate. Rotation of the owner role requires the *current* owner to act —
  impossible if the owner is the one who lost their key. So the hub treats
  owner-role recovery as a distinct, louder path: contact attestations can
  move *membership and non-owner roles* onto the new key, but transferring
  owner specifically requires either (a) the lost owner having
  pre-designated a **successor pubkey** (a stronger, owner-signed statement
  than a recovery contact), or (b) a hub with more than one
  owner-equivalent admin, where another such admin approves. A hub with a
  single lost owner and no successor designation is, by design, not
  socially recoverable at the owner level — the contacts can restore the
  human's membership and admin roles, but the irrevocable owner crown
  stays with the dead key. This is a deliberate sharp edge: pre-designate
  a successor if you run a hub solo.
- **Self-vouching / Sybil contacts.** A contact must be a *distinct*
  master pubkey from the owner and from the new key. The hub rejects
  attestations where contact == old/new pubkey. Beyond that, the owner
  chose their contacts; if they designated sock puppets, they only fooled
  their own future self. The admin reviewing the request is the backstop.

## Data model

Community-axis tables, on the community hub (`hub/` in Wavvon-server).
These join the existing per-hub schema; they are **not** on the home hub
list.

```
recovery_settings(
  owner_pubkey   TEXT PRIMARY KEY,  -- the user designating contacts
  threshold      INTEGER,           -- K, contacts needed before admin sees it
  created_at     INTEGER
)

recovery_contacts(
  owner_pubkey   TEXT,              -- references recovery_settings
  contact_pubkey TEXT,              -- the trusted user's master pubkey
  created_at     INTEGER,
  PRIMARY KEY (owner_pubkey, contact_pubkey)
)

recovery_rotation_requests(
  id             TEXT PRIMARY KEY,
  old_pubkey     TEXT,              -- the lost key being recovered
  new_pubkey     TEXT,              -- the claiming key
  nonce          TEXT,              -- contacts sign over this + bound fields
  status         TEXT,              -- 'gathering' | 'ready_for_review'
                                    -- | 'approved' | 'rejected' | 'expired'
  reason         TEXT,              -- optional, from requester
  created_at     INTEGER,
  decided_at     INTEGER,           -- nullable
  decided_by     TEXT               -- admin pubkey, nullable
)

recovery_attestations(
  request_id     TEXT REFERENCES recovery_rotation_requests(id),
  contact_pubkey TEXT,              -- must be in recovery_contacts for old_pubkey
  signature      TEXT,              -- contact's Ed25519 sig over the bound bundle
  attested_at    INTEGER,
  PRIMARY KEY (request_id, contact_pubkey)
)
```

Per-hub DBs mean no `hub_id` column is needed (one SQLite file per hub —
[decisions.md](decisions.md), SQLite). Requests expire after a bounded
window (e.g. 14 days) via a `status = 'expired'` sweep so a half-gathered
request doesn't linger.

The bound bundle a contact signs is, concretely:
`(hub_pubkey, old_pubkey, new_pubkey, request_nonce)` — the hub's own
identity is included so an attestation gathered for one hub can't be
replayed against another hub where the same contact relationship exists.

## Route changes

All on the community hub (`hub/src/routes/` in Wavvon-server). A new
`recovery.rs` route module:

- `PUT /recovery/contacts` — owner sets/replaces their recovery-contact
  list + threshold for this hub. Auth: the owner's own key.
- `GET /recovery/contacts` — owner reads their current designation.
- `DELETE /recovery/contacts` — owner clears it.
- `POST /recovery/rotation-request` — new key opens a request. Signed by
  the new key. Rejects if `old_pubkey` has no contacts/threshold here.
- `GET /recovery/rotation-request/:id` — fetch request status + the nonce
  to sign (used by the requester and by attesting contacts).
- `POST /recovery/rotation-request/:id/attest` — a contact submits a
  signed attestation. Signed by the contact's key; verified against the
  contact set.
- `GET /admin/recovery/requests` — admin queue, `ready_for_review` first.
  Gated by a permission (see below).
- `POST /admin/recovery/requests/:id/decide` — admin approves (with the
  role set to transfer), partially approves, or rejects.

**Permission**: reuse `manage_users` for the admin-side review/decide
routes — social recovery is a membership/role action, which is what
`manage_users` already governs ([identity.md](identity.md) permission
set). Owner-role transfer additionally gates on the owner path described
above, not on `manage_users` alone.

**WS envelopes** (optional, follows the alliance-invite precedent of
"poll is fine for v1"): a `recovery_request_ready` envelope to logged-in
admins when a request hits `ready_for_review` is nice-to-have; the admin
panel can poll on mount for v1.

## Client changes

Mirrored across `Wavvon-desktop`, `Wavvon-web`, `Wavvon-android` (same
wire shapes, UI parity — the established pattern):

- **Owner side**, Settings → Security → "Recovery contacts" (per-hub
  section, shown for hubs where the user is a member): pick contacts from
  friends/known pubkeys, set threshold K, with a plain-language explainer
  ("If you lose your key, these people can vouch to this hub's admins that
  a new key is you. They can't take over your account — an admin still
  decides."). A "copy these contacts to my other hubs" convenience that
  issues the same `PUT` to each selected hub.
- **Requester side**: the backup/phrase-less recovery path. After
  restoring or generating a new key with no prior standing, a "Recover my
  standing on a hub" flow: enter the hub, enter the old pubkey (or pick
  from a local hint if any cached), open the request, get a shareable
  request id to send to contacts out-of-band, and a status view showing
  attestations gathered vs. K.
- **Contact side**: when shown a request naming them (via out-of-band id
  the contact pastes, or an optional in-app surfaced pending list), a
  review card — "X says they lost their key and now use `new…`. Confirm
  this is the person you know?" → Confirm signs + submits; Decline does
  nothing.
- **Admin side**: Hub Settings → a "Recovery requests" tab (next to
  pending members / alliance invites / bots), listing
  `ready_for_review` requests with old/new fingerprints, attesting
  contacts, held roles, and Approve / Partial / Reject controls. Approval
  presents the role set as checkboxes so the admin scopes the transfer.

## What is explicitly NOT automatic

Stated plainly because it is the whole point of the design:

- Contacts **cannot** restore access. They sign one scoped attestation.
- Reaching threshold K **does not** grant anything — it only routes the
  request to a human admin's queue.
- An admin **must** act for any role to move. No timeout auto-approves.
- Owner role **never** rides along automatically — it needs a
  pre-designated successor or another owner-equivalent admin.
- No cross-hub propagation. Recovering standing on Hub A does nothing on
  Hub B; the user runs the flow on each hub they care about.
- The lost private key is **not** regenerated — social recovery moves
  *standing* to a new key the user already controls; it never resurrects
  the dead key.

---

## Threat model deltas

New surfaces vs. [threat-model.md](threat-model.md):

| Surface | Mitigation |
|---|---|
| Backup file stolen | Useless without the passphrase; Argon2id makes offline guessing expensive. Same blast radius as phrase theft if the passphrase is weak — hence the strength indicator and the "anyone with both becomes you" warning. |
| Weak backup passphrase | Advisory strength meter + explicit warning; we don't hard-gate to avoid sticky-note passphrases. Argon2id cost raises the floor. |
| Import silently overwrites an existing identity | Fingerprint-compare + blocking double-confirm naming both keys before replace. |
| Colluding recovery contacts seize roles | Threshold only earns admin attention; a human admin makes the final grant and scopes which roles transfer. Owner role excluded from the auto-path. |
| Compromised contact key produces a false attestation | One attestation is below threshold for K>1; even at threshold, the admin is the backstop. Owners are advised K≥2 with distinct trust circles. |
| Spam rotation requests against a hub | Requester must sign as the new key; the request is rejected outright if `old_pubkey` configured no contacts; per-IP rate limits on `/recovery/*` as elsewhere; requests expire. |
| Replay an attestation against another hub | The signed bundle includes `hub_pubkey`; an attestation is bound to one hub. |
| Replay an old request for a new key | The per-request `nonce` is part of the signed bundle. |
| Attacker spams a victim's contacts with "vouch for me" | Request distribution to contacts is out-of-band by design — the hub does not push on the requester's say-so. |

The recovery-contact design does **not** defend against a hub admin who
is themselves the attacker — but that is already out of scope
([threat-model.md](threat-model.md): "Hub admin abuse of own users — Not
defended"). Social recovery deliberately places the final decision with
the party already trusted to run the hub.

---

## Phasing

1. **Backup / export + import** — fully client-side, no hub or protocol
   change. Ships independently and immediately useful. Includes the
   backup-vs-pairing UI distinction.
2. **Recovery-contact designation** — `recovery_settings` +
   `recovery_contacts` tables and the owner-side `PUT/GET/DELETE
   /recovery/contacts` routes and UI. Lets users set contacts up *before*
   they need them (the only useful order).
3. **Rotation request + attestation** — the request/attest routes,
   contact-side review UI, the bound-bundle signing.
4. **Admin review queue + decide** — the admin panel tab and the
   scoped-grant decision path, including the owner-role successor edge.

Phase 1 has no dependency on the others and can land first. Phases 2–4 of
recovery contacts depend on the master-pubkey identity from
[multi-device.md](multi-device.md) being the canonical identifier
(attestations are signed by master keys), so they sequence after
multi-device Phase 1 (master derivation) at minimum.

## What's deferred

- **Backup auto-sync to the home hub list.** A backup is deliberately a
  user-placed file, not personal-axis state on the home hubs — putting the
  passphrase-wrapped seed on the home hubs is a tempting convenience but
  concentrates the highest-value secret on hubs the threat model already
  flags as observing/withholding surfaces. Revisit only with a strong
  argument.
- **Cross-hub recovery propagation.** Recovering standing on every hub at
  once would need a global identity-mapping the federated model refuses.
  Per-hub, by hand, is the answer until something like portable
  hub-certifications ([future-features.md](future-features.md)) gives a
  signed "this new key supersedes this old key" attestation other hubs can
  *choose* to honor.
- **Contact-set rotation history.** Replacing a contact list is a `PUT`;
  finer-grained "this contact is no longer trusted as of date D" history
  is not modeled in v1.
- **Reliable in-app push to contacts.** v1 leans on out-of-band
  distribution of the request id; in-app surfacing is best-effort.
- **A QR-assisted recovery-request hand-off** to contacts (analogous to
  pairing). Out-of-band link/id is enough for v1.
- **Successor-designation UX** beyond the minimal owner-signed statement —
  a full "line of succession" model for hubs is its own design.

## Files this will touch

Pointers, not code. Paths under `desktop/` are Wavvon-desktop; under
`hub/`/`identity/` are Wavvon-server; client UI mirrors to Wavvon-web /
Wavvon-android.

- `desktop/src-tauri/src/lib.rs` (Wavvon-desktop) — backup export/import
  Tauri commands: Argon2id + AES-GCM seal/open over the identity file;
  fingerprint compare for import conflict resolution. Crypto stays in
  Rust; the seed never enters the webview.
- `desktop/src/` (Wavvon-desktop) — export wizard (explainer →
  passphrase + strength meter → save dialog), import flow (file picker →
  passphrase → conflict modal), the "restore from backup" entry on the
  welcome screen, and the recovery-contact owner/contact/requester UI.
- `hub/src/routes/recovery.rs` (new, Wavvon-server) — contact designation,
  rotation request, attestation, and admin review/decide routes.
- `hub/src/db/migrations.rs` (Wavvon-server) — `recovery_settings`,
  `recovery_contacts`, `recovery_rotation_requests`,
  `recovery_attestations`.
- `hub/src/permissions.rs` (Wavvon-server) — admin recovery routes gate on
  `manage_users`; owner-role transfer gates on the owner/successor path.
- `identity/src/lib.rs` (Wavvon-server) — the bound-bundle signing helper
  for attestations (master-key sign over `(hub_pubkey, old, new, nonce)`),
  shared so client and hub agree on the exact bytes.
