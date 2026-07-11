# Bot capability layer

The connective design for the "give bots a Telegram-class runtime and
games fall out" pillar ([future-features.md §3](future-features.md),
[gaming.md](gaming.md)). It does **not** restate the individual pieces —
it defines the *grant model* that governs them and the runtime choice
that turns "a bot with capabilities" into "a game."

**Status: design.** Several legs already ship in isolation — message
components + embeds + mini-app launch ([bots.md §11, §17](bots.md)),
`can_speak_voice` audio injection ([soundboard.md §2](soundboard.md)),
the screen-share relay ([ws-protocol.md](ws-protocol.md) `screen_share_*`).
What is missing is the *consent spine* that ties requesting, granting,
and gating together, plus the promotion of the mini-app panel into a
game surface. That spine is this doc.

---

## Decisions TL;DR

| # | Decision | Alternative | Why this won |
|---|---|---|---|
| 1 | Capabilities are **requested by the bot, granted by the admin**; the runtime gates on the *granted* set, never the self-declared set. | Keep today's self-declared `bot_profiles.capabilities` as the gate (an invite-time "speed bump", [bots.md §13](bots.md)). | Media/UI/camera are higher-risk than message-read; silent self-escalation is unacceptable for them. Explicit grant matches the per-hub trust boundary bots already live under ([bots.md §2](bots.md)). |
| 2 | Interactive UI is **two-tier**: declarative components for chrome + simple flows, sandboxed webview for the rich runtime. The "game modal" is the shipped mini-app panel promoted to a focus-taking overlay. | A single declarative game-DSL rendered by the hub client. | A DSL can't express canvas / gamepad / per-frame draw without becoming a browser. The webview already *is* a sandboxed browser with a scoped token ([bot-mini-apps.md](bot-mini-apps.md)); don't reinvent it. |
| 3 | Video/canvas injection **reuses the screen-share relay wholesale**, gated exactly like `can_speak_voice`. | A new bot-video API + relay path. | Mirrors the soundboard decision ([soundboard.md](soundboard.md) "reuses the WS voice relay wholesale"): the relay is content-opaque; a bot is just another sender. |
| 4 | The hub stays **dumb about games**. No game state, no lobby logic, no scoring in the hub — it relays. | Hub-hosted game/lobby state (the removed `gaming.md`/`games-sdk.md`, descoped 2026-06-26). | The removed spec made the hub the bottleneck for every new game. Bot-owned state + hub relay is the whole bet ([gaming.md](gaming.md), [bot-mini-apps.md](bot-mini-apps.md)). |
| 5 | Grants are **revocable and operator-killable** per capability class. | Grant-at-invite only. | Abuse response and a hub-wide off-switch (like `bots_allow_camera`) need to exist before video/voice bots are common. |

---

## 1. Capability grant model

### Three sets, one effective gate

Today `bot_profiles.capabilities` (`hub/src/db/migrations.rs:694`, JSON
array, default `'[]'`) holds a **self-declared** list and the voice gate
reads it directly (`hub/src/routes/voice_ws.rs:72-92`). This doc splits
the concept in two and makes the gate check the intersection:

- **Requested** — `bot_profiles.capabilities`, unchanged. What the bot
  *asks* for, declared in `bot_meta.capabilities` at auth
  (`hub/src/auth/handlers.rs:180`) or via `PUT /bots/me/profile`.
- **Granted** — a new `bot_capability_grants` row per capability,
  writable only by an admin. What the hub *permits*.
- **Effective** = requested ∩ granted. The runtime gate checks this.

A capability the bot never requested is never granted (nothing to
consent to); a capability requested but not granted is inert. This is
purely additive to the shipped gate — a migration backfills grants from
existing `capabilities` so already-approved voice bots keep working
(decision 1 does not break [soundboard.md §2](soundboard.md)).

### Capability registry

| Capability | Risk | Consent | Unlocks |
|---|---|---|---|
| *(baseline)* message components, embeds, mini-app **launch card** | low | none | Declarative buttons/selects/embeds ([bots.md §11, §15](bots.md)); the "Play" CTA itself |
| `can_read_message_content` | medium | admin grant | Full message bodies ([bots.md §13](bots.md)) |
| `can_use_interactive_ui` | medium | admin grant | Opening a **mini-app / game modal** webview (§2) |
| `can_speak_voice` | medium | admin grant | Audio injection into the voice relay ([soundboard.md §2](soundboard.md)) — *shipped gate, now grant-backed* |
| `can_inject_video` | high | admin grant | Video/canvas frames into the screen-share relay (§3) |
| `can_use_camera` | high | admin grant **+** operator `bots_allow_camera` | Mini-app `getUserMedia` ([bot-media.md](bot-media.md)) |

