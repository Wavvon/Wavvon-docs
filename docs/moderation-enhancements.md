# Moderation Enhancements

Three additions to hub moderation, all designed around Wavvon's core
constraint: **no central authority, sovereign hub operators**. The
shipped controls (ban / mute / kick / timeout, channel ban, voice mute,
talk power — see [future-features.md](future-features.md)) act on a
single hub by an admin's hand. These three add (1) cross-hub ban signals
a hub *chooses* to honor, (2) a programmable allow/block gate the
operator owns, and (3) a member-driven report queue. None introduces a
global source of truth; each keeps the decision local to the operator.

Authoritative code lives in `Wavvon-server`
(`hub/src/routes/moderation.rs`, `hub/src/banlist_worker.rs`,
admin routes). Client surfaces live in `Wavvon-desktop` (mirrored in
`Wavvon-web` and `Wavvon-android`). Repo names are called out per piece
below so the backend-engineer and frontend-engineer agents don't drift.

---

## Feature 1: Federated ban lists

A hub admin subscribes to a signed blocklist published by another hub.
Listed users are denied entry, or admitted-and-flagged, per the
subscribing admin's policy.

**Decision.** A ban list is a signed JSON payload a hub publishes at
`GET /federation/banlist`:

```
{
  "issuer_pubkey": "<hex Ed25519 of the publishing hub>",
  "issued_at": "<RFC3339>",
  "entries": [
    { "master_pubkey": "<hex>", "reason": "<optional string>", "added_at": "<RFC3339>" }
  ],
  "signature": "<Ed25519 over the canonical serialisation>"
}
```

The signature is an Ed25519 signature over the canonical (deterministic)
serialisation of the payload — the same single-hop trust primitive as
hub badges and session tokens
([server-tags.md](server-tags.md), [decisions.md](decisions.md)). A
subscriber that holds the issuer's public key can verify the list came
from that hub and was not tampered with in transit.

Subscription is config on the consuming hub: `hub_settings` gains
`banlist_sources` (a list of hub URLs). On startup and every 6 hours the
hub fetches each source's `/federation/banlist`, verifies the signature
against the source's known pubkey, and upserts entries into a local
`federated_bans(source_hub_pubkey, target_master_pubkey, reason,
added_at, synced_at)` table. Entries that vanish from a source on a later
sync are removed for that source (the source un-banned them); entries an
admin has locally overridden are left alone.

The enforcement point is `POST /auth/verify`. If the authenticating
pubkey — or its master pubkey resolved via the subkey cert, respecting
the master+subkey model and the legacy single-key fallback
([multi-device.md](multi-device.md)) — appears in `federated_bans`, the
hub applies the per-subscription policy: **hard-reject** (deny the auth,
the user can't enter) or **soft-flag** (admit, but raise an admin-review
flag). Policy is set by the subscribing admin per source, because trust
in a source is not all-or-nothing — an admin may auto-deny on a source
they fully trust and merely flag on one they're evaluating.

**Sovereignty guarantees** (each is load-bearing, not decoration):

- Federation is opt-in. No source is trusted by default; an admin adds
  each source URL explicitly.
- Local override always wins. The admin can whitelist (never act on this
  entry) or blacklist (locally ban regardless of source) specific
  pubkeys; the 6-hour sync never clobbers a local override.
- A hub never auto-publishes its *own* ban list to peers. Publishing
  `/federation/banlist` is a separate, explicitly-enabled toggle. A hub
  consuming lists incurs no obligation to produce one.

**Privacy.** Entries carry the master pubkey only — no display name, no
message history, no source-hub member metadata. `reason` is optional and
at the issuer's discretion. A published list reveals who a hub banned and
(optionally) why; it reveals nothing else about those users.

**Alternative considered — DHT / global blocklist.** A single
platform-wide list distributed over a DHT. Rejected on sovereignty
grounds: a global list means *someone* controls who is banned everywhere,
which is exactly the central authority Wavvon refuses
([threat-model.md](threat-model.md), "No central authority"). Per-hub
opt-in subscription gives the same practical reach — popular curators
emerge organically — without anyone holding a universal kill switch.

