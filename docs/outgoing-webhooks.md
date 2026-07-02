# Outgoing Webhooks

An admin registers one or more external HTTPS URLs. The hub POSTs hub
events to those URLs as they occur — no bot identity, no persistent
WebSocket session required. Useful for pure "push events to an external
system" integrations: monitoring dashboards, alerting, log archival,
Zapier-style automation.

> **Contrast with related primitives:**
> - [Incoming webhooks](bots.md#9-incoming-webhooks) — external system
>   pushes a message *into* a channel. Opposite direction.
> - [Bot event subscriptions](bots.md#8-event-subscriptions) — same event
>   shapes, but the receiver maintains a persistent WS session and has a
>   bot identity. Outgoing webhooks are stateless; the hub is the caller.
> - [Slash-command dispatch](bots.md#3-slash-commands) — hub POSTs to a
>   bot's webhook *on demand*, expects a response. Outgoing webhooks are
>   fire-and-forget.

---

## 1. Admin registration

Hub Settings → Integrations → Outgoing Webhooks → Add.

Fields the admin provides:
- **URL** — the receiving endpoint. Must be `https://`, not a
  private/loopback range (same rule as bot `webhook_url`).
- **Display name** — optional label shown in the UI ("Grafana alerts",
  "Discord bridge").

On create, the hub generates:
- A random `id` (nanoid).
- A random `secret` (32 bytes, base64url-encoded). **Shown once** in the
  UI immediately after creation; the hub stores only its HMAC key
  (`HKDF(secret, "wavvon-webhook-signing")` — see §4). The admin copies
  the secret and configures the receiver with it.

After creation the admin configures subscriptions (§2) and optionally
rotates the secret (§4) — both in the same settings view.

---

## 2. Subscription model

Identical to the bot subscription model ([bots.md §8](bots.md#8-event-subscriptions)).

The admin picks which event types to forward, with an optional channel
filter per event:

```json
[
  { "event": "member.joined" },
  { "event": "member.banned" },
  { "event": "voice.joined" },
  { "event": "message.created", "channels": ["announcements"] }
]
```

**Same privacy gate as bots**: `message.created`, `message.edited`, and
`message.deleted` **require** an explicit `channels` list. A hub-wide
message firehose is too high-volume and a privacy concern. The hub
enforces this at subscription-save time and rejects the request if the
channels list is absent for those events.

All other events are hub-scope by default. The full available event set
is the same table defined in [bots.md §8](bots.md#8-event-subscriptions).

---

## 3. Wire shape — POST body

The hub POSTs a `hub_event` envelope to the registered URL on each
matching event. Same structure as the bot WS event (§8):

```json
{
  "type":      "hub_event",
  "event":     "member.joined",
  "hub_url":   "https://hub.example.com",
  "webhook_id": "wh_3Kn9q",
  "at":        1748217600,
  "seq":       8471,
  "payload":   { "pubkey": "...", "display_name": "player42" }
}
```

`webhook_id` is added to let receivers with multiple incoming sources
distinguish which hub and webhook a delivery came from. `seq` mirrors the
audit log sequence number — useful for gap detection on the receiver side.

`Content-Type: application/json`. No response body is read. Any 2xx is
success; non-2xx or network error triggers the retry policy (§5).

---

## 4. Signing

Every outgoing POST carries three headers:

```
X-Wavvon-Hub-Pubkey:  <hex ed25519 pubkey of the hub>
X-Wavvon-Signature:   <HMAC-SHA256(body, signing_key), hex-encoded>
X-Wavvon-Timestamp:   <unix seconds>
X-Wavvon-Webhook-Id:  <id>
```

**Signing key**: `HKDF-SHA256(secret, salt="wavvon-webhook-signing")`.
The raw secret the admin copied is the input; receivers derive the same
signing key. HMAC-SHA256 is the choice here (not raw Ed25519) because
receivers are third-party services that expect HMAC — it is universally
supported without a cryptography library.

`X-Wavvon-Hub-Pubkey` is included for informational traceability — which
hub sent this — but the authenticity guarantee is the HMAC.

**Replay protection**: the receiver should reject requests where
`|now − X-Wavvon-Timestamp| > 300 s`. The hub documents this requirement
for integrators.

**Rotate secret**: admin clicks "Rotate secret" in the UI → hub generates
a new secret, stores the new key, returns the new raw secret (shown
once). The old key is invalidated immediately; any in-flight delivery
signed with the old key will fail the receiver's verification if delivered
after rotation. That is an acceptable edge case; the admin controls when
to rotate.

---

## 5. Retry and failure handling

The hub makes deliveries asynchronously. On each delivery attempt:

- **Timeout**: 10 s per HTTP request.
- **Retry schedule** on non-2xx or network error: 3 retries at 5 s, 30 s,
  5 min. Total: up to 4 attempts over ~6 minutes.
- **Success**: any 2xx status. Delivery marked as succeeded; retry
  count resets.
- **Permanent failure**: after all 4 attempts fail, the delivery is
  marked failed and the webhook's `failure_count` is incremented.

**Auto-disable threshold**: when `failure_count` reaches **5
consecutive failed deliveries**, the webhook is set to `active = false`
and the admin receives a `webhook_disabled` WS event:

```json
{ "type": "webhook_disabled",
  "webhook_id": "wh_3Kn9q",
  "reason": "consecutive_failures",
  "last_error": "connection refused" }
```

The admin sees the webhook flagged in the UI. To re-enable: fix the
endpoint, click "Re-enable" → `active = true`, `failure_count` reset.

`failure_count` resets to 0 on any successful delivery — it tracks
*consecutive* failures, not total.

Events that arrive while a webhook is disabled are **dropped** — the
hub does not queue for later replay. Receivers that need guaranteed
delivery should run a full bot with event replay (§12 in [bots.md](bots.md)).

---

## 6. Delivery log

Hub stores the last **200 delivery attempts** per webhook in
`outgoing_webhook_deliveries`. Older rows are pruned on insert
(delete where id not in top-200). Retained for admin debugging only —
not an audit trail.

Delivery row fields: `id`, `webhook_id`, `event_type`, `event_seq`,
`attempted_at`, `attempt_number`, `status_code` (null on network error),
`success`, `error_msg`.

Admin UI: Hub Settings → Integrations → Outgoing Webhooks → [name] →
Delivery log. Table: timestamp, event type, attempt, status code, success
badge. Filterable by event type and success/failure.

---

## 7. Security

- **URL validation**: `https://` required; private/loopback ranges
  (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`,
  `::1`, etc.) rejected in production mode. Same rule as bot webhook URLs.
- **Max payload size**: 64 KB per event. Events exceeding this (unlikely
  with current event shapes) are truncated at `payload` and a `truncated:
  true` flag is added to the envelope.
- **Hub-side rate**: hub limits outbound delivery throughput to 50
  events/s across all webhooks combined (internal, not configurable by
  admin). Excess events are queued; the queue depth is logged if it
  exceeds 1 000 entries.
- **Secret entropy**: 32 bytes from `rand::thread_rng` (ChaCha-based
  CSPRNG). Stored as `secret_hash = HKDF(secret, "wavvon-webhook-signing")`
  — the raw secret is never persisted.

---

## 8. DB changes

```sql
-- outgoing_webhooks (hub/src/db/migrations.rs)
CREATE TABLE IF NOT EXISTS outgoing_webhooks (
    id                  TEXT    PRIMARY KEY,
    url                 TEXT    NOT NULL,
    display_name        TEXT,
    signing_key         BLOB    NOT NULL,  -- HKDF output; never the raw secret
    created_by_pubkey   TEXT    NOT NULL,
    active              INTEGER NOT NULL DEFAULT 1,
    failure_count       INTEGER NOT NULL DEFAULT 0,
    last_delivery_at    INTEGER,
    last_failure_at     INTEGER,
    created_at          INTEGER NOT NULL
);

-- per-webhook event subscriptions
CREATE TABLE IF NOT EXISTS outgoing_webhook_subscriptions (
    webhook_id  TEXT    NOT NULL REFERENCES outgoing_webhooks(id) ON DELETE CASCADE,
    event_type  TEXT    NOT NULL,
    channel_id  TEXT,   -- NULL = hub-scope
    PRIMARY KEY (webhook_id, event_type, COALESCE(channel_id, ''))
);

-- delivery log (pruned to last 200 per webhook on insert)
CREATE TABLE IF NOT EXISTS outgoing_webhook_deliveries (
    id              TEXT    PRIMARY KEY,
    webhook_id      TEXT    NOT NULL REFERENCES outgoing_webhooks(id) ON DELETE CASCADE,
    event_type      TEXT    NOT NULL,
    event_seq       INTEGER,
    attempted_at    INTEGER NOT NULL,
    attempt_number  INTEGER NOT NULL DEFAULT 1,
    status_code     INTEGER,
    success         INTEGER NOT NULL DEFAULT 0,
    error_msg       TEXT
);
CREATE INDEX IF NOT EXISTS idx_owd_webhook ON outgoing_webhook_deliveries(webhook_id, attempted_at DESC);
```

---

## 9. Routes

All under `/admin/outgoing-webhooks`. Auth: `manage_hub` permission
(same gate as other admin routes).

| Method | Path | Description |
|---|---|---|
| `POST` | `/admin/outgoing-webhooks` | Create. Returns `{ id, url, display_name, secret }` — secret shown once. |
| `GET` | `/admin/outgoing-webhooks` | List all (no secrets, no signing keys). |
| `PATCH` | `/admin/outgoing-webhooks/:id` | Update `url`, `display_name`, `active`. |
| `DELETE` | `/admin/outgoing-webhooks/:id` | Delete webhook and all its rows. |
| `GET` | `/admin/outgoing-webhooks/:id/subscriptions` | Current subscription set (for pre-filling the editor). |
| `PUT` | `/admin/outgoing-webhooks/:id/subscriptions` | Replace subscription set atomically. |
| `POST` | `/admin/outgoing-webhooks/:id/rotate-secret` | Generate new secret. Returns `{ secret }` (shown once). |
| `POST` | `/admin/outgoing-webhooks/:id/enable` | Set `active = true`, reset `failure_count`. |
| `GET` | `/admin/outgoing-webhooks/:id/deliveries` | Paginated delivery log, newest first. |

---

## 10. Implementation — hub side

### New module: `hub/src/outgoing_webhooks/`

- **`delivery.rs`** — `deliver_event(webhook: &OutgoingWebhook, event: &HubEvent)`:
  serialises the payload, signs with HMAC-SHA256, POSTs over `reqwest`
  (the existing HTTP client used by `federation/client.rs`), handles
  retries, writes to `outgoing_webhook_deliveries`, updates
  `failure_count`. Returns `DeliveryResult`.
- **`worker.rs`** — `dispatch_event(...)` is called directly from
  `publish_hub_event` (see below). On each event, queries
  `outgoing_webhook_subscriptions` for matching webhooks and spawns a
  delivery task per match so the caller isn't blocked on HTTP calls.
  Respects the 50 events/s internal rate cap.
- **`routes.rs`** — implements the 8 admin routes (§9).
- **`models.rs`** — `OutgoingWebhook`, `WebhookSubscription`,
  `DeliveryRecord`, `WebhookEventEnvelope` structs.

### Integration with `hub/src/bots/events.rs`

There is no broadcast channel for hub events — `publish_hub_event`
writes the audit log row and then directly pushes to subscribed bot WS
sessions in a loop. The outgoing webhook worker hooks in the same way:
`publish_hub_event` calls `outgoing_webhooks::worker::dispatch_event`
right after the audit-log write, alongside the bot dispatch loop. No
separate broadcast subscriber needed.

---

## 11. Client — admin UI

**Desktop and web** (`HubOutgoingWebhooksSection.tsx`):

- **List view**: table of webhooks — name, URL (host only), subscriptions
  summary ("5 event types"), status badge (Active / Failed / Disabled),
  last delivery timestamp.
- **Add dialog**: URL field, display name, event type picker (checklist
  matching the §2 event table; channel sub-picker for message events).
  On submit: show the one-time secret in a copy-and-confirm dialog with a
  "I've copied this" gate before dismissal.
- **Per-webhook panel**: subscription editor, rotate secret (same
  copy-and-confirm modal), enable/disable toggle, delivery log table.
- **Failure badge**: disabled webhooks show a red "Failed — re-enable"
  badge in the list. Clicking it opens the per-webhook panel.

No new Tauri commands needed — the admin routes cover all operations.
Web client's `hubAdmin.ts` adds the new route functions.

---

## 12. What's deferred

- **Delivery replay** — if a webhook was disabled for a period, replaying
  missed events on re-enable. The audit log has the data; a replay
  endpoint is a follow-on.
- **Per-event-type rate throttling** — e.g. cap `message.created` to 1
  delivery/s on busy channels. Current design drops excess at the
  hub-wide 50 events/s cap, not per-event-type.
- **Webhook templates / payload transformation** — let admins remap
  fields (e.g. format for Slack's incoming webhook shape). Out of scope;
  a bot or middleware layer owns that.
- **Federation webhooks** — outgoing webhooks on federated events (e.g.
  `federation.message_received` from an allied hub). Needs the federation
  event model to stabilise first.

---

## Decisions

- **HMAC-SHA256 over Ed25519** for signing: receivers are third-party
  services. HMAC-SHA256 with a shared secret is universally supported
  without a cryptography library; Ed25519 would require a library and
  knowledge of the hub's pubkey. Same rationale used by GitHub, Stripe,
  and Discord for their outgoing webhooks. `X-Wavvon-Hub-Pubkey` is still
  included for traceability, but the trust anchor is the HMAC.

- **Fire-and-forget with bounded retry** over guaranteed delivery: full
  guaranteed delivery (durable queue, no drops) requires either persisting
  the event payload or re-reading from the audit log on retry. The 4-attempt
  retry window (6 minutes) covers transient receiver downtime. For stronger
  guarantees, operators should run a bot with event replay (§12 in
  [bots.md](bots.md)).

- **Drop on disable** over queuing while disabled: a disabled webhook means
  the endpoint is broken. Queuing events indefinitely for a broken endpoint
  risks unbounded memory growth. The admin re-enables once the endpoint is
  fixed; they accept the gap.

- **Last-200 delivery log** per webhook: enough for debugging recent
  failures without unbounded DB growth. Not an audit trail — the
  `hub_audit_log` owns that.
