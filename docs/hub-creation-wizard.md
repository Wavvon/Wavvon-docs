# Hub Creation Wizard

Getting from "I want a community" to "my hub is live" today means cloning
a repo, picking channels and roles by hand, and remembering a registration
step. This doc designs the zero-to-live path: a catalog of signed config
templates on the discovery service, a hub that bootstraps itself from one
on first launch, and a web wizard that ties the two together and hands the
operator a deployment command (or a one-click managed farm).

Three pieces, each useful alone:

| Piece | Where it lives | What it does |
|---|---|---|
| 1. Template catalog | Wavvon-discovery | Signed JSON starter configs, self-submitted |
| 2. First-run bootstrap | Wavvon-server (`hub/`) | Hub applies a template on empty-DB first launch |
| 3. Creation wizard | Wavvon-discovery (`/new`) | Web flow: pick template → customise → deploy |

The constraint that shapes all three: **no central authority**. Templates
are authored by their signing key, not approved by discovery; the wizard
generates a command the operator runs (or a farm call the operator's own
keypair authorises); the catalog re-validates signatures on a schedule
rather than gatekeeping submissions. This is the same signed-listing
primitive hubs, bots, games, and farms already use
([hub-discovery.md](hub-discovery.md), [farm-impl.md](farm-impl.md)).

---

## 1. Hub config templates catalog

**Decision**: a library of Ed25519-signed JSON templates on
Wavvon-discovery. Each template describes an initial hub config —
channels, roles + permissions, settings, welcome message, suggested bots,
tags. Operators pick one when creating a hub. Authorship is cryptographic:
the template is signed by its author's key, the pubkey *is* the identity,
no discovery accounts exist.

Template document:

```json
{
  "template_id": "gaming-community-v1",
  "name": "Gaming Community",
  "description": "Ready-made setup for gaming communities.",
  "author_pubkey": "<hex>",
  "version": "1.0.0",
  "channels": [
    { "name": "general", "type": "text" },
    { "name": "announcements", "type": "text", "min_talk_power": 100 },
    { "name": "voice-lounge", "type": "text" },
    { "name": "Gaming", "is_category": true }
  ],
  "roles": [
    { "name": "Member", "permissions": ["read_messages", "send_messages"] },
    { "name": "Moderator", "permissions": ["manage_messages", "mute_members", "kick_members"] }
  ],
  "settings": {
    "min_security_level": 8,
    "require_approval": false
  },
  "welcome_message": "Welcome! Check out #announcements for rules.",
  "suggested_bots": ["https://example.com/modbot/manifest.json"],
  "tags": ["gaming"],
  "signature": "<hex>"
}
```

The `signature` covers the canonicalised document with the `signature`
field removed — the same scheme game manifests use. Discovery verifies it
with `author_pubkey` on submission and re-verifies on a schedule (like hub
and bot listings); invalid or stale templates are dropped.

**Catalog API** (Wavvon-discovery, Next.js):

```
GET    /api/templates
       ?tag=<tag>      filter by tag (repeatable)
       &page=<n>       pagination (default 1, 20 per page)
→ { templates: Template[], total, page }

GET    /api/templates/:id
→ Template | 404

POST   /api/templates/register
       body: the signed Template document
→ 201 | 400 invalid_signature | 409 already_registered (use the same key to update)

DELETE /api/templates/register
       body: { template_id, author_pubkey, nonce, signature }
→ 204 | 401 invalid_signature | 404
```

Self-submission and withdrawal use the same signed-payload mechanism as
hub and farm listings: the author signs, discovery verifies against the
declared pubkey. Updating a template is re-submitting under the same
`author_pubkey` + `template_id`.

**Templates are advisory, not binding**. Applying a template seeds a hub's
initial state and then has no further hold — the operator can override any
channel, role, or setting immediately after. The template is a starting
point, never a constraint enforced over time.

**Alternative considered — curated-only catalog**: discovery vets and
publishes a fixed set, no self-submission. Rejected on sovereignty grounds:
every other catalog in the system (hubs, bots, games, farms) is open
self-submission with author signing, and a curated template list would make
discovery the one authority that decides what a hub can start as.
Discovery may carry a `featured` flag for well-known templates (a display
hint, surfaced first in the wizard) but never controls what can be
submitted.

**Alternative considered — templates hosted on the hub binary**: ship a
handful of built-in templates compiled into `wavvon-hub`. Rejected as the
*catalog* model — it can't grow without a release, and a community can't
share a setup it likes. A small built-in "blank" default stays in the
binary as the no-network fallback; everything richer lives in the catalog.

---

## 2. Hub first-run bootstrap

**Decision**: on first launch with an empty database, the hub checks for a
template source and applies it automatically — no second command. If no
source is configured, first launch proceeds as today (blank hub).

**Triggers** (checked in order):

1. `WAVVON_BOOTSTRAP_TOKEN=<token>` — a wizard-issued token that resolves
   to a *customised* config (see below). Takes precedence.