**Alternative considered — reuse the badge / cert primitive directly.**
Badges certify *hubs*; hub-certifications certify *users in good
standing* ([hub-certifications.md](hub-certifications.md)). Neither is
shaped for a negative signal about a user. Overloading "absence of a
good-standing cert" as a ban conflates "unknown" with "bad." A dedicated
`/federation/banlist` endpoint with its own signing context is cleaner
and keeps the positive and negative reputation channels separate.

**Implementation contract:**

- *Hub* (Wavvon-server): publisher endpoint `GET /federation/banlist`
  (unauthenticated, signature is the authority — same pattern as
  `/info` badge serving) in `hub/src/routes/moderation.rs`; the 6-hour
  sync job in `hub/src/banlist_worker.rs`; the `/auth/verify` gate
  change; migration for
  `federated_bans` and the `banlist_sources` + per-source policy +
  publish-enabled settings.
- *Client* (Wavvon-desktop, mirrored web/Android): admin UI to add/remove
  sources, set per-source policy, view synced entries, and apply local
  overrides; a soft-flag review surface in the admin area. Gate on the
  existing admin permission (`manage_users`).

---

## Feature 2: Auto-moderation webhook

A hub operator configures an external URL; the hub asks it allow/block on
every message before storing.

**Decision.** Moderation is **synchronous and pre-store**. A message
arriving at `POST /channels/:id/messages`, if a webhook is configured, is
POSTed to the operator's URL:

```
{ "message_id", "channel_id", "sender_pubkey", "content",
  "attachments_count", "timestamp" }
```

No raw attachment bytes are sent — only the count — for privacy and
payload size. The webhook responds within a timeout (default 500ms) with
`{ "action": "allow" | "block", "reason"?: "<string>" }`. On `block` the
hub returns `403` to the sender carrying the reason; the message is never
stored and never fans out. On `allow` the message proceeds normally.

**On timeout or error the hub allows (fail-open).** This is the
sovereignty default: the operator's own moderation service failing should
degrade to "no moderation," not to "all members silently blocked." A
fail-closed default would let a flaky external service take a hub offline,
which no operator chooses on purpose.

Config lives in `hub_settings`: `moderation_webhook_url TEXT` and
`moderation_webhook_secret TEXT`, set via `PATCH /admin/settings`. The
hub signs each request with `HMAC-SHA256(secret, canonical_payload)` in
an `X-Wavvon-Signature` header so the external service can verify the
call genuinely came from the hub and wasn't replayed or forged.

**Circuit breaker.** If the webhook returns 5xx on 3 consecutive requests
within 60 seconds, the hub disables it for a 10-minute backoff, logs a
warning, and writes an entry to the audit log so the admin is notified. A
broken moderation service must not degrade hub throughput message after
message. During backoff the hub behaves as if no webhook is configured
(fail-open, consistent with the timeout path).

**Alternative considered — async post-store moderation** (store and fan
out first, delete if the service later says block). Rejected: the message
reaches WebSocket subscribers before the delete arrives — a race that
leaks exactly the content moderation was meant to stop, and an edit/delete
can't unsend a notification. Synchronous pre-store is the only point where
a block is actually a block.

**Alternative considered — sending attachment bytes to the webhook.**
Rejected for v1: it multiplies payload size, forces the operator's
endpoint to handle binary, and widens the privacy surface (attachment
content leaving the hub to a third party on every message). The count is
enough for "block messages with attachments" style rules; richer
attachment scanning is deferred.

**Implementation contract:**

- *Hub* (Wavvon-server): the pre-store dispatch in the message-create
  path of `hub/src/routes/channels.rs` (or wherever message create lives),
  HMAC signing, the 500ms timeout, the circuit-breaker state, and the
  `PATCH /admin/settings` fields. The dispatch shape mirrors bot webhook
  dispatch ([bots.md](bots.md)) — reuse that HTTP client and signing
  helper rather than adding a second.
