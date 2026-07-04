# Security Audit — 2026-07-04 feature batch

Adversarial review of the day's new code (channel permission
overwrites, role categories, channel permalinks, deep-nesting sidebar,
Discord import). Four parallel reviewers, one per surface. Findings
verified against the code by hand before recording. Labeled by
component (H = hub/server, W = web client, D = discord-import crate).

**Two HIGH findings (H1, H2) should block push** — both are
privilege-escalation / private-content disclosure introduced by the
channel-permission-overwrites feature itself.

## H1 (HIGH) — WS explicit `Subscribe` bypasses channel read-gating

`crates/hub/src/routes/ws/handlers/screen.rs:25`. `handle_subscribe`
does `cs.subscribed.insert(channel_id)` with **no permission check**;
the receive loop gates delivery only on set membership. Auto-subscribe
(`ws/connection.rs`) is read-gated, but this explicit path is not — so
any authenticated member who sends `{"type":"Subscribe","channel_id":
"<private>"}` is thereafter pushed that channel's live messages, edits,
typing, reactions, and pins. Channel ids for hidden channels leak via
permalinks and via H3/H4.
**Fix**: resolve `channel_permissions` for the requester and require
`READ_MESSAGES` before inserting into `subscribed`; reject otherwise.

## H2 (HIGH) — Channel-permission PUT lacks priority / self-grant guard → subtree admin escalation

`crates/hub/src/routes/channel_permissions.rs:166-176`.
`put_channel_permissions` checks only `MANAGE_ROLES` on the channel,
then accepts any permission in `ALL_PERMISSIONS` — which **includes
`admin`** (`permissions.rs:40`). Unlike the hub-wide role routes
(`roles.rs` assign/update/delete all enforce
`role.priority >= perms.max_priority → 403`), this route has no
priority guard and no "can't grant a permission you don't hold" check.
A user with only `MANAGE_ROLES` on channel `C` (the delegated
subtree-manager the feature exists to enable) calls
`PUT /channels/C/permissions/<a role they hold>` with
`{"allow":["admin"]}` and `fold_overwrites` inserts `admin` into their
effective set for `C` and its whole subtree — full escalation. They can
also target higher-priority roles (e.g. `builtin-owner`), which the
hub-wide route forbids.
**Fix**: mirror the hub-wide guards — reject if `role.priority >=
caller.max_priority`; forbid granting `admin`; forbid allowing any
permission the caller doesn't themselves hold on that channel. DELETE
route (`:276`) needs the priority guard too.

## H3 (MEDIUM) — Events routes not channel-read-gated

`crates/hub/src/routes/events.rs`: `list_events:271` and
`get_event:309` ignore the caller's channel permissions, leaking
title/description/location/**channel_id** for events in hidden
channels; `create_event:215` gates on hub-wide `CREATE_EVENTS`, so a
user denied on a channel can still create events targeting it.
(Already on ROADMAP known issues from the events design pass; audit
confirms it and adds `get_event`/`create_event`.)
**Fix**: gate all three through `channel_permissions`; filter the list
by effective `READ_MESSAGES`.

## H4 (MEDIUM) — `GET /channels/:id/pins` not read-gated

`crates/hub/src/routes/pins.rs:116` (`list_pins`). Returns pinned
message bodies (content, sender, timestamps) for any channel id with
only an existence check — discloses private-channel pinned content to
any authenticated user. **Fix**: require `READ_MESSAGES` via
`channel_permissions`. (Related low: `pin_message:38`/`unpin_message:93`
still gate on hub-wide `MANAGE_MESSAGES` rather than channel-scoped —
write-side consistency, low impact.)

## D1 (HIGH, tool-only) — Discord importer disables TLS verification on the token-bearing client

`crates/discord-import/src/main.rs:154` sets
`danger_accept_invalid_certs(true)` on the client used for hub auth and
every `bearer_auth(token)` call. A network MITM presents any cert,
completes the Ed25519 challenge, and captures the hub **owner** session
token → full hub takeover. Copy-pasted from `demo-seed` (same line at
`demo-seed/src/main.rs:445`), but far more dangerous here because this
tool authenticates with an owner token against real hubs. The export
client (to discord.com) correctly verifies TLS — only the hub client is
broken.
**Fix**: drop the flag, or gate behind an explicit `--insecure` /
loopback-only. Scrub the same line from `demo-seed` while there.
Compounding **D2 (MEDIUM)**: `--hub` accepts plain `http://` with no
scheme check (`main.rs:131`), sending the owner token in cleartext.

## W1 (MEDIUM, admin-gated) — Unvalidated hub `color` in CSS `background` → network beacon

`apps/web/src/components/RolesSection.tsx:116` and
`RoleCategoryManager.tsx:132`: `style={{ background: role.color ?? …}}`
with `role.color`/`cat.color` taken raw from the hub and never
validated on the render path. A malicious hub returning
`color: "url(https://attacker/beacon)"` makes the viewer's browser
fetch that URL when the swatch renders — IP/UA leak / tracking pixel /
limited browser-side SSRF. Not XSS (single `background` value; no
`;`/`</style>` breakout). Reach limited to users with role-management
on the hostile hub.
**Fix**: validate against the existing `HEX_RE` on render, or route the
swatch through the same `color-mix` custom-property mechanism the
member-facing badge already uses safely.

---

## Lower-severity / robustness

- **D3 (LOW)** — `retry.rs:44-58`: `Retry-After` from an (MITM-able)
  hub is fed to `Duration::from_secs_f64` uncapped; `1e400` → INFINITY
  → panic, `1e12` → overflow panic, `999999` → multi-day stall. Cap and
  reject non-finite. Crashes/hangs the tool only.
- **D4 (LOW)** — manifest `read_to_string` + `from_str` uncapped
  (local operator file; JSON has no entity expansion). Cyclic manifest
  `parent` refs are safe — `depth_of` caps at 64 hops.
- **H5 (LOW)** — role permission/name/priority changes write no audit
  entry (only `role.appearance_updated` does); audit writes are
  fire-and-forget `tokio::spawn` (codebase-wide pattern, not new).
- **Icon validation gap (LOW)** — `is_valid_icon` accepts any ≤16-byte
  whitespace-free string (e.g. `<svg/onload=1>`), not a real emoji.
  Confirmed NOT XSS today (rendered as escaped React text), but a trap
  for future HTML-context consumers. Overlaps the existing
  icon-shortcode known issue.

## Verified CLEAN

- Permission **fold** logic (allow-wins within level, child-over-parent,
  `admin` immune to deny), ancestor-chain 64-hop cycle cap, all SQL
  parameterized (H).
- Role-categories authz (every mutation `MANAGE_ROLES`-gated, priority
  check present on role routes), color validation, `category_id` FK +
  app check, tri-state null-clearing not bypassable (H).
- `roleTintStyle` custom-property + `color-mix` path — the only
  member-facing color surface — safe (W).
- `parseHubInput`/permalink deep-links: no cross-origin token leak, no
  auto-connect to unjoined hosts, no open-redirect (W).
- Discord importer secret handling (token never touches manifest/report/
  logs), path handling, JSON-escaped names, fresh-hub guard cannot
  clobber (additive-only; overwrites target only this-run ids) (D).