2. `WAVVON_TEMPLATE_URL=<url|id>` env var — a raw template JSON URL, or a
   discovery template ID in `wavvon://templates/<id>` form.
3. `--template <url|id>` CLI flag — same resolution as the env var.

If none is set, no template is applied.

**Bootstrap process** — runs inside `db::migrations::run`
(`hub/src/db/migrations.rs` in Wavvon-server), after the schema is
created, *only if the `channels` table is empty*:

1. Resolve the source to template JSON. A bare ID is resolved via
   `GET {discovery}/api/templates/:id`; a `wavvon://templates/<id>` URI
   resolves the same way against the configured discovery URL; a full URL
   is fetched directly.
2. Verify the author signature against `author_pubkey`. On failure, log a
   warning and proceed with a blank hub — a bad template never blocks
   startup.
3. Apply: insert channels (categories first, then channels referencing
   them), insert roles with their permission sets, write the
   `hub_settings` rows (name, `min_security_level`, `require_approval`,
   etc.), and post `welcome_message` to `#general` as a system message.
   `suggested_bots` are recorded as pending suggestions surfaced in the
   admin panel, not auto-installed (bot install is an explicit admin act
   per [bots.md](bots.md)).
4. Log: `Hub bootstrapped from template: <template_id>`.

**Idempotency**: after a successful bootstrap, a `bootstrapped_at` row is
written to `hub_settings`. Subsequent restarts see a non-empty `channels`
table (and the marker) and skip bootstrap entirely. Restarting with
`WAVVON_TEMPLATE_URL` still set is safe — it does nothing.

**Bootstrap token** (the wizard handoff): when the creation wizard
generates a deployment command, it also mints a signed 24-hour one-use
token. On first launch the hub redeems it by calling
`POST {discovery}/api/bootstrap/redeem` with the token; discovery returns
the *customised* config the operator chose in the wizard (name, icon,
description, channel overrides, approval setting) layered over the base
template, and marks the token used. This is why step 1 above takes
precedence — the token carries the operator's customisations, the raw
template URL carries only defaults.

The token is a one-time-use JWT signed by the discovery service. The hub
does not verify the JWT itself (it has no discovery pubkey cached); it
simply presents the token to discovery's redeem endpoint, which owns
validation and single-use enforcement. A reused or expired token returns
`410 token_consumed` / `410 token_expired`, and the hub falls back to the
embedded `WAVVON_TEMPLATE_URL` if one was also set, else a blank hub.

**Alternative considered — a separate `bootstrap` subcommand**
(`wavvon-hub bootstrap --template <id>`). Rejected: it adds a command the
operator must remember and sequence correctly, and risks being run twice.
Folding bootstrap into the empty-DB branch of the existing migration path
means it fires exactly once, automatically, with no new operator surface.

**Alternative considered — bootstrap on every empty-table, not just
empty-`channels`**. Rejected as too broad: `channels` is the cleanest
single signal that this is a fresh hub, and keying off one table avoids
partial-apply ambiguity if a future migration adds tables.

---

## 3. Hub creation wizard on discovery

**Decision**: a multi-step web flow at `discovery.wavvon.app/new` that
walks an operator from zero to a live hub, ending in either a one-click
managed-farm hub or a copy-paste deployment command. The wizard is a web
page on discovery, not part of any client.

**Steps**:

1. **Pick a template** — browse the catalog (Section 1), filter by tag,
   preview channels / roles / default settings. `featured` templates show
   first. **Blank** is always an option.
2. **Customise** — hub name, icon upload, description, public tags,
   optional channel-name overrides of the template defaults, and whether
   new members require approval.
3. **Choose a deployment path**:
   - **Managed farm** (no server needed) — pick a farm from the farm
     catalog ([farm-impl.md](farm-impl.md) Section E), one click, hub goes
     live, URL shown. The wizard calls `POST /farm/hubs` on the chosen
     farm, authenticated by the operator's keypair.
   - **Docker** — a `docker run` command with all env vars pre-filled:
     hub name, `WAVVON_BOOTSTRAP_TOKEN`, discovery URL, and the registration
     opt-in flag.
   - **Binary** — the equivalent shell command for a downloaded binary.
4. **Done** — link to the new hub URL, link to its admin panel, and a
   copy-able invite link.

**Bootstrap token lifecycle**: generated by discovery at step 3, valid 24
hours, single use. The hub redeems it via `POST /api/bootstrap/redeem`
(Section 2); discovery returns the customised config JSON and marks the
token consumed. The token never embeds secrets the hub couldn't otherwise
fetch — it is a pointer to the wizard's stored customisation, scoped and
time-boxed.

**Farm integration** (managed-farm path): the wizard calls the chosen
farm's public `POST /farm/hubs` (the Phase 2/3 hub-provisioning API in
`farm/src/routes/` in Wavvon-server), authenticated by the operator's
farm session — the operator authenticates to the farm from the wizard
first, exactly as the client's farm picker does
([farm-impl.md](farm-impl.md) Section C). The farm provisions the hub and
returns its URL; the wizard shows it. For farm-hosted hubs the bootstrap
config is passed through `POST /farm/hubs` rather than a redeem token,
since the farm spawns the hub and can hand it the config directly — the
token path is for self-hosted Docker/binary deployments that pull from
discovery on first launch.

