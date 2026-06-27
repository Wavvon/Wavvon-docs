# Design Decisions — Archive

Older entries relocated verbatim from [decisions.md](decisions.md) to keep
that file small enough to read whole (the wiki rule is ~200 lines per
file; the active file aims well under 500). Nothing here was rewritten —
entries, alternatives, tradeoffs, and supersession notes are preserved
exactly as recorded. Where an entry has been superseded, the superseding
entry lives in [decisions.md](decisions.md) (or further up this file) and
says so explicitly.

Newest entries first, continuing the order from decisions.md.

## Discovery v2: server-side uptime probing, separate farm catalog, fan-out search, catalog-only analytics

**Decision**: four Wavvon-discovery enhancements, all extending the
existing Next.js + `better-sqlite3` + `@noble/ed25519` stack with no new
infrastructure. (1) **Hub uptime** — discovery probes each hub's public
`GET /info` every 15 min from the server, stores results in `hub_pings`,
shows a 7-day uptime percentage, prunes rows past 30 days. (2) **Farm
browsing** — a separate `farms` catalog/page/API reusing the signed
self-listing primitive, not a tagged subset of hub listings. (3) **Global
search** — `GET /api/search` fans out across catalogs with `Promise.all`,
merges and ranks, caps 5/type; SQLite FTS5, no search service. (4)
**Anonymous analytics** — `GET /api/analytics` exposes catalog-only
counts (registered vs. active hubs, top tags, weekly registrations),
recomputed hourly. Full design in [`discovery-v2.md`](discovery-v2.md).

**Alternatives considered**:

- **User-driven uptime** (browser clients report reachability). Rejected:
  leaks which users checked which hubs — the user-level tracking
  sovereignty forbids. Server-side probing needs no trust relationship
  and no user identity.
- **Reusing the farm heartbeat** ([`farm-impl.md`](farm-impl.md)) as the
  uptime signal. Rejected: hubs authenticate to their farm but not to
  discovery; discovery probes anonymously. Keeping discovery a non-trusted
  prober is deliberate.
- **Farms as tagged hub listings.** Rejected: a farm is an infrastructure
  provider, not a community; its metadata (pricing, capacity, onboarding)
  and the user intent ("pick a host") don't overlap with hubs.
- **A dedicated search service (Elasticsearch/Meilisearch).** Rejected:
  catalogs are hundreds to low thousands of entries; FTS5 covers it with
  no second datastore to deploy and sync.
- **Per-hub usage analytics** (member counts, message volume). Rejected:
  requires hubs to report private operational data to discovery,
  inverting the probe relationship. The project does not know what
  communities do with the software; catalog counts are the only data
  discovery legitimately has.

**Why this won**: every choice falls out of the sovereignty principle —
discovery is a catalog, not a surveillance layer. It knows what operators
publish and what its own probes observe, and nothing about users, message
content, or who looks up what. The cheapest design that respects that
boundary is server-side probing plus counts of the registry discovery
already maintains.

---

## Hub creation: self-submitted signed templates + empty-DB bootstrap, not a curated catalog or a separate command

**Decision**: hub config templates are Ed25519-signed JSON documents
self-submitted to Wavvon-discovery (`POST /api/templates/register`),
authored by their signing key with no discovery account — the same
signed-listing primitive hubs, bots, games, and farms already use. A hub
applies a template on first launch from the empty-`channels` branch of
`db::migrations::run`, triggered by `WAVVON_BOOTSTRAP_TOKEN` (wizard-
customised config) or `WAVVON_TEMPLATE_URL` (raw defaults), and never
again (a `bootstrapped_at` marker makes it idempotent). The web wizard at
`discovery.wavvon.app/new` ties them together and emits either a one-click
managed-farm hub or a pre-filled Docker/binary command. Full design in
[hub-creation-wizard.md](hub-creation-wizard.md).

**Alternatives considered**:

- **Curated-only template catalog** (discovery vets and publishes a fixed
  set). Rejected on sovereignty grounds: it would make discovery the one
  authority deciding what a hub can start as, breaking the open
  self-submission rule every other catalog follows. A `featured` flag
  stays as a display hint, never a gate.
- **A separate `wavvon-hub bootstrap` subcommand.** Rejected: it adds a
  command the operator must remember and sequence, and risks double-runs.
  Folding bootstrap into the empty-DB migration branch fires it exactly
  once, automatically.
- **Wizard inside the desktop client.** Rejected: the wizard must be
  reachable before any hub or client exists, and serves people generating
  Docker/binary commands who have no client. A web page on discovery is the
  zero-install entry; the in-client create-a-hub flow
  ([farm-impl.md](farm-impl.md)) covers the already-on-a-farm case.
- **Silent auto-registration with the directory.** Rejected as default:
  listing a hub publicly is a choice, so the default logs/pre-fills the
  registration command and full hands-off registration is opt-in via
  `WAVVON_DISCOVERY_AUTOREGISTER=true`.

**Tradeoff**: templates are one-shot at first launch and advisory, not
binding — there is no story for re-applying an updated template to a hub
already bootstrapped, and an operator can override any seeded setting
immediately. We accept this because a live re-templating mechanism would
have to reconcile operator edits against template changes, which is a
migration problem the starting-point model deliberately avoids.

---

## Admin tooling: a bearer admin token separate from user keypairs, plus an offline DB CLI

**Decision**: hub administration gets three surfaces, none of which
mixes credentials across the two axes. The **web admin panel** at
`{hub-url}/admin` is gated by a `web_admin_token` — a 32-byte hex value
generated on first start, stored in `hub_settings`, printed once to the
log — carried as `Authorization: Bearer <token>`, and entirely separate
from user session tokens. The **admin CLI** (`wavvon-hub admin ...`)
operates directly on the local SQLite DB with no HTTP and no running
hub, gated by filesystem access alone. The **farm console** is the
farm-axis sibling, gated by the farm admin's keypair session
(`farms.admin_pubkey`) and fed by a hub→farm `POST /farm/heartbeat`
push. Full design in [`hub-admin-panel.md`](hub-admin-panel.md).

**Alternatives considered**:

- **Reuse the desktop client's keypair-authed Hub Admin page as the only
  admin surface.** Rejected as the sole surface: it forces an admin user
  session, which an operator may not have during setup or while
  troubleshooting an auth problem. The bearer-token web panel works with
  no keypair; the desktop page stays as the member-facing admin UI.
- **A user-session token that also grants admin.** Rejected: a
  compromised user session would then grant admin. A dedicated token
  with no membership semantics keeps the blast radius of a leaked chat
  session away from operator powers.
- **Admin only over HTTP, scripted locally.** Rejected as the primary
  CLI path: it needs the hub running and a credential, and pays HTTP +
  auth cost per call. Direct-DB access works offline and is faster for
  bulk fixes — the right shape for a maintenance tool. The HTTP API
  still exists; the CLI is its offline complement.
- **Farm console polls each hub's admin token.** Rejected: it would push
  hub-axis secrets into the farm-axis tool. Hubs already authenticate to
  the farm, so a signed hub→farm heartbeat push reuses existing trust
  and keeps every admin token on its own hub.
- **A farm-wide ban store.** Rejected: a ban is a community-axis
  decision ([`home-hub.md`](home-hub.md)); the farm console fans the
  same per-hub ban out to many hubs rather than recording a hosting-layer
  ban. No community-axis state moves to the farm.

**Tradeoff**: a second secret to manage (the web admin token) and a
single shared token in v1 rather than per-operator scoping — accepted
because the token is shown once for a password manager and rotatable,
and per-operator scoping waits for a real multi-operator hub. The web
panel is localhost-only by default (`WEB_ADMIN_ALLOWED_ORIGINS` to
widen) so a hub on a public IP doesn't expose `/admin` by accident.

**What changes on the implementation side**:

- *Hub* (Wavvon-server): `GET /admin/panel` (embedded HTML),
  `GET /admin/stats`, a `web_admin_token` row + once-only log line, a
  bearer guard distinct from the session middleware, a
  `WEB_ADMIN_ALLOWED_ORIGINS` CORS gate, token rotation; a
  `wavvon-hub admin` clap subcommand tree opening its own short-lived
  `SqlitePool`; a 60s heartbeat task POSTing `/farm/heartbeat` when
  `WAVVON_FARM_URL` is set.
- *Farm* (Wavvon-server `farm/`): `POST /farm/heartbeat` (verifies hub
  Ed25519 sig, upserts `hub_heartbeats`), `GET /farm/admin/console`,
  farm-level ban + propagation fan-out to each hub's ban route.
- *Client* (Wavvon-desktop, mirrored web/Android): no change for the web
  panel (browser-served); the farm console UI extends the Phase 3B Farm
  Settings view with a heartbeat-driven Hub Fleet panel, cross-hub user
  search, and ban-propagation approval.

## Moderation enhancements: signed opt-in ban lists, fail-open webhook, hub-local report queue

**Decision**: three additions that extend moderation without ever
creating a global authority. (1) **Federated ban lists** — a hub
publishes a signed `GET /federation/banlist` (Ed25519 over the canonical
payload, the single-hop badge/token primitive); subscribers opt in per
source, choose hard-reject or soft-flag per source, and local overrides
always win. The enforcement point is `/auth/verify`, resolving subkey →
master. (2) **Auto-moderation webhook** — synchronous pre-store
allow/block POST to an operator-configured URL, HMAC-signed, 500ms
timeout, **fail-open** on timeout/error, circuit-breaker after 3
consecutive 5xx. (3) **Content reporting** — `POST /messages/:id/report`
into a hub-local admin queue, dedup on `(message_id, reporter_pubkey)`,
reporter hidden from non-admins, no public report count. Full design in
[`moderation-enhancements.md`](moderation-enhancements.md).

**Alternatives considered**:

- **DHT / global blocklist** instead of per-hub opt-in subscription.
  Rejected: a universal list means someone owns a platform-wide kill
  switch — the central authority Wavvon refuses
  ([`threat-model.md`](threat-model.md)). Opt-in subscription gives the
  same reach (popular curators emerge) with no global coordination.
- **Reusing the badge/cert primitive for ban signals.** Rejected: badges
  certify hubs and certs certify users in good standing
  ([`hub-certifications.md`](hub-certifications.md)) — overloading
  "absence of a good-standing cert" as a ban conflates "unknown" with
  "bad." A dedicated endpoint with its own signing context keeps the
  positive and negative reputation channels separate.
- **Fail-closed webhook** (block when the moderation service is down).
  Rejected: a flaky operator-owned service would silently mute the whole
  hub. Degrading to "no moderation" is the sovereignty default; the
  circuit breaker bounds the cost of a broken service.
- **Async post-store moderation** (store, fan out, delete if blocked).
  Rejected: the message reaches WS subscribers before the delete — the
  exact leak moderation exists to prevent. Pre-store is the only point a
  block is real.
- **Anonymous reporting via hash commitment** in v1. Rejected: removes
  the admin's ability to weigh and rate-limit a serial false-reporter,
  and the commitment scheme isn't warranted until abuse appears.
- **Cross-hub reporting.** Rejected for v1: moderating a community's
  messages is community-axis state on that community's hub (the two-axis
  rule); federated ban lists are the cross-hub tool.

**Tradeoff**: federated bans are per-master-pubkey, so a banned user
minting a fresh identity evades them — the same Sybil limit as every
pubkey-keyed control, deferred to the lobby/PoW design. The webhook's
fail-open default means a misconfigured or down service moderates
nothing; we accept that over the alternative of taking a hub offline.
None of the three propagates a hub's decisions to peers without an
explicit opt-in on both ends.

**What changes on the implementation side**:

- *Hub* (Wavvon-server): `GET /federation/banlist` publisher + 6-hour
  sync job + `/auth/verify` gate in `hub/src/routes/federation.rs`; the
  pre-store webhook dispatch (reusing the bot webhook HTTP/signing helper,
  [`bots.md`](bots.md)) in the message-create path; `POST
  /messages/:id/report` + `GET /admin/reports` + review route reusing the
  existing `hub/src/routes/moderation.rs` ban/delete handlers; migrations
  for `federated_bans`, `message_reports`, and the new `hub_settings`
  columns (`banlist_sources` + per-source policy, `moderation_webhook_url`,
  `moderation_webhook_secret`). Admin routes gate on `manage_users`.
- *Client* (Wavvon-desktop, mirrored web/Android): ban-list source +
  override admin UI and soft-flag review surface; webhook settings panel
  with circuit-breaker state; "Report message" context-menu action and an
  admin "Reports" queue tab.

**What's deferred**: ban-entry TTL, transitive source trust, a curated
public-list directory in Wavvon-discovery, signed un-ban receipts;
webhook message-editing, per-channel routing, multi-service chaining,
attachment-content scanning; anonymous reporting, report-time content
snapshots, reporter-reputation auto-escalation, cross-hub reporting.

## Identity recovery: passphrase-wrapped backup file + social recovery as vouch-not-grant

**Decision**: the two recovery layers above the shipped phrase are (a) a
client-side **`.wavvon-backup`** export — the identity seed sealed with
Argon2id + AES-256-GCM under a user passphrase, saved to a
user-chosen location, with a self-describing JSON envelope (`version`,
KDF params, nonce) — and (b) **recovery contacts**: per-hub,
community-axis trusted master pubkeys who can sign a scoped attestation
("this new key is the same human as this old key") toward a
threshold K. Reaching K only routes a key-rotation request into the hub
admin's review queue; a **human admin** makes the actual role grant and
scopes which roles transfer. Owner-role rotation is excluded from the
social path (needs a pre-designated successor or a second
owner-equivalent admin). Full design in
[`identity-recovery.md`](identity-recovery.md).

**Alternatives considered**:

- **Auto-grant at threshold K** (contacts' signatures directly restore
  roles). Rejected: K colluding or compromised contact keys could
  silently seize an admin's roles with no human in the loop. Threshold
  as a *filter for admin attention* keeps the existing approval-queue
  trust model (the hub admin is already the authority on their own hub
  per [`threat-model.md`](threat-model.md)) and lets the admin scope the
  transfer. The cost is recovery isn't fully self-service — accepted.
- **Recovery contacts as personal-axis state on the home hub list.**
  Rejected: vouching is a *place's* decision to re-grant *that place's*
  roles, so the designation belongs on the community hub whose roles are
  at stake — the [`home-hub.md`](home-hub.md) person-vs-place rule. Each
  hub stores its own contact set and decides independently; there is no
  cross-hub propagation (federation has no global source of truth).
- **Backup auto-synced to the home hub list** (convenience). Rejected for
  v1: it concentrates the highest-value secret (the passphrase-wrapped
  seed) on hubs the threat model already flags as
  observing/withholding surfaces. The backup stays a user-placed file —
  the same sovereignty call as self-hosting.
- **A separate encryption key / passphrase-verifier field in the
  envelope.** Rejected: the GCM tag *is* the integrity-and-passphrase
  check; a separate verifier leaks a check oracle and the KDF output is
  the AES key directly. Argon2id params live in the file so cost can rise
  later without breaking old backups.
- **Hard passphrase-strength gate on export.** Rejected: forced
  complexity trains sticky-note passphrases. The strength meter is
  advisory with a clear warning; Argon2id raises the offline-guessing
  floor regardless.
- **Treat backup import and device pairing as one flow.** Rejected — they
  differ fundamentally: import *moves the master seed* and replaces the
  device's identity (no revocation, file = phrase compromise), while
  pairing ([`multi-device.md`](multi-device.md)) mints a *revocable
  per-device subkey* and never moves the master over the wire. The UI
  keeps them distinct: pair when you have a working device, import only
  when you have none.

**Tradeoff**: social recovery deliberately is not fully automatic — a
human admin is in the loop, and a solo hub owner who loses their key and
pre-designated no successor cannot recover the irrevocable owner crown
(only membership and non-owner roles). We accept that sharp edge because
the alternative (auto-granting owner on K signatures) would make the most
dangerous role on a hub seizable by a quorum of contact keys. Backup
import replacing an existing identity is guarded by a fingerprint-compare
and a double-confirm rather than prevented, matching the existing
phrase-paste-replaces semantics in [`identity.md`](identity.md).

**What changes on the implementation side**:

- *Client* (`Wavvon-desktop`, mirrored web/Android): backup export/import
  Tauri commands in `desktop/src-tauri/src/lib.rs` (Argon2id + AES-GCM in
  Rust; seed never enters the webview); export wizard, import + conflict
  modal, "restore from backup" welcome-screen entry; recovery-contact
  owner/contact/requester UI and an admin "Recovery requests" tab.
- *Hub* (Wavvon-server): new `hub/src/routes/recovery.rs`
  (`PUT/GET/DELETE /recovery/contacts`, `POST /recovery/rotation-request`,
  `GET /recovery/rotation-request/:id`, `POST .../attest`,
  `GET /admin/recovery/requests`, `POST .../decide`); migrations for
  `recovery_settings`, `recovery_contacts`,
  `recovery_rotation_requests`, `recovery_attestations`; admin routes gate
  on `manage_users`.
- *Identity crate* (Wavvon-server, `identity/src/lib.rs`): the shared
  bound-bundle signing helper — master-key sign over
  `(hub_pubkey, old_pubkey, new_pubkey, nonce)` — so client and hub agree
  on the exact bytes an attestation covers.

**What's deferred**: backup auto-sync to home hubs; cross-hub recovery
propagation (waits on portable hub-certifications); contact-set rotation
history; reliable in-app push to contacts (out-of-band request id for
v1); QR-assisted request hand-off; a full hub line-of-succession model
beyond a single owner-signed successor pubkey.

## Block / Ignore / DND: personal-axis state, client-side filtering, one server-enforced bit for DMs

**Decision**: the user-level toolset is three independent features
sharing the home-hub prefs blob (personal-axis state) and one settings
surface. **Block** (strongest) is global by master pubkey: messages
hidden client-side behind a collapsible placeholder in shared channels,
voice muted client-side, mentions-from-blocked suppressed, and DMs
**server-enforced** at the recipient's home hub. **Ignore** is a softer
chat-only variant — same client-side message collapse, but no DM block
and mentions still notify. **Quiet hours / DND** is a read-time
transform that downgrades every channel's notify mode one step
(`all`→`mentions`, `mentions`→`silent`, `silent` stays), via a
sidebar-footer quick-toggle and an optional schedule. Block/ignore/DND
all live in the encrypted prefs blob; the only thing that leaves it is a
plaintext **DM-block set** projection on the home hub so it can reject
inbound DMs. Full design in [`block-mute-ignore.md`](block-mute-ignore.md).

**Alternatives considered**:

- **Per-hub block lists on each community hub.** Rejected: makes the
  block public to every hub operator, requires N writes that drift, and
  can't cover a federated DM from someone whose community you don't
  share. Personal-axis state belongs on the home hub list, not sprayed
  across community hubs (the two-axis rule).
- **Block as one feature with sub-toggles** instead of distinct Block
  and Ignore. Rejected on the same grounds the notifications and lobby
  designs reject bundling — two clear verbs ("sever" vs "quiet") each map
  to one mental model; a matrix of toggles forces every user to reason
  about all of it.
- **Fully hide blocked messages (absent, not collapsed).** Rejected:
  breaks reply/thread context and makes others' quotes incomprehensible.
  A one-line click-to-reveal placeholder keeps the conversation legible
  while honoring the block.
- **Pure client-side block with no server enforcement.** Rejected for
  DMs specifically: a client filter can't stop a DM from being stored on
  the home hub and pushed to other devices. DM blocking is the one part
  that must be server-side; everything else stays client convenience.