Baseline UI (declarative components, embeds, the launch card) stays
ungated: the hub renders it, it can't run arbitrary code, and it already
ships. Everything that runs third-party code (webview), pushes media, or
touches a device sensor requires a grant. The hub rejects unknown
capability strings at auth time, unchanged ([bots.md §13](bots.md)).

### Consent flow

1. Bot requests capabilities in `bot_meta` (invite acceptance / auth).
2. Admin opens Hub Settings → Bots → [bot] → Capabilities. Each
   requested-but-ungranted capability shows with its risk copy (the
   [bots.md §13](bots.md) warning text, now a real toggle rather than a
   one-time speed bump). High-risk rows carry an extra line; camera also
   surfaces the `bots_allow_camera` operator prerequisite.
3. Admin toggles grants. `PUT /admin/bots/:pubkey/capabilities` replaces
   the grant set atomically and emits `bot.capabilities_changed` on the
   audit stream.
4. The bot receives a `capabilities_changed` push over its WS so it can
   stop advertising a game it can no longer run.

### Effective-capability resolver

A single helper — call it `effective_capabilities(bot_pubkey)` in a
generalized `hub/src/bots/capabilities.rs` — returns requested ∩ granted
and is the *only* thing the gates call. The shipped voice gate
(`voice_ws.rs`) moves to it; the video gate (§3) and mini-app open (§2)
call the same helper. One resolver keeps the three gates from drifting.

---

## 2. Interactive-UI runtime choice

**Recommendation: keep both surfaces; do not collapse them.**

| Surface | Shipped as | Trust | Use for |
|---|---|---|---|
| **Declarative components** (buttons, selects, embeds) | [bots.md §11, §15](bots.md); WS `component_interaction` ([ws-protocol.md](ws-protocol.md)) | Hub-rendered, no code | Launch cards, turn prompts, votes, confirmations, scoreboards — anything expressible as chrome |
| **Sandboxed webview** (mini-app) | [bot-mini-apps.md](bot-mini-apps.md); WS `bot_app_*` (`hub/src/routes/ws/handlers/mini_app.rs`) | Third-party code, sandboxed, scoped token | The game board / canvas / real-time render surface |

Why not a single declarative game schema: a schema rich enough to draw a
game becomes a browser, and we already have one behind a clean sandbox
with a channel-scoped token. Why not webview-only: components render in
places a webview can't (the message list, notifications) and cost no
trust — the launch CTA and simple turn flows should never open a
webview.

### The game modal = mini-app, promoted

The shipped mini-app opens as an inline panel (`activeBotApps` on the
client, [gaming.md](gaming.md)). The one new UI primitive here is
**promoting that same webview into a focus-taking modal overlay** — full
keyboard/mouse/gamepad, no competition with the chat layout, closes back
to the channel with no state loss. Same sandbox, same scoped token, same
`bot_app_open` wire shape ([ws-protocol.md](ws-protocol.md)); only the
client presentation changes, gated on `can_use_interactive_ui`.

New wire: a `game` launch-card field on `BotResponse` and on
`POST /messages` (bot authors only), so a bot message can carry a "Play"
CTA that opens the modal — the additive field sketched in
[bots.md](bots.md) "Bot-launched games (modal)":

```json
"game": { "entry_url": "https://bot.example/ttt", "name": "Tic-Tac-Toe",
          "description": "1v1", "thumbnail_url": "https://..." }
```

The non-bot launch path (an Activities-style picker) is out of scope
here — the launch card is the bot-driven entry point.

---

## 3. Media injection paths

### Audio — shipped, now grant-backed

`can_speak_voice` already gates a bot joining `/voice/ws` as a
first-class relay participant (`voice_ws.rs:72-92`,
[soundboard.md §2](soundboard.md)). The only change: the gate reads the
**effective** set (§1) so an admin can revoke it, and the SDK helper
(`join_voice` / `send_opus`) noted as missing there is Phase 1 tooling.

### Video / canvas — new, same shape

A video bot pushes frames into the **existing screen-share relay** —
`screen_share_start` then `screen_share_chunk` + binary frame over its
main `/ws` connection ([ws-protocol.md](ws-protocol.md)). Clients render
it in the existing `ScreenShareViewer`; no client relay changes. The one
addition is a bot gate at `screen_share_start`, mirroring the voice gate
exactly:

```
if session.is_bot:
    require can_inject_video in effective_capabilities(bot)
    require channel-scoped READ_MESSAGES        # same rule as voice_ws.rs:88
```

This supersedes the older self-service `POST /bots/{id}/screenshare/start`
path ([bots.md §18](bots.md)), which has no capability model — the same
split soundboard.md already records for voice (capability-gated `/voice/ws`
vs the legacy `/admin/bots` token path). New bots use the gated WS relay.

Bandwidth is the bot operator's problem ([bot-media.md](bot-media.md)),
bounded by the abuse budget in §4. No hub transcoding, no mixing — the
relay stays opaque.

---

## 4. Rate & abuse controls

Layered on the existing controls, not replacing them:

- **Inherited** — per-bot-per-hub write limits (5/s, 30/min,
  [bots.md §6](bots.md)); per-user command cooldowns; 1
  `component_interaction` / user / component / 3 s
  ([ws-protocol.md](ws-protocol.md)).
- **Activation caps** (new) — at most one active voice injection and one
  active video stream per bot per channel; a bounded number of concurrent
  mini-app sessions per channel (launch cards otherwise stack —
  [bot-mini-apps.md](bot-mini-apps.md) open question).
- **Media budget** (new) — a per-bot upstream ceiling on the video relay
  path; frames beyond it are dropped, not buffered. Cheap and coarse; the
  precise number is a hub config knob.
- **Grant revocation on escalation** — repeated abuse escalates to
  auto-revoking the offending grant (not just the `rate_limit_escalated`
  disconnect in [bots.md §2](bots.md)); the bot must be re-granted.
- **Operator kill-switches** — hub config disables a capability *class*
  hub-wide (the `bots_allow_camera` pattern, extended to
  `bots_allow_video` / `bots_allow_interactive_ui`). A grant cannot
  override a disabled class.

---

## 5. Threat-model deltas

Against [threat-model.md](threat-model.md) "Bot abuse":

- **Silent capability escalation → closed.** Media/UI/camera now need an
  explicit admin grant (decision 1); the [bots.md §13](bots.md) invite
  warning stops being the only gate for high-risk capabilities.
