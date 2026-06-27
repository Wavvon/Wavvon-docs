# Missions (removed)

> **This feature has been removed.** The missions system, spark balance,
> cosmetic catalog, and all related code in Wavvon-desktop and
> Wavvon-discovery have been deleted. See the decision in
> [`decisions.md`](decisions.md) — "Missions, sparks, and cosmetic catalog
> removed". This document is kept as a historical record only.

---

# Original design (archived)

Full design for the Missions system. `monetization.md` has the high-level
sketch and the constraints that bind this design: **cosmetics-only**,
**pull-not-push**, **disablable in forks** via `MISSIONS_ENABLED`, spark
balance is **personal-axis state** on the home hub list, and cosmetics are
client-side master-signed blobs.

The cosmetic-only rule is the permanent guardrail: if any cosmetic ever
affects function it has become a subscription tier in disguise and must be
removed.

---

## Mission service

Part of **Wavvon-discovery** (`discovery/`) — missions API routes live
alongside the hub and bot discovery endpoints. No separate deployment
needed. Like a hub it has its own **Ed25519 signing
keypair**; the public half is published at `GET /pubkey` (the same
publish-your-key pattern hubs use at `/info`). Clients pin and cache that
pubkey and verify every signed artifact (mission list, entitlement blobs)
against it — single-hop trust, no PKI chain, the same shape as hub cert
trust.

### REST API

| Method + path | Auth | Purpose |
|---|---|---|
| `GET /missions` | none | Active mission list; signed envelope (below) |
| `GET /pubkey` | none | Service Ed25519 public key (hex) |
| `POST /missions/:id/claim` | body-bound | Claim a completion: `{ user_pubkey, attestation_token, pow_nonce }` → `{ ok: true, sparks_earned }` or error |
| `GET /account/balance` | signed header | Spark balance for a pubkey → `{ balance }` |
| `GET /account/cosmetics` | signed header | Entitlement blobs for this pubkey |
| `POST /account/redeem` | signed header | Spend sparks on a catalog item → signed entitlement blob |
| `GET /catalog` | none | Cosmetic catalog |
| `POST /admin/missions` | bearer | Create a mission |
| `PATCH /admin/missions/:id` | bearer | Edit / deactivate |
| `GET /admin/missions/:id/stats` | bearer | Completion + billing stats |

**Signed-request auth** (`/account/*`): a header carrying
`{ pubkey, sig, ts }` where `sig` covers the request path + body + a
fresh `ts` (5-minute replay window), verified against `pubkey`. Same
primitive hub auth uses, so the client already has the signer.
**Admin** routes use a simple bearer token (operator-held).

---

## Mission list format

`GET /missions` returns a signed envelope. Clients verify `signature`
against the cached service pubkey **before rendering anything**. An expired
list (`expires_at` in the past) renders no missions. A cache older than 1
hour triggers a re-fetch.

```json
{
  "v": 1,
  "issued_at": 1718000000,
  "expires_at": 1718086400,
  "missions": [
    {
      "id": "m-abc123",
      "sponsor": "Acme Corp",
      "title": "Read our blog post and answer a quiz",
      "description": "Visit the linked page and complete a short quiz.",
      "reward_sparks": 100,
      "attestation_url": "https://missions.wavvon.app/attest/m-abc123",
      "expires_at": 1718086400,
      "tags": ["quiz", "reading"],
      "max_completions_per_user": 1
    }
  ],
  "signature": "<base64 Ed25519 sig over canonical JSON minus `signature` field>"
}
```

The signature is computed over the canonical JSON of the envelope (sorted
keys, fixed numeric form) with `signature` removed. Canonicalisation must
match on both sides — a shared contract between service and clients.

---

## Attestation flow

1. The client opens the sponsor's `attestation_url` in the **system
   browser**, not an in-app WebView. Reason: never inject sponsor pages
   (and their trackers) into the main UI surface. The chat surface stays
   ad-free.
2. The sponsor's page walks the user through the mission action. On
   completion, the sponsor's attestation endpoint issues a **completion
   token**: `{ mission_id, user_pubkey, completed_at, nonce, sponsor_sig }`,
   signed by the sponsor's registered `signing_pubkey`.
3. The user's client submits the token to `POST /missions/:id/claim`
   together with a PoW nonce.
4. The service verifies in order: sponsor signature valid against the
   registered key; mission active and not expired; this
   `(mission_id, user_pubkey)` not already claimed; PoW meets the
   reward-scaled threshold; rate limits not exceeded.
5. On success: credit sparks, bill the sponsor a per-completion fee,
   return `{ sparks_earned }`.

How `user_pubkey` is bound inside the attestation token (deep-link
parameter vs. a short-lived nonce the client mints) is an implementation
detail for the sponsor-onboarding work; the token must be bound to the
claiming key.

---

## Anti-fraud design

Spark farming (scripted bulk completions) is the threat. Three layers,
defence in depth.