- **DND as a fourth notification mode.** Rejected: keeps the matrix at
  three modes and one knob (the notifications decision's constraint).
  DND is a global one-step downgrade applied at notify time, not stored
  per channel.
- **Tell the hub to stop relaying a blocked user's voice.** Rejected: a
  community-visible side effect of a private action, and the relay has
  no per-listener filtering. Client-side gain-to-zero is private and
  needs no protocol change.

**Tradeoff**: block isn't *purely* private — the recipient's home hub
holds a plaintext DM-block set (the pubkeys denied DM access) so it can
enforce. We accept that single-bit leak because it's scoped to the home
hub that already stores the DM inbox, and it's the minimum needed for
enforcement the client can't do. The full block list, the ignore list,
and DND all stay inside the encrypted blob. Block is per-master-pubkey,
so a determined abuser minting a fresh identity evades it — same
limitation as every pubkey-keyed control; anti-Sybil is the lobby/PoW
design's job, not block's.

**What changes on the implementation side**:

- *Storage* (Wavvon-server home-hub prefs blob, per
  [`home-hub.md`](home-hub.md)): `blocks`, `ignores`, `dnd` fields
  inside the encrypted blob. New plaintext DM-block set with
  `PUT/GET /identity/dm-blocks` routes.
- *Hub DM ingestion* (`hub/src/routes/dms.rs` and
  `hub/src/federation/handlers.rs`, Wavvon-server): block-set check
  before store-and-push; success-shaped response when blocked.
- *Client* (Wavvon-desktop, mirrored web/Android): migrate
  `blocked_users.json` / `load_blocked_users` / `save_blocked_users` to
  read the blob when home hubs exist, local file as legacy fallback;
  context-menu / profile-card / DM-header block+ignore actions;
  collapsible blocked/ignored-message placeholder; voice local-mute;
  notification gate updates (block suppresses mentions, ignore doesn't,
  DND downgrade transform); sidebar-footer DND quick-toggle +
  Quiet-hours schedule; Settings "Blocked & Ignored" management list.

**What's deferred**: block-by-IP/device, expiring blocks, block-a-whole-
hub, voice mute of an ignored (non-blocked) user, reporting / shared
blocklists (hub-certifications space), a "restrict" middle tier, and
per-device DND overrides.

## Screen share v2: WebRTC P2P with the hub as signaler, TURN optional, v1-relay as the universal floor

**Decision**: migrate the screen-share transport to WebRTC. The hub becomes a pure SDP/ICE signaler (offer/answer/candidate forwarding over the existing chat WS) and carries zero media bytes; the sharer holds one `RTCPeerConnection` per viewer and uploads SRTP directly. TURN relay is **optional per hub** (operator-configured), and the v1 hub-relayed chunk path is **retained as the universal fallback floor**: a (sharer, viewer) pair that can't traverse NAT and has no working TURN degrades to v1 chunk relay for that one viewer. Transport is negotiated per (sharer, viewer) pair via a `screen_share_v2` capability in `/info` plus a runtime `RTCPeerConnection` probe; the sharer stamps `transport: "webrtc" | "chunks"` on `ScreenShareStart`. Full design in [`screen-share-webrtc.md`](screen-share-webrtc.md).

**Alternatives considered**:

- **Require TURN to ship v2** — rejected: forcing every hub operator to run or pay for a TURN server contradicts the run-it-on-a-home-box ethos. Making TURN optional and keeping v1-relay as the floor means v2 ships with no new mandatory infrastructure; TURN only lowers the relay-fallback rate.
- **SFU from the start** — rejected as premature: an SFU solves the sharer-uplink case (many viewers, one upload) but is a hub-operated media server, far more than the egress problem that triggers v2 requires. Deferred to v3; the signaling is forward-compatible with an SFU as a special peer.
- **Client-version string as the v1/v2 gate** — rejected: repos version independently and wire-compat is the contract (`packaging.md`). A `/info` capability flag plus runtime WebRTC probing is the federated-correct, reliable gate.
- **Drop v1 once v2 lands** — rejected: Linux WebKitGTK frequently lacks a compiled-in WebRTC stack (`ENABLE_WEB_RTC` + GStreamer `gst-plugins-bad`, X11-only), and macOS WKWebView effectively can't do embedded peer connections. v1 must remain the floor for those clients.

**Tradeoff**: WebRTC moves egress off the hub (0 vs N×2.6 Mbps) and cuts latency to ~100 ms, at the cost of an entirely new peer-connection lifecycle (ICE/STUN/TURN, per-viewer uploads, renegotiation) and a non-uniform WebView story (Windows/Android Chromium = full support; Linux = fragile; macOS = no). The per-(sharer,viewer) negotiation with automatic v1 fallback absorbs that non-uniformity without a flag day. P2P's own limit — sharer uplink scales with viewer count — is explicitly left to the v3 SFU.

**Multiple sharers**: enabled. The data model keys `ActiveShare` by `(channel_id, sharer_pubkey)` so each user holds an independent share slot — no per-channel cap enforced at the hub level. The use-case is co-op gaming: teammates stream their screens simultaneously and viewers overlay each window (floating, movable, resizable) on top of their own game — like picture-in-picture but per-participant. The deferred cost is the viewer-side tiling/overlay UI; the hub is already correct.

**Supersedes**: the v2 sketch in [`screen-share.md`](screen-share.md) "Transport — v2" and the v2 pointer in the "Screen share v1" entry below. Those described a single `ScreenShareSignal` envelope and an unconditional TURN fallback; this entry is the authoritative v2 design and splits signaling into explicit offer/answer/ice/join/leave variants with the optional-TURN + v1-floor fallback ladder.

## Hub certifications: hub-signs-user attestations, auto-issue on standing, portable PoW credit, no web of trust

**Decision**: anti-spam Layer 2 is **hub certifications** — an issuing hub signs a canonical payload asserting a user (by **master** pubkey) has been a member in good standing since date Y, carrying the highest PoW level the hub verified plus advisory capability hints. The cert reuses the **same Ed25519 signer as badges** ([`server-tags.md`](server-tags.md)) with a `subject_kind: "user"` discriminant — badges certify hubs, certs certify users, one primitive. Certs **auto-issue** on a standing threshold (default 30 days good standing, admin-tunable, admin can also manual-issue or turn auto off). The user's portfolio lives on the **home hub list** ([`home-hub.md`](home-hub.md)) as opaque issuer-signed blobs (personal-axis); the issuer keeps a `cert_issuances` ledger (community-axis). Presentation is **both** push-at-`/auth/verify` and pull from `GET /identity/:master/certs`. A receiving hub gates admission via `cert_mode` + a **trusted-issuer list** and/or a **property rule** (`min_pow_level`, `min_member_since_days`), advertised on `/info`. Revocation is **expiry (always set, default 90d) + re-issue-as-revoked**. Cross-hub portable PoW credit is the headline payoff: a hub trusts a cert's carried `pow_level` instead of recomputing. Full design in [`hub-certifications.md`](hub-certifications.md).

**Alternatives considered**:

- **Store the portfolio client-side only in `identity.json`.** Rejected: it's trapped on one device, lost on wipe, and invisible to other paired devices — exactly the personal-axis problems the home hub list exists to solve. The home hub list is the canonical store; `identity.json` is a cache.
- **Manual-only issuance.** Rejected as the default: too much admin toil, so most legitimate members never get a cert and the portfolio stays empty. Manual issuance is kept as an admin option (pre-threshold vouch); auto-on-standing is the default that makes the feature actually populate.
- **PoW-level-triggered issuance.** Rejected: PoW proves CPU burned, a cert proves a hub observed behaviour over time — different signals. PoW level rides *inside* the cert rather than gating issuance; a hub may opt into `cert_min_pow_level` but it isn't the trigger.
- **A global "trusted hubs" set / web of trust** ("trust ≥ level 15 from any trusted hub network-wide"). Rejected on the same grounds as badge transitivity — it reintroduces global trust reasoning the federated model refuses. Trust stays one hop: a property rule accepts any validly-signed cert; the trusted-issuer list names specific hubs. Composing them gives "PoW ≥ 15 from a hub I named" with no global graph.
- **Live `/info` issuer check on every auth.** Rejected: a join flood would hammer issuers. The signature is the authority; the pubkey↔URL `/info` check is cached (6h TTL) and only needed for display and trust-list matching.
- **No expiry + a mandatory revocation registry.** Rejected: a signed blob can't be un-signed, and a global registry is coordination we don't want. Always-set expiry + auto-renew + re-issue-as-revoked-on-pull is the badge/farm-token posture; the polled revoke-check endpoint is deferred.
- **Certifying device subkeys instead of the master.** Rejected: a cert is about the durable identity and must survive device rotation. Subject is always the master pubkey (legacy single-key identities are their own master/subkey-0, so no re-issue on migration).

**Tradeoff**: portable PoW credit means a bot can burn PoW once and carry a level-N cert to many hubs — but a *good-standing* cert also costs surviving `cert_min_age_days` un-banned on a real hub, the behavioural cost PoW alone can't impose; the two layers compose rather than overlap. Presenting a cert leaks "I'm a good-standing member of hub X" to the target, so the client presents only the subset satisfying the target's advertised requirement, never the whole portfolio. The admission gate adds real admin configuration surface (`cert_mode` + two rule shapes) and a verification path on the auth hot-path, accepted because it's the only cross-hub answer to "trusted somewhere, new everywhere" and because each piece (signer, home-hub store, `/info` advertise) reuses an existing primitive.

**What changes on the implementation side**:
- *Shared signer* (`hub/src/federation/`): `subject_kind: "user"` arm + `CertPayload` on the badge signer.
- *Issuing hub DB* (`hub/src/db/migrations.rs`): `cert_issuances`, `cert_revocations` tables; `hub_settings` rows `cert_auto_issue`, `cert_min_age_days`, `cert_validity_days`, `cert_min_pow_level`, `cert_mode`, `cert_trusted_issuers`, `cert_require`.
- *Home hub DB* (`hub/src/routes/identity.rs`): `user_certs` portfolio table, replicated write-to-all / read-from-any.
- *Issuing-hub routes*: `GET /certs/me`, `POST /admin/certs/issue`, `POST /admin/certs/revoke`, deferred `GET /certs/revocations`; periodic issuance sweep.
- *Home-hub routes*: `GET /identity/:master/certs`, `PUT /identity/:master/certs`.
- *Receiving-hub auth* (`hub/src/auth/{handlers,middleware}.rs`): `/auth/verify` accepts `certifications[]`; `cert_mode` verification can skip lobby / accept carried `pow_level`. `GET /info` (`routes/health.rs`) gains `cert_requirement`.
- *Client* (`Wavvon-desktop`, mirrored web/Android): portfolio cache in `identity.json`; Tauri `fetch_my_cert`, `list_my_certs`, `present_certs_for`; Settings "Reputation" view, Add-Hub requirement hint + auto-attach, admin Hub Settings → "Certifications" tab.

**What's deferred**: web of trust / transitivity; the polled issuer revoke-check endpoint; cross-farm cert relay; negative reputation / shared ban lists; certs as a discovery/ranking signal; capability certs as actual grants (advisory only in v1); per-device cert presentation policy.

## Gaming Tier 2: chat-WS envelope family, in-memory state + opt-in snapshot, hub-local scope

**Decision**: Tier 2 party multiplayer (≤20 players) piggybacks the existing chat WebSocket with a `game_*` envelope family rather than opening a dedicated socket per session. Session state is in-memory on the hub by default (matches the 10–30 min ephemeral party-game shape) with an opt-in DB snapshot via `wavvon:game:snapshot` for longer matches. Alliance/cross-farm scope is deferred to Tier 3. Full design in [`gaming.md`](gaming.md) — Tier 2 section.

**Alternatives considered**:

- **Dedicated WS per game session** — rejected: re-pays for auth, membership, presence, reconnect, and broadcast that the chat WS already provides. The screen-share WS-relay decision is the precedent; a dedicated multiplexer is the documented escape hatch if mixing causes latency problems.
- **DB-first session state** — rejected as the default: most party games end in under 30 min and writing every move to SQLite adds I/O for no benefit; in-memory is correct and opt-in snapshot covers the long-game case.
- **Alliance scope in Tier 2** — deferred: the host/joining-hub relay is the same shape as federated DMs and cross-farm play; deferring to Tier 3 where that infrastructure is designed is the right cut.

**What changes on the implementation side**: in-memory `GameSession` map in hub `AppState`; `game_sessions` and `game_shared_kv` DB tables (opt-in snapshot + shared KV); `game_*` WS envelope family (`game_session_created`, `game_state_update`, `game_player_joined/left`, `game_ended`); 6 new routes in `hub/src/routes/games.rs`; `multiplayer` capability in the admin grant model (Tier 1 pattern extended); Tier 2 SDK additions (`wavvon:game:*` postMessage calls); Activities button and bot launch card both feed the same session path.

**What's deferred**: cross-hub/cross-farm sessions (Tier 3), proximity voice (Tier 3), session replay, spectator mode, ranked/persistent leaderboards.

## Forum channel type: posts + reply threads, channel_type discriminant, no voice

**Decision**: add a `channel_type TEXT DEFAULT 'text'` column to `channels`. A `'forum'` channel replaces the continuous message stream with an ordered list of titled posts, each with a nested reply thread. Forum channels are leaves in the channel tree — same schema position as text channels — but carry no voice. The type is fixed at creation (no conversion). Two new permissions: `create_posts` (start threads) and `manage_posts` (moderate); `send_messages` gates replies. Full design in [`forum.md`](forum.md).

**Alternatives considered**:

- **Reuse `send_messages` for post creation** — rejected: the primary use case is channels where only curated members start threads (announcements, patch notes, bug reports); collapsing create-post into send-messages forces admins to either grant full chat or deny forums entirely.
- **Reuse `manage_games` for post moderation** — rejected: unrelated permission domains. A member managing game installs shouldn't inherit forum moderation, and vice versa.
- **Allow type conversion (text ↔ forum)** — deferred. Migrating existing `messages` rows into `posts` is non-trivial; fixed-at-creation is safe and conversion can be added later with a migration path.
- **Per-post read cursors for unread tracking** — deferred. Post-level read state maps naturally onto the existing channel-level unread model; lands when per-post cursors are designed.

**What changes on the implementation side**: new `channel_type` column (additive); `posts`, `post_replies` tables and `posts_fts` FTS5 virtual table; `hub/src/routes/posts.rs` (12 routes); `post_models.rs` wire types; 6 WS envelope variants; `ForumPostList`, `ForumPostDetail`, `ForumComposer` client components across desktop/web/android; `create_posts` and `manage_posts` permissions.

**What's deferred**: federation across alliances, per-post read cursors, post reactions, attachments, type conversion, hub-wide cross-channel search.

## Gaming Tier 1 platform: URL-first registry, admin-granted capabilities, six-call SDK, farm-level install + per-hub enable

**Decision**: the Tier 1 gaming platform is fully specified beyond the
Activities button. (a) **Registry**: URL-first install is the protocol
primitive (paste a manifest URL / quick-install by entry URL, always
works, no central dependency); an optional self-submitted, self-signed
catalog on `Wavvon-discovery` is a convenience browse layer on top,
reusing the hub/farm signed-listing primitive. No central project-hosted
catalog gatekeeps installs. (b) **Permissions**: every game starts in
the minimal read-only sandbox; a hub admin may grant a small closed set
of capabilities (`post_message`, `read_channel_history`,
`list_channel_users`), never default-on, always bounded by the launching
user's own permissions and scoped to the launching channel/session; the
player sees a one-line disclosure strip when any capability is granted.
(c) **SDK**: six Tier 1 calls — `getUser`, `getContext`,
`getChannelUsers`, `postMessage`, `getRecentMessages`,
`kvGet`/`kvSet` — request/reply only, no live events. The per-user KV is
keyed `(game_id, user_pubkey)` and is personal-/farm-axis state.
(d) **Farm progression**: a game is installed once on the farm and each
hub enables/disables it; the per-user KV lives on the farm so progress
follows the user across hubs; effective capability = farm grant ∩ hub
grant. Full design in [`gaming.md`](gaming.md).

**Alternatives considered**:

- **A central project-hosted game catalog as the only install path.**
  Rejected on the same sovereignty grounds as a central hub registry —
  it makes the project the arbiter of which games exist on a federated
  network, and it can't be enforced (URL install always exists; a fork
  strips the check). URL-first primitive + optional aggregator is the
  hub/farm discovery pattern applied verbatim.
- **Per-hub list with no catalog at all** (freeze today's shape).
  Rejected as the whole answer: no discovery surface. The catalog is
  additive on top of the URL primitive, not a replacement.
- **Federated registry (DHT/gossip of manifests).** Rejected — same
  verdict as DHT hub discovery: complexity without payoff at this scale.
- **Fixed read-only sandbox forever, no capabilities.** Rejected:
  reasonable Tier 1 games (trivia, polls) need a scoped write surface;
  pushing them to Tier 2 over one posted message is the wrong cut line.
- **Author-declared capabilities that auto-grant on install.** Rejected
  — lets an author self-escalate by editing their own manifest. The
  admin grants; the manifest may only request (advisory).
- **Keep games per-hub even on a farm** (N copies). Rejected — duplicates
  the manifest and fractures the per-user KV so progress wouldn't follow
  a user between two hubs on the same farm.
- **Farm-global auto-enable with no per-hub opt-in.** Rejected — a hub
  admin must control what appears in their community. Install (farm) and
  enable (hub) are two distinct actions on two layers.
- **Live presence/message events pushed to the iframe in Tier 1.**
  Rejected for Tier 1 — request/reply only keeps the surface small; live
  event streams are the Tier 2 WS-multiplexer's job.

**Tradeoff**: the capability system adds admin configuration surface and
a hub-side enforcement path on every gated SDK call (post, history,
user-list), and the farm grant ∩ hub grant rule is a small but real
piece of cross-layer logic. We accept it because a strictly read-only
Tier 1 can't host the games people actually ask for, and because the
capability set is closed and small (three verbs) rather than an
open-ended permission language. The catalog being a convenience and not
the install mechanism means the platform has zero hard dependency on a
project-operated service — the cost is that discovery is only as good as
the optional aggregator until ranking is designed.

**What changes on the implementation side**:

- *Hub* (Wavvon-server `hub/`): `channel_games` table (channel-scope
  set), `game_permissions` grant column on the game row,
  `GET /games` (player view), `GET/POST/DELETE /admin/games`,
  `PUT /admin/games/:id/channels`, `PUT /admin/games/:id/permissions`,
  `enabled_games` table (farm-mode enable flag). Hub-side enforcement of
  the gated SDK calls (post-as-user permission check, history scoping,
  user-list scoping) and the KV store (un-farmed hubs).
- *Farm* (Wavvon-server `farm/`, when farm games land): `games` table
  (manifest + grant), `game_kv` table (`(game_id, user_pubkey)`),
  `POST/DELETE /farm/games`, `GET /farm/games/:id`; farm-admin gating
  reusing `farms.admin_pubkey`.
- *Discovery* (Wavvon-discovery, deferred with the farm-listing work):
  `POST/DELETE /games/register`, `GET /games` — signed-listing primitive
  mirrored from the farm listing extension.
- *Client* (Wavvon-desktop, mirrored web/Android): Hub Settings → Games
  tab (inventory, install incl. catalog browse, per-channel
  enable/disable, capability grant UI), the launch-modal capability
  disclosure strip, and the five new SDK calls wired into the parent
  `message` handler alongside `wavvon:getUser`.

**What's deferred**: Tier 2 (multiplayer instances, live events to the
iframe, shared/global KV, synthetic game identity, matchmaking,
cross-farm sessions); Tier 3 (proximity voice, persistent MMO world);
catalog ranking by install count (anti-gaming design unsolved, shared
with monetization paid-placement); per-hub capability expansion beyond a
farm grant; embeds/attachments in `postMessage`; native WASM module
host.

## Monetization: missions + donations + farm hosting, no subscriptions/premium tiers

**Decision**: Wavvon funds itself through (1) a cosmetic-only
**missions** system where sponsors pay the project per attested,
user-initiated action and users earn cosmetic-only "sparks"; (2) plain
donations; and (3) managed **farm hosting** plans that sell operations,
not software features. No subscriptions, no premium tiers, no
capability ever locked behind money. Money flows sponsor → project (and
donor → project, hosting customer → operator); the user is never
charged and never loses access for having a zero balance. Full design
in [`monetization.md`](monetization.md).

**Alternatives considered**:

- **Subscriptions / premium tiers (a "Nitro"-style paid upgrade).**
  Rejected. It splits the user base into paying and non-paying, which
  only works by making the free product deliberately worse — directly
  contradicting "free for everyone, forever." It is also structurally
  unenforceable on a federated network the project does not own: a
  community hub the project doesn't operate can't be made to gate
  features on a Wavvon payment, and a fork strips the check trivially.
  The whole model assumes a central authority over the user's
  experience that Wavvon's sovereignty pillar refuses to have.
- **Advertising in chat/voice surfaces.** Rejected on the same
  no-surveillance posture as [`threat-model.md`](threat-model.md) and
  the channel-as-place model — the conversation surface stays ad-free.
- **Selling telemetry / user data.** Rejected on sovereignty grounds,
  consistent with the rejected central identity service.
- **Missions as the sole funding line.** Rejected as a *sole* line:
  forks can disable the Missions panel, so missions are upside, not the
  base. Donations + farm hosting are the durable floor.

