# Code Audit — 2026-06-11

Two read-only reviews run after the screenshot work exposed a family of
web-client bugs. Findings only; nothing was changed during the audit.
Severity tags: **panic** / **bug-now** / **bug-when** (only when a
feature is used) / **perf** / **polish**. Effort: S/M/L.

Context that frames everything below: the web client was built as a
standalone copy of the desktop React components, and the copy was
incomplete. The four bugs fixed on 2026-06-11 (layout class, orphaned
CSS, message order, voice roster) were the first of this family; the
web audit found the rest.

---

## Strategic note

The **web client is the public demo surface** — the GitHub-Pages client
pointed at the hosted demo hub is the "nothing to install, try it now"
pitch (see [GROWTH.md], [DEMO-HUB.md]). Many bug-now items below
(message bleed, broken reactions/typing, Potemkin admin panel, dead
screen-share, orphaned CSS on mounted components) would give the exact
technical audience we're courting a poor first impression. Recommend a
focused web-client remediation pass **before** the demo hub goes public.

The COMPARISON.md table needs an honesty pass too: **browser client**,
**screen share**, and admin/moderation are marked ✅ but are currently
broken or absent on web; **voice does not work over a network at all**
(hub finding H7), so "voice channels ✅" + "no voice encryption" both
undersell the real state.

---

## HUB (Wavvon-server) — 21 findings

### Correctness / security
- **H1 [bug-now] poll + event phantom sender** — `routes/polls.rs:67-113`
  and the twin in `routes/events.rs:122-180` post their card with a
  68-zero sender and upsert a phantom `users` row (no name/roles) that
  appears in every member list + admin stats. Fix: use the creator
  pubkey as sender, drop the placeholder upsert. **S**
- **H4 [bug-now/security] federated-DM spoofing** — `routes/dms/messages.rs:488`
  `receive_federated_dm` is guarded by plain `AuthUser`, so any logged-in
  user can POST `/federation/dm` with an arbitrary `sender` and inject
  forged plaintext DMs. Fix: require caller to be a registered peer hub,
  or verify a sender signature. **M**
- **H7 [bug-now] networked voice is broken** — `routes/ws/handlers/voice.rs:127`
  registers every participant as `127.0.0.1:{udp_port}`; the relay loop
  (`main.rs:769-832`) matches inbound by real source addr and sends
  outbound to loopback. Voice only works when client and hub share a
  machine. Needs source-address learning (or WS-peer-IP + reported
  port). Confirm scope first — may be a known dev-only placeholder
  pending STUN/TURN. **M-L**
- **H2 [bug-now] presence single-session** — `routes/ws/connection.rs:27,388`
  `online_users` is a `HashSet` (boolean per pubkey): a 2nd session is a
  no-op and whichever disconnects first marks the user offline. Fix:
  refcount (`HashMap<String,usize>`). **S**
- **H3 [bug-now] bot_sessions single-session twin** — same file, bot WS
  sessions keyed by pubkey; a newer session overwrites the older's
  sender, old disconnect severs the live one. Same refcount/session-id
  fix; `screen_shares` cleanup has the same shape. **S-M**
- **H8 [bug-when] `migrate` ignores DATABASE_URL** — `main.rs:250` hardcodes
  sqlite; on a Postgres deployment it migrates a stray local file and
  reports success. **S**
- **H9 [polish] invalid CORS origins silently dropped** — `server.rs:51`
  `filter_map(...ok())`; a typo yields an empty allowlist, all browsers
  blocked, no log. Warn on unparseable/empty. **S**

### Rate limiter
- **H5 [bug-now] limiter keys on socket peer IP** — `rate_limit.rs:97`
  breaks behind the reverse proxy our own banner recommends: all clients
  arrive from the proxy IP, so AUTH limit (10 burst, 1/s) becomes a
  hub-wide login lockout. Add trusted-proxy / X-Forwarded-For mode. **M**
- **H6 [bug-now] IPv6 per-/128 bucketing** — `rate_limit.rs:48,64` lets one
  /64 mint unlimited buckets (limiter bypass); v4-mapped buckets split.
  Canonicalize v4-mapped, bucket IPv6 by /64. (No race found.) **S**

### Perf
- **H11 [perf] N+1 ×2 in get_messages** — `routes/messages.rs:634` runs
  load_reactions + load_reply_context per message (up to 201 queries /
  100-msg page) on the hottest path. Batch both. **M**
- **H12 [perf] missing index `messages(channel_id, created_at)`** — every
  message page is a full scan; also `messages(reply_to)` and
  `dm_messages(conversation_id, created_at)` (latter also needs a LIMIT). **S**