- *Client* (Wavvon-desktop, mirrored web/Android): an admin settings panel
  to set/clear the URL and secret and to see circuit-breaker state. The
  external moderation service itself is **not** a Wavvon repo — operators
  bring their own; document the request/response contract above for them.

---

## Feature 3: Content reporting

Members flag a message for moderator review; reports land in an admin
queue.

**Decision.** `POST /messages/:id/report` with body `{ "reason":
"<string>" }`, auth required. It creates a row in
`message_reports(id, message_id, reporter_pubkey, reason, reported_at,
status)` where `status` is `pending` | `reviewed` | `dismissed`. Returns
`200` when accepted, `429` when the same reporter reports the same message
again (the `(message_id, reporter_pubkey)` pair is unique — deduplication
and basic spam-report defense).

The admin queue is `GET /admin/reports?status=pending`, listing each
report with a message preview, reporter info, and channel + timestamp
context. The admin acts via `POST /admin/reports/:id/review` with
`{ "action": "dismiss" | "delete_message" | "ban_user", "note"?: "..." }`.
The action applies immediately (reusing the existing
`hub/src/routes/moderation.rs` delete/ban paths) and the report flips to
`reviewed`. Admin permission required (`manage_users`).

**Reporter privacy.** Reporters are stored (needed for dedup) but never
shown to the message author or any non-admin. The reported user is not
notified — notifying them would chill reporting and invite retaliation.

**No reporter pile-on.** The admin queue shows a report count per message;
non-admin message views show no count. A visible "5 reports" badge would
incentivize dogpiling and turn the count into a harassment vector.

**Anonymous reporting is not in v1.** The reporter's pubkey is required
for the dedup and rate-limit story above. Anonymity without an identity
to deduplicate on opens the queue to flooding.

**What the admin sees.** Current message content (not a snapshot at
report time), reporter pubkey, the reason string, and channel + timestamp
context. Showing live content is the deliberate v1 choice — see deferred.

**Cross-hub reporting is out of scope.** Reports are hub-local. A message
authored on another hub and read via alliance/federation is that hub's to
moderate; federated ban lists (Feature 1) are the cross-hub tool. This
respects the two-axis rule — moderation of a community's messages is
community-axis state on that community's hub.

**Alternative considered — anonymous reporting via hash commitment.**
The reporter submits `hash(pubkey || message_id)`; dedup runs on the
hash, so the queue never stores who reported. Rejected for v1: it adds a
commitment scheme and removes the admin's ability to weigh "who is
reporting" or to rate-limit a serial false-reporter by identity. The
complexity isn't warranted until real abuse patterns appear — revisit if
they do.

**Implementation contract:**

- *Hub* (Wavvon-server): `POST /messages/:id/report`, the admin queue and
  review routes, and the `message_reports` migration. Review actions call
  into existing moderation handlers — no duplicate ban/delete logic.
- *Client* (Wavvon-desktop, mirrored web/Android): a "Report message"
  item on the message context menu with a reason prompt; an admin
  "Reports" tab listing the pending queue with preview and the
  dismiss / delete / ban actions.

---

## What's deferred (all three features)

- **Federated ban lists:** entry expiry / TTL on synced bans; transitive
  trust (honoring a source's *own* subscriptions); a curated public-list
  directory in Wavvon-discovery; signed *un-ban* receipts. Cross-hub
  propagation of a hub's own bans waits on portable hub-certifications.
- **Auto-moderation webhook:** webhook-driven message *editing* (redact
  rather than block); per-channel webhook routing; chaining multiple
  moderation services; sending attachment content for scanning.
- **Content reporting:** anonymous reporting via hash commitment;
  content snapshotting at report time (queue shows live content in v1);
  reporter reputation / auto-escalation on report volume; cross-hub
  reporting (federated ban lists cover the cross-hub case instead).