**Auto-registration with discovery**: after a successful first launch, a
self-hosted hub can register itself on the discovery directory by calling
`POST /api/hubs` (the existing hub-listing route,
[hub-discovery.md](hub-discovery.md)). Default behaviour is to *log* the
registration command (and pre-fill it in the Docker/binary path) for the
operator to run deliberately. Full hands-off registration is opt-in via
`WAVVON_DISCOVERY_AUTOREGISTER=true` — listing a hub publicly is a choice,
so the silent path is opt-in, not default. Managed-farm hubs follow the
farm's own `allow_discovery_listing` flow instead.

**Alternative considered — wizard as part of the desktop client**.
Rejected: the wizard must be reachable *before* you have any hub to
connect to, and a chunk of its value (Docker/binary command generation,
managed-farm signup) is for people who haven't installed a client. A web
page on discovery is the natural zero-install entry point. The client's
existing in-app "Create a hub" flow ([farm-impl.md](farm-impl.md) Section
C) covers the already-a-user-on-a-farm case and coexists with this.

**Alternative considered — CLI-only setup wizard**
(`wavvon-hub setup --wizard`, interactive prompts). Valuable for server
operators who live on the command line, but useless to managed-farm users
who never run a binary. The two can coexist; the web wizard is the primary
path and the CLI wizard is a stretch goal (deferred below).

---

## Implementation summary

What each repo owns. Engineers should not drift across this boundary.

**Wavvon-discovery** (Next.js):
- Template catalog: `/api/templates`, `/api/templates/:id`,
  `POST`/`DELETE /api/templates/register`. Signature verify on submit +
  scheduled re-validation, `featured` flag, listing DB table.
- Bootstrap tokens: mint at wizard step 3, `POST /api/bootstrap/redeem`
  with single-use + 24h enforcement, customisation storage keyed by token.
- Wizard UI at `/new`: template browse/preview, customise form, deploy-path
  selector, command generation, farm-call integration, done page.

**Wavvon-server** (`hub/` crate):
- Bootstrap in `hub/src/db/migrations.rs`: empty-`channels` branch,
  template resolve + signature verify, apply channels/roles/settings/
  welcome message, `bootstrapped_at` marker, token-redeem fetch.
- Config plumbing for `WAVVON_TEMPLATE_URL`, `WAVVON_BOOTSTRAP_TOKEN`,
  `WAVVON_DISCOVERY_URL`, `WAVVON_DISCOVERY_AUTOREGISTER` (read in
  `hub/src/main.rs` / config).
- Reuse the existing `POST /api/hubs` discovery registration for autoreg.

**Wavvon-server** (`farm/` crate):
- `POST /farm/hubs` already exists (Phase 2/3); the wizard is a new
  *caller* of it. The pass-through bootstrap config on farm-spawned hubs
  reuses the Phase 3 spawn-payload path (`owner_pubkey`, name, icon) — no
  new farm route needed for the managed path.

**Clients** (Wavvon-desktop, Wavvon-web, Wavvon-android): no changes
required for this design — the in-app "Create a hub" flow is already
covered in [farm-impl.md](farm-impl.md). The wizard is a separate web
surface.

---

## What's deferred

- **CLI setup wizard** (`wavvon-hub setup --wizard`) — interactive prompts
  for server operators. Coexists with the web wizard; lower priority
  because it doesn't serve managed-farm users.
- **Template versioning / migration** — a template author bumps `version`;
  there is no story for re-applying an updated template to hubs already
  bootstrapped from an older version. Templates are one-shot at first
  launch by design; live re-templating is out of scope.
- **Auto-installing suggested bots** — `suggested_bots` are surfaced to the
  admin, not installed. Auto-install would need the bot's permission grant
  to be reviewed, which is an explicit admin act ([bots.md](bots.md)).
- **Template ratings / popularity** — no usage signal flows back to
  discovery (the catalog never learns which templates were picked), so any
  "most used" ranking is deferred. `featured` is a manual display hint
  only.
- **Wizard-driven binary download** — the binary path emits a command, not
  a download. Bundling the right platform binary into the flow depends on
  the packaging work ([packaging.md](packaging.md)).
- **Customisation beyond first launch via token** — the redeem token
  carries the wizard's choices once; there is no re-redeem to change config
  later. After first launch, config changes go through the normal admin
  surface.

## Cross-references

- [hub-discovery.md](hub-discovery.md) — the directory + signed-listing
  primitive templates reuse; `POST /api/hubs` registration
- [farm-impl.md](farm-impl.md) — `POST /farm/hubs` provisioning, farm
  catalog, in-client create-a-hub flow
- [bots.md](bots.md) — bot install is an explicit admin act;
  `suggested_bots` are suggestions only
- [decisions.md](decisions.md) — top entry logs the sovereignty rationale
  for self-submitted templates