**Tradeoff**: the cosmetic-only rule is a permanent constraint that
will be tempting to violate (a "supporter" cosmetic that quietly grants
priority or larger uploads is the subscription model in disguise). We
accept holding that line forever because the alternative collapses the
free-product promise. Mission attestation without surveilling users is
genuinely hard and invites spark-farming fraud; PoW gating on
redemption plus per-pubkey limits are the first defense and a full
anti-fraud design is deferred.

**What changes on the implementation side**: a new project-operated
**mission service** (likely a sibling repo to `Wavvon-discovery`),
cosmetic entitlements carried client-side as master-signed blobs (same
shape as [`home-hub.md`](home-hub.md) personal-axis state), a Missions
panel and cosmetics rendering in the official clients gated behind a
client constant (disablable in forks), and a billing layer on the farm
operator's side for managed hosting. No community hub ever holds a
balance, bills, or calls a money service — spark balance is
personal-axis, not community-axis.

**What's deferred**: anti-fraud design for attestation, the spark→
cosmetic catalog, who operates the mission service, and paid-placement
ranking rules in the gaming catalog.

## Farm model phase 3: creation policy on the farm row, farm-admin pubkey, per-farm discovery probe — no central registry

**Decision**: Phase 3 of the farm model adds (a) a three-valued
`creation_policy` column on the singleton `farms` row
(`open` / `admin_only` / `disabled`) plus quota columns
(`max_hubs_per_user`, `max_hubs_total`) and a `allow_discovery_listing`
flag; (b) a designated farm admin pubkey (`farms.admin_pubkey`) — no
new account concept, just the operator's existing user pubkey
recorded as the privileged identity for farm-level endpoints; (c) a
client-side `CreateHubModal` with farm picker + form, surfaced both
from the hub-sidebar `+` button and from a new "Host your own
community" section on the Discover page; (d) a narrow
`GET /farm/public-info` probe endpoint so a user pasting a farm URL
can decide whether to connect, without any central farm registry.
Full design in [`farm-impl.md`](farm-impl.md) Phase 3.

**Alternatives considered**:

- **A separate "farm admin account" concept** (email/password or a
  farm-issued credential distinct from a user pubkey). Rejected on
  the same identity grounds as the rest of the farm model — there is
  no Wavvon account, only pubkeys. The admin is "the pubkey the
  operator pasted into the CLI flag on first start," same trust shape
  as a hub's first-admin-is-the-operator bootstrap today.
- **Per-hub creation policy** instead of per-farm. Rejected: hubs
  don't exist yet at the moment "can this user create a hub?" is
  asked. The policy belongs one layer up; per-hub policy would have
  to live on the farm anyway. One row, one knob.
- **A two-valued policy** (`open` / `closed`). Rejected: `admin_only`
  is a real third state — the operator wants the API live for their
  own use but not for end users. Collapsing it into `open` forces a
  workaround (deploy with `open`, race the first user); collapsing
  it into `closed` blocks the operator from using their own API.
- **A central farm registry** to surface "farms open for hub
  creation." Rejected on the same sovereignty grounds the hub
  discovery design rejects a central hub registry. The
  `Wavvon-discovery` directory may grow an optional farm-listing
  extension reusing the signed-listing primitive, but the protocol
  primitive is the URL-shared probe (`/farm/public-info`); the
  directory is one possible consumer, not the discovery mechanism.
