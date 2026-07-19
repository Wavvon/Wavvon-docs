# Discord Server Import

A migration tool that reproduces a Discord server's **structure** —
category/channel tree, roles, and per-channel permission overwrites —
on a fresh Wavvon hub. The goal: a community that decides to move
doesn't have to rebuild everything by hand, which is the first
objection every switching community raises.

**Status: implemented 2026-07-04** (server `a85e37f`, crate
`crates/discord-import`), with one deviation from this doc: role
`color` is applied directly on `apply` (role appearance shipped in hub
`31c291b` before the importer did). **Not yet exercised live** —
`export` against a real bot token and `apply` against a running hub
remain to be done (unit coverage is fixture-based by design).

**Scope: structure only.** No message history, no member accounts, no
emoji in v1 (see §7).

---

## 1. Source of truth: the Discord Bot API, two-stage

Discord offers **no official server-structure export** to owners (the
personal "data package" covers only the requesting user's own data).
The legitimate, ToS-compliant path is a **bot** the server owner
creates and invites to their own guild with read permissions; guild
structure (channels, categories, roles, permission overwrites) is
readable via the standard Bot API with no privileged intents. User-token
scraping ("self-bots") is against Discord ToS and is a non-goal.

The tool runs in **two stages with a reviewable file between them**:

```
discord-import export   --guild <id>        # DISCORD_BOT_TOKEN env
        → import-manifest.json              # neutral, human-editable

discord-import apply    --hub <url>         # manifest → fresh Wavvon hub
        → import-report.txt                 # created / skipped / warnings
```

Why two stages: the operator can review and edit the manifest before
anything touches the hub (rename channels, drop dead categories, fix a
permission mapping); the export can run on a machine with Discord
access while the apply runs next to the hub; and the manifest — not
Discord — becomes the tool's real input format, so other sources
(Matrix, Slack, hand-written) can emit the same manifest later.

## 2. Tool shape

A new Rust crate `discord-import` in the server workspace, modeled
directly on `demo-seed` (`crates/demo-seed/src/main.rs`): a standalone
reqwest CLI with no compile dependency on `wavvon_hub`, using the same
Ed25519 challenge-response auth and the same 429-resilient send helper.
It drives **only public hub HTTP routes** — channel create
(`routes/channels.rs`), role create/update (`routes/roles.rs`), and
channel permission overwrites (`routes/channel_permissions.rs`). No new
hub surface is needed.

Like demo-seed, `apply` requires a **fresh hub** (refuses if channels
already exist) — idempotent re-runs and merge-into-existing are v2
concerns. The importing identity must be the hub admin (first user or
provided credentials, same options as demo-seed).

## 3. Manifest format

```jsonc
{
  "version": 1,
  "source": { "kind": "discord", "guild_id": "…", "guild_name": "…", "exported_at": 0 },
  "roles": [
    {
      "ref": "r1",                 // manifest-local id, referenced by overwrites
      "name": "Raid Lead",
      "priority": 40,              // from Discord position (see §4)
      "display_separately": true,  // Discord "hoist"
      "color": "#e67e22",          // applied only once role color ships (role-categories.md)
      "permissions": ["send_messages", "manage_messages"],
      "unmapped": ["MENTION_EVERYONE"]   // kept for the report, not applied
    }
  ],
  "channels": [
    {
      "ref": "c1",
      "name": "Games",
      "kind": "category",          // category | text | voice | announcement | forum
      "parent": null,
      "overwrites": [
        { "role": "r1", "allow": ["read_messages"], "deny": [] }
      ]
    }
  ]
}
```

`ref`s are manifest-local; `apply` maps them to created hub ids as it
goes. Order within siblings follows array order.

## 4. Mapping tables

### Channel kinds

| Discord | Wavvon | Note |
|---|---|---|
| Category | category (`is_category`) | Nesting depth 2 max on Discord — always fits. |
| Text | channel | Unified text+voice, so it gains voice for free. |
| Voice | channel | Same — a Wavvon channel *is* both. See merge note below. |
| Announcement | channel | Import as regular channel; converting to a banner channel is a post-import admin action (banner semantics differ). |
| Forum | forum channel | Direct — Wavvon forums shipped ([forum.md](forum.md)). Posts are content, not structure: not imported. |
| Stage / Directory / Store | **skipped** | Reported; no Wavvon equivalent. |

**Text+voice merge**: Discord communities often keep paired `#raids` +
`🔊 Raids` channels. Because Wavvon channels are unified, `export`
detects same-category name pairs (case/emoji-insensitive match after
stripping voice markers) and emits a **suggestion comment** in the
manifest — it never merges automatically. The operator deletes the
redundant entry if they agree.

### Roles

- `name` → `name`; `hoist` → `display_separately`; Discord `position`
  → `priority` (rescaled to preserve order); `color` → manifest
  `color`, applied only once role color ships
  ([role-categories.md](role-categories.md)) — until then it stays in
  the manifest harmlessly.
- `@everyone` → the hub's builtin everyone role (mapped, never created).
- **Permission bits → Wavvon constants** (`permissions.rs`):

| Discord | Wavvon |
|---|---|
| `ADMINISTRATOR` | `admin` |
| `VIEW_CHANNEL` | `read_messages` |
| `SEND_MESSAGES` | `send_messages` |
| `MANAGE_CHANNELS` | `manage_channels` |
| `MANAGE_MESSAGES` | `manage_messages` |
| `MANAGE_ROLES` | `manage_roles` |
| `KICK_MEMBERS` | `kick_members` |
| `BAN_MEMBERS` | `ban_members` |
| `MUTE_MEMBERS` / `DEAFEN_MEMBERS` | `mute_members` |
| `MODERATE_MEMBERS` (timeout) | `timeout_members` |
| `CREATE_EVENTS` / `MANAGE_EVENTS` | `create_events` |
| `MOVE_MEMBERS` | `move_members` (mapped 2026-07-19; shipped after this doc) |
| `USE_SOUNDBOARD` | `use_soundboard` (mapped 2026-07-19; shipped after this doc) |
| everything else | → `unmapped` list, reported |

### Channel permission overwrites

Discord **role** overwrites map 1:1 onto Wavvon's
`channel_permission_overwrites` (allow/deny per permission,
[nested-channels-ux.md](nested-channels-ux.md) §3), applied via
`PUT /channels/:id/permissions/:role_id`. Two semantic deltas are
**warned about in the report, not silently absorbed**:

- Discord **member** (per-user) overwrites → skipped; Wavvon per-user
  overwrites are deferred (§3.9). The report lists each one so the
  admin can hand-fix with a role.
- Same-level conflicts resolve **deny-wins on Discord, allow-wins on
  Wavvon** (§3.8). `export` flags any channel where a user-visible
  difference is possible (a role allows what another denies on the
  same channel).

### Not imported (reported, never silent)

Members and their role assignments (identities are keypairs — members
re-join via invite), message history, emoji/stickers/soundboard,
webhooks/integrations/bots, scheduled events, invites, bans.

## 5. Apply order and failure handling

1. Roles (skip `@everyone`, map it), collecting `ref → role_id`.
2. Channel tree, parents before children, collecting `ref → channel_id`.
3. Overwrites via the §3 admin routes.
4. Write `import-report.txt`: counts, skips with reasons, warnings.

Failures are **fail-forward**: one failed channel logs to the report
and continues (matching demo-seed's resilience posture); the report
ends with a clear PARTIAL banner if anything failed. The fresh-hub
precondition makes "wipe and re-run" the recovery path.

## 6. Operator flow (docs page, later)

1. Create a Discord application + bot, invite it to your server with
   `View Channels` (read-only), run `export`, review the manifest.
2. Stand up your Wavvon hub ([hub-operator-guide.md](hub-operator-guide.md)),
   run `apply` as the admin identity.
3. Read the report; hand-fix listed skips; post the Wavvon invite on
   the Discord server.

## 7. Deferred

- **Message history import** — large, needs identity attribution
  decisions (imported messages have no author keypair); revisit on
  demand.
- **Merge into a non-fresh hub / idempotent re-run** — v2.
- **Role colors applied** — automatic once role color ships
  ([role-categories.md](role-categories.md)); manifest already carries it.
- **Other sources emitting the manifest** (Matrix, Slack, hand-written
  generators) — the manifest is versioned and documented for this.
- **Custom emoji** — blocked on Wavvon custom emoji support.

---

## Decisions

- **Bot API export, not user-token scraping or the data package.** The
  data package doesn't contain server structure; user tokens violate
  Discord ToS. A read-only bot invited by the owner is the legitimate
  path and needs no privileged intents.
- **Two stages with a neutral, reviewable manifest.** Alternatives: a
  single live Discord→hub pipe (rejected — no review step, couples the
  tool to both APIs at once, can't run the halves on different
  machines), or importing DiscordChatExporter output (rejected as the
  primary input — third-party format, message-centric; it could become
  another manifest *producer* later).
- **Structure only in v1.** Structure is the rebuild-cost objection;
  history is a data-attribution problem (no author keypairs) with 10×
  the surface. Ship the 90% lever first.
- **Suggest, never auto-merge, text+voice channel pairs.** A wrong
  automatic merge destroys structure the operator wanted; a suggestion
  costs one manifest edit.
- **Fail-forward apply with a report, on a fresh hub only.** Matches
  demo-seed's posture; "wipe and re-run" beats partial-state repair
  logic in a v1 migration tool.