- **H13 [perf] federated_bans wrong-prefix index** — `moderation/helpers.rs:110`
  (runs on every send_message/send_dm) filters `target_master_pubkey`
  but PK prefix is `source_hub_pubkey`; the "indexed" comment is wrong.
  Add `idx_federated_bans_target`. **S**
- **H14 [perf] admin list_members nested N+M+1** — `routes/hub.rs:340`,
  no LIMIT. Batch into 3 queries. **M**
- **H15 [perf] farm-token path: DB write + 5 reads per request** —
  `auth/middleware.rs:300`. Skip last_seen write unless >60s stale;
  collapse reads. **M**
- **H16 [perf] federated DM delivery inline in send_dm** — `dms/messages.rs:293`
  blocks the sender's response on synchronous HTTP to each peer; the
  outbox worker already exists, enqueue instead. **M**

### Panic / hygiene
- **H17 [panic] `std::sync::Mutex .unwrap()`** — game/voice/metrics/reaper
  (`handlers/game.rs`, `handlers/voice.rs:464,618`, `metrics.rs:17`,
  `main.rs:899`): one poisoned lock cascades. Use
  `unwrap_or_else(|e| e.into_inner())` or `parking_lot`. **S**
- **H20 [hygiene] chat broadcast capacity 256, all kinds** — slow consumer
  silently drops chat messages with no client resync signal. Send a
  `lagged` frame / raise capacity. **M**
- **H21 [hygiene] handle_typing no subscribe/ban check** — channel-banned
  user can still broadcast typing. **S**
- H18 (`--doctor` socket release) and H19 (sync fs in async handlers,
  microsecond stalls) reviewed and judged fine / leave-as-is.

### Follow-ons surfaced during the 2026-06-12 security remediation
- **H22 [security — needs audit] `/federation/badge-offer` is unauthenticated** —
  no session/peer guard; relies solely on Ed25519 signature verification of
  the payload body. May be an intentional signed-push design, but it's the
  one `/federation/*` route with no caller auth — warrants a dedicated pass.
- **H23 [security] `preview.rs` SSRF guard not proxy-aware** —
  `is_private_ip` and the link-preview fetch path key on the raw socket IP,
  not the resolved client IP. Under `WAVVON_TRUSTED_PROXY`, the real client
  address should flow through the same `resolve_ip` path the rate limiter
  now uses. Surfaced while fixing H5/H6. **S-M**

---

## WEB CLIENT (Wavvon-web) — 25 findings

### WS dispatch / events
- **W1 [bug-now] cross-channel/cross-hub message bleed** — `App.tsx:411`
  appends every `message` event to the open channel regardless of
  channel/hub. Gate on active channel + hub. **S**
- **W2 [bug-now] handlers carry no hub identity** — `App.tsx:407-500`
  shares one handler object across all sockets; background hubs flip the
  active hub's banner, unread, voice rosters. Curry hub_id per socket. **M**
- **W3 [bug-now] outgoing typing missing `typing` bool** — `messages.ts:103`;
  server drops the frame. Nobody sees typing. **S**
- **W4 [bug-now] incoming typing misparsed** — `useTypingIndicators.ts:20`
  reads sender/sender_name vs server public_key/display_name; everyone
  is "Someone", stop events ignored. **S**
- **W5 [bug-now] reactions broadcast erases own "me" highlight** —
  `App.tsx:427` replaces wholesale; re-patch `me` like desktop. **S**
- **W6 [bug-now] server `error` WS messages dropped** — `ws.ts:65` no case;
  hub rejections invisible, no voice-join recovery. **S**
- **W7 [polish] voice_participant_speaking ignored** — speaking ring never
  lights; `voiceActiveUsers` has no setter (`App.tsx:217`). **S**
- **W8 [bug-now] screen-share viewing dead** — `onScreenShare:()=>{}`,
  `activeScreenShares=[]`, ws.ts dispatches none of the screen_share_*_in
  events. Components exist but have no inputs. **L**
- **W9 [bug-when] dm_member_changed ignored**. **S**
- **W10 [bug-when] reconnect never re-auths** — `ws.ts:88` retries same
  token forever; `reauthorizeHub` has zero callers. After ban/purge:
  stuck "Reconnecting…" forever. **M**
- **W11 [polish] dead onPin/onPoll + wrong poll event names** — ws.ts
  dispatches poll_created/updated/deleted the server never sends. **S**

### REST hitting nonexistent endpoints (all swallowed by `catch {}`)
- **W12 [bug-now] add-reaction 405** — web `PUT /reactions/{emoji}`; server
  wants `POST .../reactions` JSON body. Adding silently no-ops. **S**