### Layer 1 — PoW on claim

Claiming requires a SHA-256 proof-of-work whose **difficulty scales with
`reward_sparks`** — a 100-spark mission costs more CPU than a 10-spark one.
This makes high-value farming disproportionately expensive. Reuse
`compute_security_level()` / `verify_security_level()` from
`identity/src/pow.rs` (Wavvon-server) rather than inventing a second PoW.

### Layer 2 — rate limits and identity signals

- **Per-pubkey**: max N claims/hour and N/day.
- **Per-IP**: max M claims/hour per /24 subnet.
- **Young-account discount**: accounts under 7 days old (first seen
  connecting to any hub) earn a 50% spark discount until they age out.
  This drains the incentive to mint throwaway keys per claim. The service
  tracks first-seen via attestation IP and a probabilistic HyperLogLog
  sketch per /24 — estimating distinct keys per subnet without storing raw
  IPs.

### Layer 3 — sponsor-side callbacks

The sponsor's attestation endpoint is the primary barrier. Optionally,
per mission, the service calls a registered `verify_callback_url` with
`{ mission_id, user_pubkey, attestation_token }` before crediting, giving
the sponsor a second-chance veto. Sponsors with server-side validation use
it; sponsors relying on their attestation page alone skip it.

### Deferred

Behavioral biometrics, cross-IP device fingerprinting, ML anomaly
detection. The three layers above cover early-stage abuse; the heavier
design waits until real abuse patterns are observed.

---

## Spark balance and cosmetics

### Balance

The spark balance is **personal-axis state**: it lives in the user's home
hub list prefs blob (encrypted), per `home-hub.md` and `monetization.md`.
The prefs-blob copy is a **cache** — the mission service holds the
**authoritative** balance (it has to, for billing integrity). On prefs-blob
fetch, the client merges its local count with a fresh
`GET /account/balance` query; the service value wins on conflict. No
community hub ever holds a balance or calls a billing endpoint.

### Cosmetic catalog

Project-defined. Three initial types, all display-only:

- **Profile flair** — a small badge/label beside the display name
  (e.g. "Founder", seasonal icons).
- **Avatar frame** — a decorative border around the avatar.
- **Color theme** — a custom accent colour visible as a profile indicator
  to others.

### Entitlement blobs

`{ user_pubkey, item_id, granted_at, expires_at: null | ts, service_sig }`,
signed by the mission service key. The **client holds the blobs**. A hub
renders flair by verifying the blob signature against the cached service
pubkey — single-hop trust, no money service call at render time. A
community hub thus shows flair without ever touching billing.

---

## `MISSIONS_ENABLED` flag

- Default `true` in official builds; trivially overridable in forks.
- When `false`: the Missions panel is hidden, cosmetic blobs are not
  fetched, hub-side flair rendering is skipped.
- No protocol change either way. A hub or client with the flag off still
  federates and connects normally — the flag is a pure surface toggle.

---

## Data model (Wavvon-missions service)

```
missions(id, sponsor_id, title, description, reward_sparks,
         attestation_url, verify_callback_url, expires_at,
         active, max_completions_per_user)

sponsors(id, name, balance_credits, api_key_hash, signing_pubkey)

completions(mission_id, user_pubkey, completed_at, ip_hash, pow_level,
            PRIMARY KEY (mission_id, user_pubkey))   -- dedup at storage layer

spark_balances(user_pubkey, balance, updated_at)

cosmetic_catalog(item_id, name, type, description, cost_sparks,
                 asset_url, expires_at)

entitlements(user_pubkey, item_id, granted_at, expires_at, signature)
```

The composite primary key on `completions` enforces dedup at the storage
layer independently of rate-limit checks. `ip_hash` (not raw IP) feeds
Layer 2 without storing addresses in the clear.

---

## Implementation split

| Piece | Repo |
|---|---|
| Mission service, all REST routes, signing key, DB, anti-fraud | Wavvon-discovery (`src/app/api/missions/`, `src/lib/missions-*.ts`) |
| PoW primitive reused for Layer 1 | `identity/src/pow.rs` in Wavvon-server |
| Missions panel, system-browser launch, claim + PoW, balance merge | Wavvon-desktop / Wavvon-web / Wavvon-android |
| `MISSIONS_ENABLED` flag + flair rendering | client repos |
| Prefs-blob spark cache | home hub list (`home-hub.md`; Wavvon-server identity) |

---

## What's deferred

- Full behavioral anti-fraud (ML signals).
- Sponsor onboarding UI — v1 is manual via the bearer-token admin routes.
- Spark → money conversion for sponsors — v1 is a flat per-completion fee,
  invoiced manually.
- Cosmetic trading or gifting between users.
- Time-limited cosmetic expiry UX (the `expires_at` columns exist but the
  lifecycle UI is not designed).
- Paid-placement ranking in the gaming catalog — separate design, see
  `monetization.md`.