- **Auto-spawn deferred to a later phase** (Phase 2's stance).
  Reversed for the open-policy creation path only: a client-driven
  create flow that returns "now SSH into the box and run a command"
  is not a UX we ship. The operator-driven path stays available for
  admin-only farms; the open path requires the farm to spawn the hub
  process automatically with a bounded timeout and tombstone on
  failure.
- **Suspend a hub by killing the process**. Rejected: the hub's DB
  must stay intact (the operator may want to inspect it; the hub
  owner may dispute the suspension). The farm proxy short-circuiting
  `/hub/<id>/*` with `503 hub_suspended` gives the same user-visible
  effect with the hub state preserved.
- **A true farm-level user ban** that prevents a pubkey from
  authenticating against the farm at all. Deferred to Phase 4+:
  Phase 3 covers session revocation (`POST /farm/users/:pk/revoke-
  sessions`) and per-hub suspension, which composes to the same
  effect without a new "denied pubkeys" table. A real ban needs a
  story for "what if the user re-auths immediately" that we
  haven't designed.

**Tradeoff**: shipping client-driven hub creation forces auto-spawn
into the farm — a process supervisor inside what was meant to be
"auth + directory + reverse proxy and nothing else." We accept that
because the alternative (operator-instructions response from
`POST /farm/hubs`) makes the open-policy UX unshippable, and because
the supervisor is scoped narrowly (spawn one binary with one config,
wait for `/info`, give up on timeout) rather than a general process
manager. Operators who don't want spawning keep `creation_policy =
admin_only` and the Phase 2 behaviour is unchanged. The narrow
`/farm/public-info` endpoint also accepts unauthenticated probes
exactly the same way `/farm/info` does today; we accept that bandwidth
because the body is small and the per-farm opt-in
(`allow_discovery_listing`) defaults to off.

**What changes on the implementation side**:

- *Farm DB* (`farm/src/db/migrations.rs` in Wavvon-server):
  additive ALTERs on `farms` (`creation_policy`, `max_hubs_per_user`,
  `max_hubs_total`, `allow_discovery_listing`, `admin_pubkey`) and on
  `hubs` (`suspended_at`, `suspension_reason`).
- *Farm routes*: `GET /farm/settings`, `PATCH /farm/settings`,
  `GET /farm/hubs?include=all`, `PATCH /farm/hubs/:id/suspend`,
  `GET /farm/users`, `POST /farm/users/:pk/revoke-sessions`,
  `GET /farm/me/hub-quota`, `GET /farm/public-info`. `POST /farm/hubs`
  body extends with an optional `icon`. `GET /farm/info`'s `policy`
  block grows `creation_policy` and `allow_discovery_listing`.
- *Farm process supervisor*: bounded auto-spawn on
  `POST /farm/hubs`, tombstone on timeout. Operator-provided
  supervision remains the path for `admin_only` farms.
- *Farm-admin middleware*: rejects with `403 farm_admin_only` when
  the token's `sub` doesn't match `farms.admin_pubkey`.
- *Hub `/info`*: gains a `member_count` field (cached, 60s TTL) used
  by the farm admin's hub list. Otherwise unchanged.
- *Client* (`Wavvon-desktop`, mirrored on `Wavvon-web` and
  `Wavvon-android`): new `CreateHubModal` (farm picker → form →
  result), new `FarmSettingsPage` (General / Hubs / Users tabs)
  surfaced only when the user is the farm admin. The hub-sidebar
  `+` button gains a Join/Create popover. `DiscoverPage.tsx` gains a
  "Host your own community" tab using the same picker UI plus a
  "Check a farm URL" probe input. Known-hosts local store grows a
  `kind: "wavvon-hub" | "wavvon-farm"` discriminator on each entry.

**What's deferred**:

- True farm-level user ban (a `farm_banned_pubkeys` table) — Phase 4+.
- Discovery-service-side farm listing (`Wavvon-discovery` extension to
  list farms by `kind = "wavvon-farm"`) — out of scope for the farm
  server; lands when the directory repo picks it up.
- Per-farm `require_unique_names` enforcement on hub creation.
- Cross-farm discovery (layer 5) — `seed/` crate work, fundamentally
  separate.
- Streaming hub-spawn progress to the client (today: bounded wait +
  one success/failure response).

## Farm model phases 1 + 2: separate `farm/` crate, signed self-describing tokens, hubs cache farm pubkey

**Decision**: the farm layer ships as a new `farm/` crate in Wavvon-
server, a separate binary from `hub/`. Phase 1 (farm-level auth) is
deployable on its own against a single hub per farm; Phase 2 (hub
multi-tenancy) layers on top without changing the auth wire. Farm
session tokens are Ed25519-signed self-describing blobs
(`base64url(payload).base64url(signature)`) — hubs verify them locally
against a farm pubkey cached on startup, with no per-request round-trip
to the farm. Multi-tenancy uses path-prefix routing (`/hub/<hub_id>/...`)
proxied by the farm to per-hub processes — one SQLite DB per hub
stays. Full design in [`farm-impl.md`](farm-impl.md).

**Alternatives considered**:

- **Farm and hub in one binary (embedded library mode)**. Rejected:
  conflates two failure domains — a hub panic would take down the
  farm's auth endpoint, stopping new sessions across every hub on the
  farm. The HTTP boundary keeps each crash radius bounded.
- **Hub calls the farm to verify each session token**. Rejected: adds
  1-5ms (LAN) to 20-100ms (different host) to every authenticated
  request, and makes the hub fully unavailable for the duration of any
  farm outage. Local verification with a cached pubkey gives the right
  uptime story (farm down → no new sessions, but existing traffic
  keeps flowing).
- **JWT with HS256 shared secret**. Rejected: forces the farm and every
  hub to hold the same key, with secret distribution and rotation
  pain. Asymmetric Ed25519 means hubs hold only the public key, which
  is also published at `/farm/info`.
- **JWT structurally (RS256/EdDSA-JWT)**. Rejected on the same grounds
  we don't speak JWT anywhere else — alg negotiation, JWS variants,
  and the `none` algorithm foot-gun buy nothing on top of the
  Ed25519 primitive we already use for hub federation and alliance
  invite tokens. One signing shape across the protocol.
- **One DB with a `hub_id` column partition** for multi-tenancy.
  Rejected: SQLite's single-writer model means one busy hub stalls
  writes for the others; cross-tenant query bugs (forgetting a
  `WHERE hub_id = ?`) are a class of vulnerability that doesn't exist
  with per-DB isolation; today's "one file per hub, `cp` is the
  backup" operability is lost.
- **Subdomain-per-hub routing** (`abc.farm.example.com`). Rejected:
  needs a wildcard TLS cert or per-hub DNS, both more operational
  complexity for the self-hoster the farm model targets. Path prefix
  keeps one cert, one hostname.
- **Auto-spawn hubs from `POST /farm/hubs`**. Deferred to Phase 3+:
  Phase 2 ships with operator-provided process supervision (the farm
  creates the DB row and returns instructions; the operator runs the
  hub via their preferred unit). A new process supervisor inside the
  farm is the wrong scope for Phase 2's "auth + directory + reverse
  proxy and nothing else" remit.
- **Ship Phase 1 only after Phase 2 is ready**. Rejected: the trust-
  model migration risk lives entirely in the auth move. Decoupling
  it from the multi-tenancy work means we can stabilise the trust
  boundary on a known-good single-hub deployment, then add
  multi-tenancy without auth-shaped surprises.

**Tradeoff**: a signed token cannot be un-issued by changing one row in
a database — revocation needs short expiries (30 days), an opt-in
revoke-check endpoint hubs can poll, and key rotation as the disaster
escape hatch. We accept that because the per-request cost is zero and
the alternative (network call per request) destroys the latency and
availability properties that justify moving auth to the farm in the
first place. The three-step migration (dual-issue → stand up farm →
hubs return `410 use_farm`) is the most delicate part of the rollout;
we accept that pain in one window in exchange for never having to
revisit the auth boundary again.

**What changes on the implementation side**:

- *New crate*: `farm/` in Wavvon-server, mirroring `hub/`'s structure
  (`farm/src/main.rs`, `farm/src/server.rs`, `farm/src/state.rs`,
  `farm/src/db/migrations.rs`, `farm/src/routes/{health,auth,hubs}.rs`,
  `farm/src/token.rs`).
- *Farm DB*: `farms` (singleton), `farm_users`, `pending_challenges`,
  `farm_sessions`, `hubs` (Phase 2). One `farm.db` SQLite file, the
  same shape as today's `hub.db` for operability.
- *Farm routes*: `GET /farm/info`, `POST /auth/{challenge,verify,renew}`,
  `POST /farm/auth/revoke-check`, `GET/POST /farm/hubs`,
  `GET/PATCH/DELETE /farm/hubs/{hub_id}` (Phase 2).
- *Hub changes* (`hub/` in Wavvon-server): `auth/middleware.rs`
  rewrites to verify signed tokens locally;
  `cached_farm_pubkey: ArcSwap<Option<String>>` + `farm_url:
  Option<String>` added to `AppState`; `auth/handlers.rs` returns
  `410 Gone` in step 3 of the migration (its user-row-upsert /
  approval / role-assignment logic migrates into the admission
  middleware); `routes/health.rs::info` gains a `farm_url` field.
- *Identity-axis routes move up*: `subkey_revocations`,
  `subkey_certs`, `pairing`, `prefs`, `dh_keys`, `friends`
  endpoints relocate from the hub to the farm. The hub keeps
  community-axis state (channels, messages, voice, bans, roles,
  approvals, lobby/survey).
- *Client changes* (`Wavvon-desktop`, `Wavvon-web`, `Wavvon-android`):
  before `/auth/challenge`, fetch the hub's `/info`; if `farm_url` is
  set, target auth at the farm. No new client-facing UI in Phase 1 —
  the user does not know a farm exists yet.

**What's deferred**:

- Phases 3-7 of `farm-model.md` (public/private flag UI, client
  browse-the-farm UX, client-driven hub creation, hub migration
  export/import, deep links).
- Cross-farm discovery (layer 5 — `seed/` crate work).
- DMs and the federated DM outbox moving to the farm level — called
  out in `farm-model.md` as the eventual destination; deferred until
  Phases 1 + 2 are stable.
- Generic job queue refactor (`dm_worker.rs` → kind-dispatched
  queue) — lands with farm-level DMs, not before.
- Bot tokens moving to the farm — bots stay hub-scoped for Phase 1.
- Auto-spawn process supervisor inside the farm — Phase 3+.

## External bots: users-with-is_bot, invite-by-pubkey, per-hub directory

**Decision**: external bots are first-class hub members — a `users`
row with `is_bot=1`, reusing the existing keypair auth, role,
permission, ban, and message-authorship machinery. Hub admins invite
by pasting the bot's pubkey; the bot operator runs the bot process
anywhere and proves control of the private key by signing a single-
use invite token. Slash commands are routed by the hub to a bot-
declared webhook URL with a signed envelope; the bot's synchronous
response posts as a normal (or ephemeral) message. The bot directory
is per-hub, not federated. Full design in [`docs/bots.md`](bots.md).

**Alternatives considered**:

- **Outbound-webhook-only bots** (no persistent identity; the hub
  POSTs events to a registered URL and posts replies as a generic
  "webhook" author). Rejected: cannot participate in roles, can't
  be banned/muted as an actor, can't author messages with a stable
  pubkey across restarts, needs a parallel auth scheme. Bots-as-users
  reuses everything we already have for free.
- **Parallel `bots` table** instead of an `is_bot` flag on `users`.
  Rejected: every existing foreign key (`messages.author_pubkey`,
  `user_roles.pubkey`, `bans.pubkey`) would need a polymorphic
  variant or a duplicate. The flag is what `future-features.md`
  already anticipates and what internal service accounts already use.
- **Central bot directory** across hubs. Rejected on the same
  sovereignty grounds as a central hub registry — communities curate
  their own bot lists. Cross-hub bot reputation belongs in the future
  hub-certifications design space, not the bot system.
- **WS-push the bot invite** (the same shape as alliance push
  invites). Rejected: bot processes connect outward only and don't
  expose a federation endpoint to push to. The pull-style "operator
  signs a token" is the right shape.
- **Whitelist-by-pubkey, no signed token** (admin pastes pubkey, bot
  just connects). Rejected: a typo or impersonation could whitelist
  the wrong key with no detection. The signed-token round-trip costs
  one extra request and proves the operator controls the private key
  before any side effects land.
- **Webhook firehose for all channel events**. Rejected for v1: bots
  already receive events on the WebSocket like users do; mirroring
  every event to an HTTP endpoint would be a DoS magnet against the
  bot operator and offers nothing the WS doesn't.
- **Voice-capable bots in v1**. Rejected: the voice relay protocol
  has no concept of a non-human participant, and TTS / audio-stream
  bots are a separate design problem. Hard-blocked at the UDP
  handshake.

**Tradeoff**: the operator must distribute their bot's pubkey
out-of-band — exactly like hub URLs are distributed today. That is a
friction tax we accept because the alternative (any indexed list of
addable bots) collapses into either a central registry (kills
sovereignty) or a per-hub admin's manual curation problem we haven't
designed (and that operators may not want). Invite-by-pubkey keeps
the trust boundary explicit: every hub admin makes a deliberate
decision about every bot.

The slash-command webhook also introduces a synchronous external
dependency in the hub's message hot path. We accept that because
(a) the call is bounded by a short timeout and produces a visible
error to the invoking user, (b) it only fires on slash-prefixed
messages (a small fraction of traffic), and (c) the bot operator's
incentive to keep the endpoint responsive is direct.

**What changes on the implementation side**:

- *DB* (`hub/src/db/migrations.rs` in Wavvon-server): `users` gains
  `is_bot`, `is_bot_removed`, `bot_invite_token`,
  `bot_invite_expires`. New `bot_profiles`, `bot_commands` tables.
  `messages` gains `visible_to_pubkey` for ephemeral replies.
  `approval_status` accepts a new `'bot_pending'` value.
- *Hub routes* (`hub/src/routes/` in Wavvon-server): `POST /bots`
  (admin invites), `POST /bots/accept-invite` (bot proves key),
  `GET /bots`, `DELETE /bots/:pubkey`, `PUT /bots/me/profile`,
  `PUT /bots/me/commands`, `GET /bots/me`. `POST /auth/verify`
  accepts `is_bot: true` and optional `bot_meta`. `POST /messages`
  accepts `visible_to_pubkey` only for bot-authored slash responses.
- *Outbound dispatch* (`hub/src/bots/dispatch.rs`, new in
  Wavvon-server): signed `POST {webhook_url}` envelope using the
  hub's existing federation keypair primitive
  (`hub/src/federation/client.rs`).
- *Permissions* (`hub/src/permissions.rs` in Wavvon-server): hard
  blocks at the kind-check level — bots cannot join voice, cannot
  send DMs, cannot participate in E2E DMs, cannot solve "not a bot"
  challenges. Per-bot rate limits at the existing middleware.
- *Wire models*: `BotMeta`, `BotProfile`, `BotCommand`,
  `SlashInvocation`, `BotResponse`, `BotInviteToken` in
  `hub/src/routes/bot_models.rs` (Wavvon-server). New WS envelope
  variants `bot_added`, `bot_removed`, `bot_profile_updated`.
- *Client* (`Wavvon-desktop`): Hub Settings → Bots tab (list, add by
  pubkey, copy invite token, revoke). Slash-command autocomplete in
  the composer reads from a cached per-hub command list. Ephemeral
  message rendering when `visible_to_pubkey == my_pubkey`.
- *Browser / Android clients*: same wire shapes, directory UI parity.
  No platform-specific changes.

**What's deferred**:

- Bot DMs (notifications, transactional messages from a bot
  identity) — needs a friend-graph rethink.
- OAuth-style capability-scoped tokens per bot — broad token in v1;
  scoping comes when abuse patterns emerge.
- Cross-hub bot reputation / certifications — hub-certifications
  design space.
- Hub-to-hub bot federation across alliances — a bot is invited per
  hub today.
- Async event subscriptions over webhook (firehose) — WS only in v1.
- Bot-to-bot interaction conventions.

## Lobby, "not a bot" challenge, and onboarding survey: three independent gates

**Decision**: ship three composable onboarding features, each with its
own hub setting, sharing no control flow assumptions. Full design in
[`docs/lobby-bot-survey.md`](lobby-bot-survey.md).

1. **Security Level Lobby** — when a user's PoW level is below
   `min_security_level`, the hub still authenticates them but issues a
   `lobby`-scoped session token. The user can see a hub-admin-defined
   welcome blob and (if configured) the onboarding survey, but nothing
   in regular channels. The client runs PoW in the background; partial
   levels are submitted as they complete; the hub flips `lobby_status`
   to `'promoted'` server-side when the threshold is reached. Lobby
   state is a column on `users`, not a separate table.
2. **"Not a bot" challenge** — server-rendered SVG puzzles (math /
   pattern), verified server-side, issuing a single-use
   `challenge_token` bound to the requesting pubkey for ~10 minutes.
   The token is required at `/auth/verify` when `challenge_enabled`.
   Independent of `min_security_level` — a hub can require either,
   both, or neither.
3. **Role questionnaire** — admin-defined survey with multiple-choice
   answers mapped to roles (many-to-many) and optional free-text
   questions. All-choice answers with no review flags auto-apply roles
   and promote. Any free-text answer routes the user to the existing
   `approval_status='pending'` flow with answers visible in the
   pending-members admin panel.

**Alternatives considered**:

- **One unified "onboarding flow" feature.** Rejected on coupling
  grounds: PoW gating, bot prevention, and role auto-assignment serve
  different threat models and different operator goals. A hub running
  a tight private community wants the survey but not PoW; a hub
  expecting public traffic wants PoW but no survey; a hub gating
  against script-kiddies wants the challenge alone. Bundling them
  forces every admin to think about all three at once. Three flags,
  three storage shapes, one composed flow at the client.
- **Lobby as a dedicated "lobby channel" + role.** Rejected: a real
  channel would inherit the entire permission system, and inventing a
  "channel visible only to lobby scope" muddies the role model.
  Scoping the session token and gating routes by scope is one bit
  of state per user with no cross-cutting effects.
- **Challenge via third-party service** (the well-known captcha
  providers). Rejected as a federation violation — no hub should
  depend on an external service to gate joins. Server-rendered SVG
  puzzles are weaker against motivated attackers; we accept that in
  exchange for sovereignty. The bar is "annoying to automate at
  scale," not "uncrackable."
- **Role mappings on the question** ("this question grants X role").
  Rejected because real questions ("what's your platform?") have
  multiple answers each mapping to different roles. Mapping on the
  choice via a many-to-many table fits the actual shape.
- **Free-text answers as a first-class auto-mapping target** (regex
  matchers, keyword rules). Rejected — every example we sketched
  ended in a moderation foot-gun. Free-text always implies manual
  review, and the UI warns admins when their survey contains
  free-text questions.
- **Hub-issued partial-PoW credit transferable across hubs.**
  Rejected for v1 alongside cross-hub challenge tokens — both belong
  in the "hub certifications" design space (see
  [`docs/future-features.md`](future-features.md)), not the lobby.
- **Survey-during-lobby vs survey-as-modal-after-join.** Chose
  context-driven: when a lobby exists, the survey lives inside it
  (same screen as PoW progress); when there is no lobby, the survey
  runs as a blocking modal that the user cannot dismiss without
  submitting (the survey is the approval gate).

**Tradeoff**: three flags multiply hub-admin configuration surface, and
the lobby + challenge + survey combination has a non-trivial state
machine (auth scope, PoW level, approval status, lobby status all
interact). We accept that because (a) most hubs will enable at most
one, (b) the state transitions are server-decided and re-derivable
from columns at any time — no in-memory machine to corrupt, and (c)
collapsing them into one feature would force admins running smaller
communities to learn anti-abuse machinery they don't need.

**What changes on the implementation side**:

- *DB*: `users.lobby_status`, `users.lobby_entered_at`,
  `users.pow_level`; new `bot_challenges`, `challenge_tokens`,
  `surveys`, `survey_questions`, `survey_choices`,
  `survey_choice_roles`, `survey_responses`, `survey_answers`. New
  `hub_settings` rows: `lobby_enabled`, `lobby_welcome_md`,
  `challenge_enabled`, `challenge_difficulty`.
- *Hub routes*: new `routes/lobby.rs` (`/lobby/status`,
  `/lobby/submit-pow`, `/lobby/welcome`, `/hub/settings/lobby`),
  `routes/challenge.rs` (`/challenge/new`, `/challenge/verify`),
  `routes/survey.rs` (`/survey/current`, `/survey/submit`,
  `/admin/survey`, `/admin/survey/responses`). `/auth/verify`
  optionally accepts a `challenge_token`; the session token grows a
  `scope: 'lobby' | 'member'` claim and middleware gates non-lobby
  routes.
- *Tauri commands*: `lobby_status`, `lobby_start_pow`,
  `lobby_stop_pow`, `lobby_submit_proof`, `challenge_fetch`,
  `challenge_submit`, `survey_current`, `survey_submit`,
  `survey_admin_get`, `survey_admin_put`, `survey_admin_responses`.
  Existing `add_hub` grows an optional `challenge_token` argument.
- *Client*: new `Lobby.tsx`, `BotChallenge.tsx`, `Survey.tsx`
  components. `AddHubModal` inserts the challenge step when the
  hub's `/info` advertises `challenge_enabled`. Hub Settings gains
  an "Onboarding" tab containing lobby welcome editor, challenge
  toggle, and survey editor. Pending-members panel expands rows to
  show survey answers.
- *Wire models*: `LobbyStatus`, `ChallengePrompt`, `ChallengeResult`,
  `Survey`, `SurveySubmitResult`, `SurveyDef`. The `/info` response
  grows `challenge_enabled` and `lobby_enabled` so the client can
  branch before authenticating.

**What's deferred**:

- WS push for lobby promotion (poll for v1).
- Accessibility audio variant of the challenge.
- Adaptive challenge difficulty after repeated failures from one IP.
- Cross-hub portable challenge tokens (folded into the future hub
  certifications work).
- Per-choice `requires_review` flag on survey choices (column add
  when a real use case shows up).
- Conditional / branching survey questions.
- Localized survey prompts.
- Survey analytics for admins.
- Editing a submitted response.

## Alliance push invites: additive to pull, unauthenticated endpoint, hub-local labels

**Decision**: alliance invites now have two coexisting shapes — the
original **pull** flow (Hub A generates a signed invite token; admin
pastes it on Hub B and Hub B calls `/alliances/:id/join`) and a new
**push** flow (Hub A's admin enters Hub B's URL plus an optional
message and Hub A POSTs the invite directly to Hub B's
`/federation/alliance-invite` endpoint). Hub B persists the card in
`pending_alliance_invites` and surfaces it in Settings → Alliance
invites with Accept / Decline. Accept reuses the existing join path
with the stored invite token. Full design in
[`docs/alliances.md`](alliances.md).

**Alternatives considered**:

- **Replace pull with push entirely.** Push requires knowing the
  target hub's URL up front. Pull still wins when you have a
  paste-a-link distribution channel (DM, chat outside Wavvon, QR) and
  don't know which hub the receiver runs. Keeping both is additive
  and the implementation cost is one extra endpoint plus one table.
- **Authenticated federation endpoint** (hub-to-hub signed POST, same
  as the DM outbox path). Rejected: the invite token *already* carries
  the only authority that matters — it is a Hub-A-identity signature
  of the alliance id, the same primitive the pull flow verifies on
  join. Wrapping the transport in a second auth layer would not
  prevent fake pending cards (they cannot be forged into membership
  either way) and would force every hub considering inviting another
  to first establish a federation handshake. Open endpoint + signed
  payload is the correct trust placement.
- **Single canonical alliance name across hubs.** Rejected on
  sovereignty grounds: no hub can force a label on another. The push
  payload carries Hub A's *local* label as a default suggestion, and
  Hub B may keep or change it on accept. This matches the existing
  schema (`alliances.name` is per-hub) and the pull flow's symmetry.
- **WebSocket push of the new pending card** to logged-in admins on
  Hub B. Rejected for v1: invite cadence is admin-to-admin and rare;
  a poll on tab mount is plenty. The realtime channel can be layered
  on later without changing the storage shape.
- **Omit the optional message.** Rejected: a one-line human note
  ("hey, this is the WoW raid alliance we talked about") is the
  cheapest possible improvement to discoverability, and it costs one
  nullable column.

**Tradeoff**: the unauthenticated federation endpoint accepts spam —
anyone on the internet can drop a pending card into a hub's queue.
We accept that because (a) accept is gated by signature verification
on the actual join, so spam cards cannot create membership, (b) the
cards are cheap to decline, and (c) hubs that get abused can rate-
limit or temporarily disable the endpoint without breaking the pull
flow. The alternative — pre-establishing hub-to-hub auth before any
invite can be sent — would be strictly worse for first-contact
between hubs that have never met, which is the exact case push
invites are built for.

**What changes on the implementation side**:

- *DB*: new `pending_alliance_invites` table (alliance_id,
  from_hub_pubkey, from_hub_url, alliance_name, message?,
  invite_token, created_at).
- *Hub routes* (`hub/src/routes/alliances.rs` in Wavvon-server):
  `POST /alliances/:id/push-invite` (admin-only, calls Hub B);
  `GET /alliances/pending-invites`,
  `POST /alliances/pending-invites/:id/accept`,
  `POST /alliances/pending-invites/:id/decline` (admin-only).
- *Federation* (`hub/src/federation/handlers.rs` in Wavvon-server):
  `POST /federation/alliance-invite` — unauthenticated, validates
  payload shape, inserts the pending row.
- *Client*: Hub Settings gains an Alliance invites tab (list of
  cards, accept/decline) and the existing Alliances → Invite tab
  gains a "Send invite directly" form (URL + optional message).
  The receiving tab polls `/alliances/pending-invites` on mount;
  no new WS envelope.
- *Wire models*: a new federation request type for the invite
  payload, sharing the `invite_token` shape with the pull flow.

**What's deferred**:

- Realtime notification of new pending invites (WS push) — wait
  until admin tooling has enough volume to justify it.
- Rate-limiting / abuse handling on `/federation/alliance-invite`
  beyond standard request limits — revisit if any hub reports spam.
- Inviting many hubs at once from a single form — current shape is
  one URL per send; bulk invites can be a UI affordance later
  without protocol changes.
- Surfacing the sender's *hub identity fingerprint* on the card.
  Today the card shows hub URL + name; a verified-identity badge
  is a separate piece of work and not load-bearing for v1.

## Packaging: Tauri bundler + GitHub Actions, not custom scripts

**Decision**: cross-platform packaging is delegated to Tauri 2's
built-in bundler (`tauri build --bundles`) driven from two GitHub
Actions workflows — one for release tags, one for PR validation. NSIS
on Windows, universal DMG on macOS, AppImage (plus `.deb`/`.rpm`) on
Linux. Auto-update goes through `tauri-plugin-updater` with a Tauri-
generated Ed25519 keypair and an endpoint at
`releases.wavvon.io/latest.json`. The hub server ships separately as a
Docker image (`ghcr.io/wavvon/hub`) plus a static musl binary. Full
design in [`docs/packaging.md`](packaging.md).

**Alternatives considered**:

- **Custom packaging scripts per platform** — `cargo-wix` directly for
  MSI, `create-dmg` + `codesign` + `notarytool` invocations for macOS,
  `appimagetool` + a hand-rolled AppDir on Linux. Rejected: it
  reinvents what the Tauri bundler already does correctly, and every
  Tauri upgrade would risk silently breaking our packaging path.
- **Electron-Builder-style framework** — none of the Rust-native
  options (cargo-bundle, cargo-packager) match Tauri 2's tight
  integration with the updater plugin, the entitlements plumbing on
  macOS, and the embedded WebView config on Windows. Picking a second
  framework on top of Tauri is two systems to reason about.
- **One workflow that always bundles** — bundling on every PR burns CI
  minutes and produces unsigned artifacts of dubious value. Splitting
  into `build.yml` (cheap `cargo check` + `tsc --noEmit` for PRs) and
  `release.yml` (full bundle on tag) keeps the feedback loop fast.
- **Single arch on macOS** (separate `x86_64.dmg` + `aarch64.dmg`).
  Universal binary is two compiles + a `lipo`, but produces one
  artifact users don't have to think about. Worth the build minutes.

**Tradeoff**: the Tauri bundler hides a lot — exactly which `notarytool`
flags get used, exactly what NSIS template ships, what AppImage runtime
gets bundled. We accept that opacity in exchange for not owning a per-
platform packaging codebase. The escape hatch (drop down to platform-
native tools) exists if Tauri's defaults ever stop fitting.

**What changes on the implementation side**:

- `tauri.conf.json` grows the `bundle.*` fields, `plugins.updater.*`
  block (endpoints + pubkey), and a macOS entitlements plist path.
- `Cargo.toml` (client) adds `tauri-plugin-updater`; `lib.rs` registers
  it next to the existing deep-link and shell plugins.
- New `.github/workflows/release.yml` (tag-triggered, matrix bundle +
  GitHub Release upload) and `.github/workflows/build.yml` (PR
  validation: `cargo check` + `tsc --noEmit`).
- New `hub/Dockerfile` in Wavvon-server (multi-stage, distroless final
  image) and a sample `docker-compose.yml` for self-hosters.
- `CHANGELOG.md` created at repo root, Keep a Changelog format.
- Secrets configured in GitHub: the updater key, the Apple notarization
  set, and (when procured) Windows Authenticode credentials.

**What's deferred**:

- Hub-server auto-update (operator-driven today; revisit once farms
  exist).
- Mobile (iOS / Android) packaging — separate signing pipelines, separate
  store policies, sandbox conflicts with `wavvon://` and voice capture.
- Windows Store / Mac App Store distribution — sandboxing breaks our
  deep-link + filesystem + mic-access model.
- Delta updates — full installer download is fine at current binary
  size.
- Windows Authenticode cert procurement — release Windows builds are
  unsigned until then, with a release-notes caveat. Updater payload
  signature is unaffected (separate key).

## E2E DMs v1: static ECDH + AES-GCM, group DMs deferred

**Decision**: ship E2E encryption for 1:1 DMs using a deterministically
derived X25519 keypair (from the existing Ed25519 identity seed),
static-ECDH key agreement, HKDF-SHA256 to a per-conversation key, and
AES-256-GCM with an Ed25519 signature over the envelope. Group DMs stay
plaintext in v1. Full design in
[`docs/e2e-encryption.md`](e2e-encryption.md).

**Alternatives considered**:

- **Double Ratchet in v1** — proper forward secrecy
  and post-compromise security from day one. Rejected for v1 only:
  thousands of LoC, a stateful key store on every client, edge cases
  around out-of-order delivery and multi-device that the rest of Wavvon
  hasn't paid for yet. v2 path is preserved by carrying `dh_pubkey_hex`
  per message — the same slot the ratchet's ephemeral key occupies.
- **A separate encryption keypair stored alongside the identity** —
  more storage, another secret to back up and worry about, and a real
  risk of the two getting out of sync. The Ed25519→X25519 derivation
  (`crypto_sign_ed25519_sk_to_curve25519`) is well-studied and gives us
  zero-storage DH keys for free.
- **Encrypt groups now with pairwise ECDH** — N(N−1)/2 key agreements
  per group, re-encrypting every message N−1 times, no clean story for
  membership change. Rejected; sender-key is the right
  shape and goes in v2.
- **Per-conversation symmetric key negotiated once** — same forward-
  secrecy hole as static ECDH but with extra key-rotation ceremony and
  worse multi-device behaviour. Static ECDH derives the same key
  deterministically from `(dh_priv, dh_pub, conv_id)`, which is
  strictly better.

**Tradeoff**: we accept "no forward secrecy in v1" in exchange for an
implementation that fits in a couple hundred lines and reuses the
existing identity seed, signing pattern (`identity/src/wire.rs:32-66` in Wavvon-server),
and DM storage path (`hub/src/routes/dms.rs:132-288` in Wavvon-server).
The hub goes from "reads everything" to "stores opaque ciphertexts and
verified envelopes" — a step change in trust posture — without a
protocol rewrite. The forward-secrecy gap is real and documented; it
becomes a hard requirement when v2 lands.

**What changes on the implementation side**: new `dh_keys` table and
`GET/PUT /identity/:pubkey/dh-key` routes on the hub; `is_encrypted`
and `ciphertext_json` columns added to `dm_messages` (additive); a
`Identity::dh_keypair()` method on the shared identity crate; client
encrypts on send when the recipient has a published DH key, warns and
falls back to plaintext otherwise; per-message lock-icon UI signals
mixed conversations during the transition.

**What's deferred**: group DM encryption (v2 sender-key scheme),
forward secrecy via Double Ratchet (v2), encrypted search, voice/video
encryption (separate design), metadata hiding (out of scope).

## Screen share v1: hub-relayed WebSocket chunks, not WebRTC P2P

**Decision**: ship screen share as WebM chunks (`MediaRecorder`,
VP8/Opus) sent over the existing chat WebSocket. The hub broadcasts
each chunk to channel subscribers. Viewers buffer into a
`MediaSource`. Full design in
[`docs/screen-share.md`](screen-share.md).

**Alternative considered**: WebRTC peer-to-peer from the start, with
the hub as SDP/ICE signaler. Direct sharer→viewer media, hub carries
no video bytes.

**Tradeoff**: WebRTC is the right long-term shape — lower latency
(~100 ms vs 300–500 ms), higher quality, and zero hub egress for
media. It costs an entirely new protocol stack (peer connection
lifecycle, ICE/STUN/TURN configuration, NAT traversal, per-viewer
uploads on the sharer), none of which Wavvon currently exercises.
The hub-relayed path reuses the existing typed WS envelope channel
(`hub/src/routes/chat_models.rs` in Wavvon-server, line 175), the
existing subscriber broadcast logic, and the existing identity/role
permission machinery. Net cost is a handful of new envelope variants
plus a per-channel `ActiveShare` map. The hub egress ceiling
(N × ~2.6 Mbps per viewer) is the obvious scaling pain — and is
exactly what triggers the v2 migration to WebRTC once it bites.
Building v1 first also lets the UI surface (source picker, viewer
layout, permission gate, webcam-as-second-stream) ship and bake
without coupling it to the transport rewrite.

**Webcam**: same infrastructure, second stream ID. Can be deferred
to v2-of-the-feature at implementation time; the protocol already
allows it.

**Supersedes**: the ROADMAP wishlist entry "Screen share — WebRTC or
similar" implied WebRTC as the obvious choice. This decision says
the obvious choice is the eventual one, not the first one.

## Hub discovery: three-layer architecture

**Decision**: hub discovery is built as three composable layers — deep
links (`wavvon://` URI scheme), an opt-in directory website/API, and
signed public hub profiles — rather than a single central registry.
Full design in [`docs/hub-discovery.md`](hub-discovery.md).

**Key choices within the design**:

- **Directory lives in a separate repo** (`Wavvon-discovery`). Separate
  deployment lifecycle (web service), separate CI/CD, separate
  contributor profile. The API contract in hub-discovery.md is the
  boundary.
- **Cryptographic listing ownership** — hub signs its own directory
  listing with its Ed25519 private key. No accounts on the directory
  service; ownership is proven, not asserted.
- **Opt-in at every layer** — hubs choose to list on a directory; users
  choose which hubs appear on their public profile. Nothing is indexed
  without operator/user action.
- **Official directory is the default but not the only one** — the
  client ships pointing at the official instance; operators can
  self-host their own directory; other client forks set their own
  default.

**Alternatives considered**: single central registry (rejected —
violates sovereignty design); DHT/gossip-based discovery (rejected —
massive complexity for marginal gain at current scale); directory merged
into the main repo (rejected — deployment lifecycle and contributor
access mismatch).

## Nested channels: DnD interaction model

**Context**: schema already supports arbitrary nesting
(`channels.parent_id`, `is_category`); server validates cycles and
parent-must-be-category. The client today builds a one-level tree
(`buildChannelTree` in `desktop/src/utils/channels.ts` in Wavvon-desktop)
and `handleDragEnd` in `App.tsx` (~line 2952) does a flat global
`arrayMove` and POSTs to `reorder_channels`. `move_channel` exists but
is never invoked from drag. Goal of this entry: pick the four
interaction primitives so implementation can start without re-deriving
them.

### 1. DnD strategy — Option A (single flat `SortableContext`, DFS order)

**Decision**: collapse the sidebar into a single `SortableContext`
that lists every visible channel/category in depth-first order, with
indentation rendered via CSS padding-left keyed off the node's depth.
Reparenting and reordering are both expressed as "where in the flat
list did the user drop, and at what indent level."

**Alternatives**: keep nested `SortableContext`s, one per category,
recursively (Option B); roll a non-dnd-kit tree (Option C).

**Tradeoff**: nested contexts make "move from category X into category
Y" a context-jump that dnd-kit handles awkwardly — `over` events fire
inside whichever inner context the pointer is in, and the sortable
animations fight each other when an item leaves one context for
another. With unbounded depth (the design rule from
`future-features.md`), the recursive approach also requires every
category to instantiate its own context and `useSortable`, multiplying
re-renders. A single flat context with DFS rendering is what
dnd-kit's tree examples settle on for the same reason: it gives one
coherent stream of `over` events, supports any depth without code
changes, and keeps the indentation purely visual. The cost is that
we compute drop-target semantics (parent, sibling-index, depth)
ourselves from the over-id and the pointer's horizontal position
rather than letting nested contexts encode it.

### 2. Reparenting gesture — Option B (horizontal offset signals nest depth)

**Decision**: while dragging, the pointer's X position relative to the
sidebar's left edge picks the **target depth**. The drop indicator
shows a horizontal line at the resolved (parent, index, depth)
combination. Drag right past the row's indent to nest one level
deeper; drag left to un-nest. Dropping onto a category header is also
accepted as a shorthand for "append as last child" (mostly so users
who don't notice the offset hint still get a sensible result).

**Alternatives**: A — only "drop onto category header" reparents,
between-item drops always keep the source's parent. C — no DnD
reparenting; admin modal only.

**Tradeoff**: option A breaks down past two levels — there's no way to
move a node up to grandparent level without first dragging it onto
the grandparent header, which means the drop target keeps moving as
you scroll. Option C is fine but punishes the common case (admins
shaping their tree). Horizontal offset is the standard tree-DnD
gesture (file managers, outliners, dnd-kit's own tree example) and
reads naturally with the indentation we're already drawing. The
"drop on header = append" fallback covers the discoverability gap
without conflicting with the offset gesture.

### 3. Cycle detection — both, but client is advisory

**Decision**: server is the source of truth and rejects cycles
authoritatively (already implemented). Client also computes the
forbidden descendant set of the dragged node up front and refuses to
render the drop indicator over any of those rows — this gives
immediate visual feedback ("you can't drop a category into itself")
without a server round-trip. If the client check is bypassed somehow
(stale tree, race), the server rejection plus a toast is the
backstop.

**Alternatives**: rely on server only (simpler, but drops *appear* to
succeed for ~100 ms before the toast snaps the tree back, which feels
broken); client only (federated principle: the client never trusts
itself for invariants the server enforces).

**Tradeoff**: a few lines of `isDescendant(draggedId, candidateId)`
in the client buys a much better feel; we keep the server check
because we have to anyway.

### 4. `buildChannelTree` — make it fully recursive now

**Decision**: rewrite `buildChannelTree` to return a recursive
`TreeNode { node: Channel; children: TreeNode[] }[]` and produce a
parallel DFS-flat list (with `depth` annotations) for the
`SortableContext` to consume. Both shapes come out of the same pass.

**Alternatives**: keep the shallow shape and add a second pass on top;
recurse only as deep as today's data goes (1–2 levels) and grow it
later.

**Tradeoff**: the shallow function is already wrong for what we want
to render (it filters non-root parents into the wrong bucket once
categories nest under categories). Half-recursing is just another
place that'll need to change next time, and the recursive version is
~15 lines. Single source of truth for tree shape beats two
half-implementations.

### What changes on the implementation side

- `desktop/src/utils/channels.ts` (Wavvon-desktop): rewrite
  `buildChannelTree` to be fully recursive; export a sibling
  `flattenTree(tree)` that yields `{ node, depth, parentId }[]` in
  DFS order for the sortable. Also export `descendantIds(tree, id)`
  for the client-side cycle guard.
- `ChannelSidebar.tsx`: collapse the two nested `SortableContext`s
  (lines 221/239) into one driven by the flat DFS list. Render each
  row with `paddingLeft: depth * INDENT_PX`. Categories still render
  their header row but no longer wrap their children in a separate
  context.
- `App.tsx`'s `handleDragEnd` (~2952): resolve the drop into
  `(parentId, displayOrder)`. If `parentId` differs from the source's
  current parent, call `move_channel` first, then `reorder_channels`
  scoped to the affected sibling group(s). If only the order changed,
  skip the move call.
- New `DragOverlay` content: render the dragged row at its current
  resolved depth (recompute on `onDragMove` from pointer X) so the
  user sees the indent they're committing to.
- Tauri side: no changes. `move_channel` and `reorder_channels` are
  both already wired.

### What's deferred

- **Visual strategy past ~6 levels** (open question in
  `future-features.md` — horizontal scroll, auto-collapse,
  breadcrumb): not blocking. Indent past the sidebar width simply
  truncates with ellipsis until we pick one.
- **Permission-override UI on nested categories**: separate design.
- **Permalinks showing the full path** (`Games / LoL / #raid`): a
  display-only change, not part of this DnD work.
- **Touch / mobile drag affordances**: out of scope; desktop only.

---

## First-run / onboarding: enhanced single screen, opt-in demo hub, non-blocking recovery

**Decision**: keep the welcome screen as a single-screen layout (no
wizard), reorganise it into three named sections, add an opt-in demo
hub as a secondary CTA next to the primary "Add your first hub", and
keep recovery acknowledgement non-blocking. No identity surfacing on
first run. No in-channel first-use hints in this pass.

**Final shape of the welcome screen** (`empty-state welcome` in
`App.tsx` ~line 3185, rendered when no hubs are present):

1. **Heading + tagline** — unchanged copy.
2. **Section 1 — "Protect your identity"**: `WelcomeRecoveryBlock`
   moves up to be the first content block after the tagline.
   Rationale: backup is the only thing the user can lose forever; the
   add-hub step is recoverable. The block keeps its three sub-states
   (unrevealed / revealed / acknowledged). It does **not** gate the
   add-hub buttons — both CTAs remain enabled at all times.
3. **Section 2 — "What Wavvon is"**: the existing three bullet points
   (Hubs / Identity / Alliances), kept verbatim, framed as a brief
   "what you're getting into" block under a subheading.
4. **Section 3 — "Join your first hub"**: a CTA row with two buttons:
   - **Primary** — "Add your first hub" → opens `AddHubModal`
     (existing flow, unchanged).
   - **Secondary** — "Try a demo hub" → opens `AddHubModal` with the
     URL field pre-populated from a new `DEMO_HUB_URL` constant. The
     user still sees the preview and clicks confirm. The button is
     hidden when `DEMO_HUB_URL` is empty/null.
   Followed by the existing footnote about asking a friend / pasting
   an invite / running your own.

**Demo hub concretely**:
- New constant `DEMO_HUB_URL: string | null` in `desktop/src/constants.ts` (Wavvon-desktop),
  initially `null` until a Wavvon-operated demo server is stood up.
- The "Try a demo hub" button is conditionally rendered on
  `DEMO_HUB_URL != null`. No dead button ships.
- Clicking it opens the same `AddHubModal` with the URL prefilled,
  not a bypass. The preview-then-confirm flow stays so the user sees
  what hub they're joining; this also means the modal's existing
  validation, error handling, and join-approval paths apply unchanged.
- The demo hub is never auto-joined on first launch. Onboarding stays
  opt-in.

**Recovery acknowledgement is not a gate**:
- The user can click "Add your first hub" without revealing or
  acknowledging the phrase. The block stays visible (and prominent)
  on the welcome screen until acknowledged, and the same phrase is
  reachable from Settings → Security afterwards.
- Rationale: blocking the only useful action on the screen behind a
  modal-flavoured banner trains users to dismiss safety nudges. A
  prominent, non-blocking nudge with a permanent re-entry point in
  Settings is the right pressure level.

**Identity surfacing**: nothing on first run. Public-key fingerprint
display lives in Settings, not on the welcome screen — too technical
for a screen whose job is "get the user into a hub."

**Post-first-hub**: once the user has any hub, the welcome screen is
gone forever (existing behaviour). No in-channel first-use hints
("try typing a message") are added in this pass. If empty-channel
guidance is needed later, that is a separate feature with its own
design entry — it is not part of first-run.

**Alternatives considered**:
- **Multi-step wizard (Identity / Recovery / Add hub)** — rejected.
  The user has exactly one decision on first run (which hub), so
  steps 1 and 2 are filler. A wizard that runs once and then never
  again earns no reuse for its complexity, and `WelcomeRecoveryBlock`
  already covers the recovery step in place.
- **Inline quick-add for the demo hub (skip the preview modal)** —
  rejected. Hiding the URL the user is about to join contradicts the
  "you're picking which hub" framing of the rest of the product. The
  one-extra-click cost is worth keeping the demo hub indistinguishable
  from any other hub join.
- **Demo hub button as a placeholder before a URL exists** —
  rejected. A button that does nothing or shows "coming soon" trains
  users to distrust CTAs. The `DEMO_HUB_URL != null` gate keeps the
  feature dark until the server is real.
- **Block "Add hub" until recovery is acknowledged** — rejected. See
  above; nudges that block the primary action become friction the
  user routes around (force-close + relaunch, copying URL into a
  config file, etc.).
- **Show public-key fingerprint on welcome** — rejected as first-run
  noise. A user who cares can find it in Settings; a user who doesn't
  doesn't need to be told their identity has a hash.

**Implementation impact**:
- *Client* (`App.tsx` ~3185–3217): reorder the children of
  `empty-state welcome` to put `<WelcomeRecoveryBlock />` first, wrap
  the three bullet `<li>`s under a "What Wavvon is" subheading, and
  replace the single primary button with a CTA row containing the
  primary "Add your first hub" plus a conditional secondary "Try a
  demo hub". Both buttons call `setShowAddHub(true)`; the demo
  variant additionally seeds the modal's URL input.
- *Client* (`AddHubModal`): accept an optional `initialUrl` prop and
  use it to pre-populate the URL input on open. No other behaviour
  change; the preview/confirm flow is shared.
- *Client* (`constants.ts`): add `export const DEMO_HUB_URL: string |
  null = null;` with a comment that this flips to a real URL once a
  Wavvon demo hub is operated. The welcome screen renders the demo
  CTA only when this is non-null.
- *Client* (`WelcomeRecoveryBlock`): no behaviour change. Visual
  prominence comes from its new position in the layout, not from
  component changes.
- *Styles*: a `.welcome-cta-row` (or similar) for the two-button row;
  `welcome-points` keeps its bullets but lives under a new
  subheading. No new components.
- *Server / Tauri*: nothing. First-run is entirely client-side.

**Deferred**:
- Standing up an actual Wavvon-operated demo hub and setting
  `DEMO_HUB_URL`.
- In-channel "you're in, try a message" guidance for empty channels.
- Identity-surfacing affordances (fingerprint, device name) on the
  welcome screen — kept in Settings only.
- Any concept of resuming onboarding on a second device (multi-device
  has its own design space; nothing about first-run pre-empts it).

## Notifications: client-side filtering, two distinct features, dot-on-active-hub fixed

**Decision**: a four-part answer to the notification model question.

1. **Subscription protocol: hub auto-subscribes on connect.** On WS
   connect the hub queries all non-category channels the user is not
   banned from and populates the subscription set server-side. The client
   never sends `subscribe_all`; `WsClientMessage::SubscribeAll` has been
   removed. Per-channel `subscribe`/`unsubscribe` messages remain on the
   wire for clients to manage new channels created after connect. The
   client still filters events by per-channel `NotifyMode`.
2. **Two distinct features, both gated by the same `NotifyMode`.**
   These are not two tiers of one thing; they are separate features that
   happen to share the mode knob.
   - **Notification** = proactive interruption: audio ping + OS
     notification. "Someone is calling for your attention right now."
     Fires when `allowBump` AND the channel is not currently visible
     (not active channel) AND either it's a mention OR mode is `all`
     AND the app is not focused.
   - **Unread pin** = passive reminder: the dot on a channel row and
     the badge on a hub icon in the sidebar. "There are messages waiting
     when you're ready." Fires whenever `allowBump` AND channel is not
     active.
   - Behavior under each mode:
     - `all` → unread pin for every message; notification per the
       notification rule above. Pin fires **even on the active hub**
       when the user is not in that channel. The current "no pin on
       active hub unless mention" gap is treated as a bug and removed.
     - `mentions` → unread pin **only** on mention; notification only
       on mention. Non-mention messages produce neither.
     - `silent` → no pin, no notification, ever.
   - Rule: **notification implies unread pin; unread pin does not imply
     notification**. We do not expose a fourth "pin but no sound" mode.
     Keeping the matrix at three modes is what made the user's mental
     model fit on one line.
3. **Permission gate: hidden channels produce neither pin nor
   notification.** Before processing a `chat-message` event, the client
   checks that `channel_id` exists in its local `channels` array. If
   not, the message is silently dropped — no pin, no notification, no
   unread bump — even if the body contains a mention of the user's
   display name. Today this guards against race conditions (deleted
   channels, channels not yet loaded, firehose entries the client never
   listed). Tomorrow, when per-channel ACLs land, this is the same gate
   that keeps invisible channels invisible. The hub-side firehose is
   not authoritative about what the user can see; the client's
   `channels` list is.
4. **"Hey dude, unread messages" is the existing sidebar pin + hub
   badge + tray badge. No new global banner.** Add one concrete
   affordance: a **"Jump to first notification"** button at the top of
   `ContentArea` when the selected channel has a tracked first-notifying
   message above the current scroll position. Semantics: scroll to the
   first message in the channel's history that *matched the user's
   notify criteria* — i.e., the message that caused the unread pin to
   appear. In `mentions` mode with 50 unread and one mention, this
   jumps to the mention, not to message #1. The client tracks a
   `firstNotifyingMessageId` per channel (string id, client-side state
   only; nothing new on the server). It is set when the pin first
   transitions from clear to set, and cleared when the pin clears.
   The existing `newWhileScrolledUp` pill already covers the "messages
   arrived while you were scrolled up" case; the new button covers
   "you switched into a channel with backlog you haven't seen."

**Alternatives considered**:
- **Server-side mode sync (Option B)**: client tells the hub its
  per-channel modes; server filters. Rejected — couples UI prefs to the
  protocol, and per-user filtering on the broadcast path costs more
  CPU than the firehose saves bandwidth at our scale.
- **Per-channel subscribe/unsubscribe today (Option A)**: cleaner
  long-term but pays migration cost now for a problem (bandwidth) we
  do not have. The wire shape is reserved so we can flip later without
  a protocol break.
- **Mentions-mode pins for all messages (just no notification)**:
  rejected — defeats the user's stated goal of "no pin noise for
  ignored channels." Mentions-only must mean mentions-only on both
  features.
- **Independent pin/notification toggles per channel**: rejected —
  combinatorial explosion in the UI for a use case nobody asked for.
  Three modes, one knob, two features that read it.
- **Global "you have unread messages" toast**: rejected — redundant with
  the tray badge and the window-title unread count, and intrusive when
  the user is in a non-message view (game, settings) on purpose.

**Why this combination wins**:
- Keeps the protocol unchanged today; the future-proof shape is already
  on the wire.
- Fixes the active-hub pin gap that contradicts the user's "pin for
  every message in `all` mode" expectation.
- The notification-implies-pin rule means the pin is a strict superset
  of the notification — users never get notified about something that
  isn't also visible in the sidebar after the fact.
- Naming the two features distinctly ("notification" vs "unread pin")
  prevents the design conversation from collapsing them whenever a new
  edge case shows up.
- The hidden-channel gate keeps the `channels` array as the single
  client-side authority on visibility, which is the same shape per-
  channel ACLs will need.
- Adds one piece of UX ("jump to first notification") that takes the
  user directly to the message that caused the pin, not to arbitrary
  unread #1 — without inventing a new global notification surface.

**Implementation impact**:
- *Client* (`App.tsx` chat-message handler around line 1020-1070):
  - Add the hidden-channel gate as the **first** check in the handler:
    if `!channels.some(c => c.id === msg.channel_id)`, return early.
    No pin, no notification, no unread bump, no mention check.
  - Remove the `(!isActiveHub || isMention)` gate on `bumpUnread` so the
    pin fires for `all`-mode messages on the active hub too.
  - The notification block stays scoped to mentions for `mentions` mode;
    for `all` mode the gate becomes
    `(isMention || (mode === "all" && !document.hasFocus()))`.
- *Client* (per-channel state): track `firstNotifyingMessageId: string
  | null` keyed by channel id. Set it to the incoming message id at the
  moment the pin transitions clear → set; leave it alone on subsequent
  pin-bumps; clear it when the pin clears (channel read).
- *Client* (`ContentArea`): add a "Jump to first notification"
  affordance. On channel select, if `firstNotifyingMessageId` is present
  and that message is not in view, render the button. Click scrolls to
  that message id; the button hides on scroll-into-view or on click.
- *Server*: auto-subscribe on connect landed (`ws.rs` — query channels
  minus bans on handshake). `SubscribeAll` removed from the protocol.
  The hidden-channel client-side gate is still the right defence for
  race conditions (channel deleted mid-session, etc.).
- *Docs*: cross-link this entry from `client.md` notification bullets.

**Deferred**:
- Per-channel firehose-off: **shipped** — hub now auto-subscribes to
  accessible channels on connect; `subscribe_all` removed. The next
  step (subscribe only to the active channel for content, all others
  for unread bumps only) deferred until battery/bandwidth telemetry
  on mobile justifies the added complexity.
- Quiet hours / DND windows: not in this decision. If added later, they
  layer on top as a global override that downgrades all modes one step
  (`all` → `mentions`, `mentions` → `silent`, `silent` stays).
- Per-user mute (mute a person across all channels): orthogonal, lives
  in the block/ignore system in `client.md`, not here.

## Client state stays in App.tsx; no per-domain hooks, no context

**Decision**: after the JSX-extraction refactor, `App.tsx` keeps owning
all 172 hooks, all effects, and all event handlers as a single flat
state container. Components stay pure renderers that receive what they
need as props. We do not split state into per-domain custom hooks, and
we do not introduce React context for any application-state domain.

**Alternatives considered**:
- **Custom hooks per domain** (`useHubs`, `useMessaging`, `useVoice`,
  `useUI`, ...). App.tsx becomes a composer.
- **React context per domain** with leaf components consuming directly,
  removing prop drilling through `ContentArea` (~50 props) and
  `ChannelSidebar` (~30 props).
- **Hybrid**: hooks for data domains, context only for truly global
  values (theme, publicKey, blockedUsers).

**Why staying flat wins**:
- **The handlers are cross-domain.** `handleSend` touches messages,
  typing, attachments, reply target, unread, notifications. Selecting a
  hub mutates hubs, channels, messages, roles, approval status, voice,
  and admin tabs. Adding a friend touches friends, conversations, and
  view. Domains as drawn in the proposal are not closed sets; a
  `useMessaging` hook would either pull `useTyping`/`useAttachments`/
  `useUnread`/`useNotifications` in as deps (so its public surface
  re-exposes everything), or the handler would have to live above the
  hooks anyway. Both paths reintroduce App.tsx.
- **Effects already cross domains.** The hub-WS event listener writes
  into messages, channels, users, voice, typing, alliances, DMs,
  unread, and friends in one block. Splitting it across hooks means
  six hooks all subscribing to the same Tauri event stream and
  fighting over shared invariants like "active hub changed → reset".
- **Context costs more than it saves here.** The two fat-prop
  components (`ContentArea`, `ChannelSidebar`) are *not* deep trees —
  they are direct children of App.tsx. The "drilling" is one level.
  Context would replace one explicit interface with implicit coupling
  and make those components untestable without a provider harness.
  TypeScript inference on context with `T | undefined` defaults is
  also strictly worse than the current explicit prop interfaces.
- **C# mental model.** The dev is new to React. One big stateful
  parent + dumb children is easy to reason about (it maps to a
  ViewModel with child controls). Custom hooks plus context plus
  cross-hook coordination is a step into idiomatic-React territory
  with no payoff at the current size.
- **No state-library convention.** We've already committed to "React
  state + context covers everything." That convention does not say
  "use context aggressively"; it says "don't reach for Redux/Zustand."
  Plain hooks satisfy it.

**What this means in practice**:
- No `useFooDomain()` files under `src/hooks/`. If a piece of logic
  is genuinely reusable and pure (e.g., a typing-debounce helper, a
  reconnect-backoff helper), it can become a small custom hook — but
  scoped to one concern, not a domain.
- No new `*Context` providers. The existing top-level theme application
  via `data-theme` on the root element stays as-is.
- The fat prop interfaces on `ContentArea` and `ChannelSidebar` stay.
  They are the bill we pay for the explicit data flow.
- Future extraction targets are *handlers*, not state. If App.tsx grows
  again, pull pure helpers (URL builders, message formatters, sort
  comparators) into `src/utils/` — not into stateful hooks.

**Revisit when**:
- A second top-level surface starts mounting independently of App.tsx
  (e.g., a separate window, a popover that lives outside the React
  tree). At that point a context for shared identity/theme might pay
  off.
- The dev is comfortable enough with React idioms that the
  cross-domain coordination cost in App.tsx outweighs the cognitive
  cost of context wiring. That is a judgement call, not a metric.

**Supersedes**: the "future refactor could split state into context
providers per domain" hedge in [client.md](client.md). That option is
now explicitly off the table until the revisit conditions hit.

## Personal state lives on a home hub list; community state stays direct

**Decision**: a user designates a master-signed, ordered list of
**home hubs** that hold their *personal-axis* state — devices, prefs,
DMs, friends. Community-axis state (channel messages, voice,
alliances) still flows direct between client and the relevant
community hub. Writes to personal-axis state replicate across the
list; reads can hit any hub in the list.

**Alternative considered**: continue with no home hub at all (the
prior decision), pushing every personal-axis feature to invent its
own ad-hoc per-hub or per-device sync.

**Why a list wins**:
- Multi-device needs a single canonical place to publish device
  certs and revocations. Without one, every community hub would
  need its own copy and would drift.
- DMs need a canonical inbox view so phone + desktop see the same
  list. Spraying across community hubs without a canonical view
  forces every device to log into every hub.
- A *list* (rather than a single home hub) preserves the failover
  resilience that drove "DM failover, not load-balanced routing"
  below — any hub in the list can serve, and there is no single
  point of failure.
- Master-signed designations mean consumers never have to trust an
  individual home hub — they verify the master signature.

**What this supersedes**: the "Client connects directly to many hubs"
entry below was correct *for community traffic* but forced
personal-axis state into bad shapes. It is now scoped to community
traffic only; personal state goes through home hubs.

**Design docs**: [home-hub.md](home-hub.md) (storage layer) and
[multi-device.md](multi-device.md) (identity + pairing protocol).

## Channels are unified text + voice

**Decision**: every channel is both a chat room and a voice room. There
is no "text channel" vs "voice channel" type. Joining voice is something
a user *does* in a channel — not a property of the channel.

**Alternative considered**: a split model — separate channel types,
each doing one thing.

**Why unified wins**:
- Channel-as-place model: a channel is a *place*. People are there,
  talking and typing.
- Halves the channel count for the same expressiveness — communities
  don't need a "#raids" text channel and a separate "Raid Voice"
  channel; they have one "raids" room where both happen.
- Permissions, moderation, bans, naming, history all attach to the
  same entity.
- Schema is simpler: `channels` has no `kind` column. Voice is
  runtime state (`state.voice_channels` map keyed by channel id), not a
  persistent property.

**Implication for design**: when adding any channel feature, ask "does
this make sense for both chat and voice in the same room?" If yes,
build it once. If no, the feature probably belongs as a *channel
property* (e.g., `min_talk_power`) rather than a new channel kind.

## Client connects directly to many hubs

**Status**: partially superseded — see "Personal state lives on a home
hub list" above. This decision still holds for **community traffic**
(channels, voice, alliances), but **personal-axis state** (devices,
prefs, DMs, friends) now flows through a master-signed home hub list.

**Decision**: the desktop client connects to each hub directly. Hubs
are independent — they don't proxy each other's traffic.

**Alternative considered**: a "home hub" model where your home hub
proxies everything else.

**Why direct (for community traffic)**: simpler. Each hub is a self-
contained community. Cross-hub features (alliances, federated DMs)
are explicit opt-in protocols on top, not the default. The client
becomes the multi-hub orchestrator, not the hub server.

**Why this had to bend for personal-axis state**: see the home hub
list decision above — multi-device, DM unification, and prefs sync
all needed an anchor that "no home hub" couldn't provide.

## DM failover, not load-balanced routing

**Decision**: a user publishes an **ordered list** of delivery hubs in
their friend record. Sender tries primary → secondary → etc. on failure.

**Alternative considered**: load-aware / traffic-aware routing across
hubs.

**Why failover wins**: load-balancing needs gossip, cross-hub
consistency, and shared state we don't have. Failover gets ~90% of the
benefit at near-zero coordination cost. Don't add load-aware routing
without real telemetry justifying it.

## One device per account (today)

**Decision**: A recovery phrase is the secret. Pasting it on a device
*replaces* that device's identity; it doesn't sync.

**Alternatives considered**:
- HD-wallet style master seed → per-device subkeys via HKDF.
- "Home hub" picks a primary device and syncs an encrypted prefs blob.

**Why simple wins now**: multi-device adds key management, conflict
resolution, and revocation work that we don't yet need. The simple model
ships and is forward-compatible: the recovery phrase can later be
treated as a master seed without breaking existing identities (migrate
by deriving the existing key as "subkey 0").

**Revisit when**: design is now committed in
[multi-device.md](multi-device.md) (identity model + QR pairing
protocol) and [home-hub.md](home-hub.md) (storage layer). The
implementation is phased; this entry stays accurate as a description
of the *current shipped* behavior until phases 3-5 land.

## ROADMAP.md is gitignored

**Decision**: ROADMAP.md is the durable local task list. Not committed.

**Why**: it's a working document that changes hourly during a session;
versioning it produces noise without value. Public state lives in
README.md and `docs/`.

## Federated, not centralized

**Decision**: Communities are hubs. Hubs federate. No central server.

**Why**:
- Lets a community own its data and moderation policy.
- A single takedown doesn't kill the network.
- Matches the "many private servers" mental model people already have.

**Cost**: harder onboarding (you need a hub URL), harder discovery,
harder cross-community state. We accept these in exchange for community
sovereignty.

## Three crates, not a monorepo soup

**Status**: structurally superseded — the project has since been split
into six separate repos (Wavvon for docs, Wavvon-server for the Rust
workspace with `hub/`/`seed/`/`identity/` crates, Wavvon-desktop for
the desktop client and `voice/` crate, Wavvon-android, Wavvon-web,
Wavvon-discovery). The original rationale below still applies to the
crate-vs-feature-flag split inside Wavvon-server.

**Decision**: separate crates for the cross-cutting concerns (identity,
voice) rather than one giant crate with feature flags. Originally
expressed as a `shared/`, `server/`, `client/` top-level split in a
single monorepo.

**Why**: identity rules and voice rules must agree exactly between client
and server. One crate per cross-cutting concern prevents drift. Beyond
that, server and client have completely different shapes — separate
crates avoid a giant feature-flagged build.

## Tauri, not Electron

**Decision**: Tauri 2 + React for the desktop app.

**Why**: smaller binaries, native voice access via cpal, real OS APIs
without an Electron runtime. The cost is fewer pre-built integrations,
but for a voice-first app the OS-native audio path is non-negotiable.

## SQLite, not Postgres

**Decision**: each hub embeds SQLite.

**Why**: a hub is single-tenant by design. SQLite means zero-ops for the
operator (no DB to set up), trivial backups (one file), and good enough
performance for community-scale traffic. If we later want multi-tenant
hub farms, the storage layer can change underneath without affecting
the federation protocol.

## DMs as outbox, not session

**Decision**: federated DMs are mailbox-style — sender's hub queues
the message and pushes it to the recipient's hub.

**Why**: recipient's hub may be offline. Familiar mental model. Avoids
"home hub" picking — both hubs hold a copy by design. See
[federation.md](federation.md).

## No proof-of-work yet

**Decision**: anti-spam is in the ROADMAP, not shipped. The PoW
primitives exist (`identity/src/pow.rs` in Wavvon-server) but aren't
enforced.

**Why**: premature spam mitigation in a private-network product would
just annoy real users. Add when there's actual abuse to mitigate.