- **W13 [bug-now] entire hub-admin surface uses invented routes** —
  `/admin/*` vs real `/hub/*`, `/moderation/*`. Admin shows empty lists,
  saves nothing, kick/ban/approve + channel reorder all silently no-op. **M**
- **W14 [bug-when] events: unmounted UI + wrong wire types + wrong methods** —
  `types.ts:91` start_at/rsvps vs server starts_at/rsvp_counts; rsvp
  PUT/DELETE vs server POST. **M**
- **W15 [bug-when, destructive] farm unsuspend re-suspends** — `farms.ts:92`
  PATCHes suspend with {suspended:false}; handler ignores the field and
  re-stamps suspended_at. Needs a server-side unsuspend too. **S**
- **W16 [bug-now] in-channel search never executes** — setSearchResults
  never called; unused helper targets nonexistent `/messages/search`.
  Real route: `GET /channels/{id}/messages?q=`. **M**

### Hub-connect bootstrap
- **W17 [bug-when] no lobby / pending-approval gating** — `App.tsx:524`
  fires everything in parallel; pending members on approval hubs get a
  broken empty UI instead of the landing screen. **M**
- **W18 [bug-when] alliance shared channels never fetched** — `allianceChannels`
  hardcoded empty (`App.tsx:221`). **S**
- **W19 [bug-now] mention ping + OS notifications are no-ops** — toggle
  exists, nothing plays a sound or posts a Notification; notify-mode not
  enforced on unread bumps. **M**
- **W20 [polish] pingHub never called** — ping badges never show. **S**
- **W21 [bug-now] UserContextMenu unreachable** — `onSetUserContextMenu:()=>{}`
  + diverged shapes; right-click member → block/ignore/profile all dead. **S**
- **W22 [bug-when] group-DM encryption unsupported** — `dms.ts:93` falls back
  to plaintext for groups, ignores group_encrypted_envelope; desktop-sent
  group DMs render as empty bubbles. **M-L**
- **W23 [bug-now/UX] scroll position never tracked** — `onMessagesScroll:()=>{}`;
  "N new messages" pill can't fire correctly. **S**
- **W24 [bug-when/polish] copied-but-unmounted components** — DiscoverPage,
  IdentityBackupSection, Dnd settings, ExternalBotSection, PollComposer,
  GameSessionPanel, EventsPanel all have zero importers; web Settings has
  4 tabs vs desktop 7. Look done in the tree, unreachable. **L**
- **W25 [bug-now] 41 orphaned CSS classes on MOUNTED components** — global
  Ctrl+K search (8), member-section grouping, sidebar footer
  (user-identity/user-actions/voice-status-bar), reaction-picker-overlay,
  pinned-message-row, hover-submenu, bot-token-*, event-card, poll-card,
  screen-share-main-wrap. Port the blocks from desktop styles.css. **M**
- **W26 [bug-now] admin panel unreachable for everyone** — web `isAdmin`/`canManageGames` (App.tsx) checked for a `manage_hub` permission that does not exist in the hub (`permissions.rs` uses `admin` as the wildcard superuser). Result: 'Hub settings' never rendered, the whole HubAdminPage was unreachable by any user including the owner. FIXED 2026-06-12 (commit 213772c): check `admin` like desktop does. **S**
- **W27 [bug-now] demo-seed exports non-functional recovery phrases** — the `recovery_phrase` written to demo-credentials.json by tools/demo-seed does not round-trip to the keypair the seeder actually seeded (seeded owner Nova was pubkey b3fc8e26…, but the exported phrase recovers to a different, nameless keypair). Exported credentials cannot log into the seeded identities. Hub-side/tool bug, blocks demo-hub re-seed + screenshot logins. NOT yet fixed. **M**

### Cross-cutting
- Nearly every REST bug (W12-W16) was masked by blanket `catch {}` /
  `Promise.allSettled`. Adding a dev-mode `console.warn` on 404/405 in
  `hubFetch` would have caught them all and will catch the next copy gap.

---

## Suggested first-cut priority (reviewer's pick, you decide)

**Demo-blocking web bugs (do before the public demo hub):**
W1+W2 (message bleed/misattribution), W12 (reactions), W13 (admin
Potemkin panel), W3+W4 (typing both ways), W25 (orphaned CSS on mounted
components), W10 (reconnect reauth), W6 (surface hub errors).

**Hub correctness/security:**
H4 (DM spoofing), H1 (phantom sender, spec ready), H2+H3 (presence +
bot refcount), H5+H6 (rate-limiter keying), H12+H13 (two indexes).

**Confirm-scope-first:** H7 (networked voice) — decide whether networked
voice + voice encryption is one initiative for the architect.