- **Third-party code in a webview → contained but audit this.** The game
  modal runs bot HTML in the same sandbox as mini-apps (strict CSP, no
  `invoke()`, hub-WS only). **Gap to fix before leaning on it:** the
  shipped `bot_app_join` handler mints a *full* user session row
  (`mini_app.rs:93` inserts into `sessions` bound to the user's pubkey),
  not the channel-scoped, admin-blocked token the design claims
  ([bot-mini-apps.md](bot-mini-apps.md) "Scoped session token"). The
  game modal will exercise this token much harder, so tightening it to a
  real scoped token (channel-bound, `/admin/*` and federation blocked) is
  a Phase 1 prerequisite, not a follow-on.
- **Video injection = new content surface.** A bot with `can_inject_video`
  can push arbitrary frames to every channel viewer. Same moderation
  surface as embeds/attachments/screen-share (already accepted); bounded
  by the grant, channel `READ_MESSAGES`, the media budget (§4), and the
  operator kill-switch.
- **Bandwidth DoS.** Unbounded video frames could saturate a small VPS
  ([bot-media.md](bot-media.md)); the §4 media budget is the mitigation.
- **Voice/video remains hub-plaintext** — unchanged
  ([threat-model.md](threat-model.md) "Voice plaintext on the hub relay");
  this doc adds a sender class, not encryption.

---

## 6. Phasing & buildable first slice

**Phase 0 (shipped):** components, embeds, mini-app launch panel,
`can_speak_voice` voice injection, screen-share relay.

**Phase 1 — buildable first slice (the consent spine + the modal):**
1. `bot_capability_grants` table + `effective_capabilities()` resolver;
   voice gate switched to it; migration backfills grants.
2. Admin Capabilities UI + `PUT /admin/bots/:pubkey/capabilities` +
   `capabilities_changed` push.
3. `can_use_interactive_ui`; promote the mini-app webview to a **game
   modal**; add the `game` launch-card field.
4. Harden the `bot_app_join` scoped token (§5).
This slice ships a playable single-device game with **no media and no new
multiplayer machinery** — see §7. It is self-contained and testable
(happy-path grant + gated open + ungranted rejection).

**Phase 2 — video/canvas:** `can_inject_video` gate at
`screen_share_start`; `bots_allow_video` operator flag; media budget.
Unlocks reference-stream / shared-canvas games.

**Phase 3 — multiplayer session/lobby helper:** shared state, roster,
matchmaking. Bot-owned, hub-relayed — the hub gains nothing game-aware
([gaming.md](gaming.md) item 4, still undesigned here; this doc only
guarantees the relay primitives it will sit on).

**Phase 4 — distribution:** how a hub discovers/adds a game-bot; overlaps
the bot directory ([bots.md §4](bots.md)). Undesigned.

---

## 7. First playable game demo

**Tic-Tac-Toe, from Phase 1 only.** No voice, no video, no lobby service.

1. Admin invites the bot and grants `can_use_interactive_ui`.
2. User runs `/ttt @alice` → the bot posts a message carrying a `game`
   launch card (baseline UI, no grant needed to render the CTA).
3. Both players click **Play** → each client sends `bot_app_join`, gets a
   scoped token, opens the **game modal** webview (gated on
   `can_use_interactive_ui`).
4. Each modal connects to the hub WS with its scoped token and exchanges
   moves through the ordinary relay — the bot owns the board, validates
   turns, fans moves to both modals ([bot-mini-apps.md](bot-mini-apps.md)
   relay pattern). The hub sees only WS JSON; it has no idea it's a game.
5. Win → the bot updates the launch-card message via `PATCH /messages/:id`
   with a result embed (baseline UI); closes the session with
   `bot_app_dismiss`.

**Party-game demo (adds Phase 2).** The same skeleton plus a music track
injected via `can_speak_voice` and a reference stream via
`can_inject_video` — the [bot-media.md](bot-media.md) "Just Dance" shape,
now grant-gated end to end. The mini-app overlays score; the bot relays
state. Nothing in the hub changed between the two demos except which
grants the admin toggled — which is the point of the capability layer.

---

## 8. Files this will touch

**Wavvon-server** (`server/crates/hub/`):
- `db/migrations.rs` — new `bot_capability_grants(bot_pubkey, capability,
  granted_by, granted_at, PRIMARY KEY (bot_pubkey, capability))`; backfill
  from `bot_profiles.capabilities`. Additive only.
- `bots/capabilities.rs` (new) — `effective_capabilities()` resolver.
- `routes/voice_ws.rs` — switch the shipped gate to the resolver.
- `routes/ws/screen_share.rs` — bot gate at `screen_share_start`
  (`can_inject_video` + channel `READ_MESSAGES`).
- `routes/ws/handlers/mini_app.rs` — `can_use_interactive_ui` gate on
  open; scoped-token hardening (§5).
- `routes/bots/admin.rs` + `external.rs` — capabilities grant route +
  `capabilities_changed` push.
- `routes/bot_models.rs` / `routes/chat_models.rs` — grant models,
  `BotResponse.game` / `POST /messages` `game` field.

**Wavvon-client** (`clients/`, delivery target is web —
[client-monorepo.md](client-monorepo.md)):
- `packages/core` — wire types for grants + the `game` field.
- `packages/ui` — game-modal overlay component; admin Capabilities panel.
- `apps/web` + `web/src/platform/` — modal host, grant admin calls; then
  desktop `WebviewWindow` and android parity.

**Wavvon docs:** this file; add to `docs/docs/README.md` reading order.
`decisions.md` / `ROADMAP.md` are handled by the orchestrator.

---

## 9. Deferred

- **Multiplayer session/lobby service** — shared state, matchmaking,
  turn/tick sync. Bot-owned, hub-relayed; Phase 3, undesigned
  ([gaming.md](gaming.md) item 4).
- **Game distribution / discovery** — Phase 4 ([bots.md §4](bots.md)).
- **Cross-hub / alliance game sessions** — single-hub only; federation of
  interactive sessions is out of scope ([gaming.md](gaming.md) federation
  angle, [bot-mini-apps.md](bot-mini-apps.md)).
- **OAuth-style per-capability *tokens*** (vs the per-capability *grants*
  here) — narrower "post to channel Y only" scoping is a later follow-on
  ([bots.md](bots.md) deferred list).
- **Bot voice/video *receive*** (recording, STT, pose from the relay) —
  a consent/privacy design of its own ([soundboard.md §3](soundboard.md)).
- **Declarative game DSL** — explicitly rejected (decision 2); revisit
  only if the webview sandbox proves unworkable.
- **Standardized video frame container** — JPEG chunks suffice until a
  second implementor ([bot-media.md](bot-media.md) open question).
