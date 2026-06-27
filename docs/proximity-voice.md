# Proximity Voice

A platform-level feature that attenuates each speaker's volume based on
their distance from the listener in a shared coordinate space. Volume fades
as distance grows; speakers out of range go silent.

This is a **general platform primitive**, not a gaming-only feature. Games
use it (a Tier 3 game world where nearby players are louder), but so can
any future spatial feature: a virtual office where different rooms have
distance-based audio, an event stage/hallway split, or anything else a hub
admin or SDK consumer wants to build. The design deliberately does not
couple proximity voice to the gaming system.

**Prerequisite**: proximity voice is an attenuation modifier on per-sender
gain. It requires the per-sender receive pipeline designed in
`voice-volume.md` to be implemented first. It attaches at the same
`entry.gain` point; without per-sender gain there is nowhere to plug it in.

---

## Core abstractions

**Voice zone**: a named, channel-scoped coordinate space with an attenuation
model. Zones are ephemeral (live in hub memory by default). Each zone has
a coordinate system (2D or 3D), an attenuation model, and an auth mode
that controls who may post position updates into it.

**Position**: a point in the zone's coordinate space, published by a client
on behalf of the user. Updated as frequently as the feature driving it
requires (games: every tick at ~10–20 Hz; slow spatial features: less
often). Positions are community-axis state — they live on the hub, not the
home hub list, because they describe where someone is *in this community's
space*.

**Attenuation**: computed **client-side** by the receiver. The hub relays
positions; it does not touch the audio. The receiver knows its own
position (it published it) and all other participants' positions (from
position updates fanned out by the hub), computes per-sender distance,
evaluates the attenuation model, and updates the per-sender gain in the
receive pipeline. This matches the hub's existing posture as a pure relay.

---

## Decision 1 — position protocol over the chat WS, not a dedicated channel

**Decision**: position updates flow over the existing per-hub chat
WebSocket as new envelope variants, not a separate socket.

**Alternative considered**: a dedicated UDP channel for position updates
(low-latency, no framing overhead). Rejected: the hub already has a UDP
listener for voice packets, but adding a second multiplexed stream there
requires sender authentication and channel membership validation — all
solved concerns on the WS. The WS's ~1–2 ms extra latency vs. UDP is
imperceptible for positional audio attenuation; the gain curve is smooth,
not binary.

**Why the existing WS wins**: same rationale as the Tier 2 game protocol
decision in `gaming.md` — the chat WS already solves auth, membership,
channel routing, and reconnect. Position events ride the same infrastructure
at near-zero protocol cost.

**Rate**: the hub rate-limits `voice_position_update` to 30 updates/second
per user per zone (configurable). Most use cases are well under this.

---

## Decision 2 — attenuation computed client-side, not hub-side

**Decision**: the hub is position-data relay only. Gain computation runs
in the receiver client.

**Alternative considered**: the hub modifies UDP packet gain before fan-out
(an "attenuating SFU"). Rejected: it would require the hub to know every
listener's position to compute per-listener gain for every speaker, then
encode different gain levels into each fan-out copy — breaking the current
zero-copy fan-out model and creating O(N²) position-join computation per
packet. Client-side computation keeps the hub stateless with respect to
audio.

**Composition with manual volume** (`voice-volume.md`):
```
effective_gain = manual_gain × proximity_gain
```
The manual gain is the stored per-user preference; the proximity gain is
computed from positions. Both collapse into the single `entry.gain`
application in the receive pipeline. A user can still boost a quiet distant
speaker by raising their manual gain above 1.0.

---

## Attenuation models

Four built-in models, identified by name in the zone definition. Game SDK
consumers and hub admins pick the model at zone creation.

| Model | Formula | When to use |
|---|---|---|
| `linear` | `gain = clamp(1 − d / max_radius, 0, 1)` | Simple, predictable; good default for most uses |
| `inverse_square` | `gain = clamp((ref_dist / max(d, ref_dist))², 0, 1)` | Physically realistic; drops off quickly past ref_dist |
| `step` | `1.0` within `inner_radius`, linear to `0.0` at `outer_radius`, `0.0` beyond | Distinct room zones with a soft transition |
| `exponential` | `gain = exp(−k × d)`, clipped to `[0, 1]` | Smooth fade; `k` is the rolloff coefficient |

The parameters for each model are declared in the zone definition (see zone
format below). The client evaluates the model locally — no round-trip.

---

## Zone definition

Sent by the creator when calling `voice_zone_create`. Stored in hub memory
(and optionally DB for persistent zones).

```json
{
  "zone_id": "uuid-v4",
  "name": "game-world",
  "coordinate_system": "2d",
  "attenuation": {
    "model": "linear",
    "max_radius": 200.0,
    "ref_dist": 20.0,
    "rolloff": 1.0
  },
  "auth_mode": "any_channel_member",
  "session_id": null
}
```

| Field | Notes |
|---|---|
| `zone_id` | UUID, caller-chosen or server-generated |
| `name` | Display name; informational only |
| `coordinate_system` | `"2d"` or `"3d"` |
| `attenuation.model` | See table above |
| `attenuation.max_radius` | Distance at which gain reaches 0 |
| `attenuation.ref_dist` | For `inverse_square`/`exponential`: distance where gain = 1.0 |
| `attenuation.rolloff` | Model-specific coefficient |
| `auth_mode` | `"creator_only"` / `"any_channel_member"` / `"session_roster"` |
| `session_id` | If set, the zone is bound to a game session and destroyed when the session ends |

---

## Wire protocol additions

All messages are new variants on the existing chat WS envelope. They are
channel-scoped (include `channel_id`).

**Client → Hub:**

| Message | Auth | Purpose |
|---|---|---|
| `voice_zone_create` | `manage_voice` permission or game session host | Create a zone; body is the zone definition |
| `voice_zone_destroy { zone_id }` | zone creator or `manage_voice` | Destroy a zone and stop sending positions |
| `voice_position_update { zone_id, position: [f32] }` | per `auth_mode` | Update the sender's position (2- or 3-element array) |

**Hub → Client:**

| Message | When |
|---|---|
| `voice_zone_created { zone_id, name, coordinate_system, attenuation }` | Broadcast to channel on zone creation |
| `voice_zone_destroyed { zone_id }` | Broadcast to channel on zone destruction |
| `voice_position_updated { zone_id, pubkey, position }` | Broadcast to channel on every accepted position update |
| `voice_zone_state { zones: [{ zone_id, name, coordinate_system, attenuation, positions: { pubkey: position } }] }` | Sent to a client on voice join — full current state for all active zones in the channel |

The hub does not interpret positions or compute distances. It validates the
message shape, the sender's membership and auth_mode, and fans out
`voice_position_updated` to all channel members in voice.

---

## Hub state

In `hub/src/state.rs` (Wavvon-server), alongside the existing
`voice_channels` and `game_sessions` maps:

```
voice_zones: HashMap<(ChannelId, ZoneId), VoiceZone>

VoiceZone {
  zone_id, channel_id, name,
  coordinate_system: Coord2D | Coord3D,
  attenuation: AttenuationConfig,
  auth_mode: AuthMode,
  creator_pubkey,
  session_id: Option<SessionId>,
  positions: HashMap<PubKey, Vec<f32>>,
}
```

Zones are ephemeral by default (gone on hub restart). A future refinement
can persist zones flagged as durable via a `voice_zones` DB table — the
same optional-durability pattern game sessions use for snapshots.

---

## New hub permission

A new `manage_voice` permission is required to create zones directly (i.e.
outside a game session). Hub admins have it by default. Non-admin uses
(custom spatial channels, virtual offices) require a hub admin to grant
`manage_voice` to the relevant role.

Game session hosts create zones inside their session without `manage_voice`
because the game session host check gates the `voice_zone_create` call when
`session_id` is set.

---

## SDK surface for games

Extends the postMessage SDK in `gaming.md`. Requires the `multiplayer`
capability (already gated) and a new `voice_zone` sub-capability
(admin-granted per game per hub, same model as other Tier 1/2 capabilities).

Calls the game sends to the parent (`window.parent.postMessage`):

```js
// Create a voice zone at session start (typically called once, by the host)
window.parent.postMessage({
  type: "wavvon:createVoiceZone",
  reqId: 10,
  attenuation: { model: "linear", max_radius: 200 },
  coordinate_system: "2d"   // default
}, "*");
// → { type: "wavvon:voiceZoneCreated", reqId: 10, data: { zone_id } }

// Update position each game tick
window.parent.postMessage({
  type: "wavvon:setVoicePosition",
  reqId: 11,
  position: { x: 120, y: 340 },
  zone_id: "auto"            // "auto" = the session's zone
}, "*");
// → { type: "wavvon:ok", reqId: 11 }
```

`"zone_id": "auto"` resolves to the zone bound to the current game session
(`session_id` match). A session with no zone returns `not_in_zone`. Zone
destruction is automatic when the session ends (the `session_id` binding
triggers it).

Event the parent delivers to the game (so the game can mirror positions of
other players in its own world state):

```js
// { type: "wavvon:voicePositionUpdated", data: { pubkey, position } }
```

---

## Non-gaming uses

Proximity voice is not gated on the gaming system. Any feature with
`manage_voice` can create zones:

- **Virtual office channels** — hub admin creates a persistent zone where
  your desk location (dragged in a canvas UI) sets your voice position.
- **Event stages** — a speaker at position (0,0), the audience dispersed
  beyond the ref_dist; attendees hear the speaker fully, each other faintly.
- **Any future spatial feature** — the zone API is the stable contract;
  the spatial feature is the SDK consumer.

The client-side attenuation logic is the same regardless of who created the
zone. New use cases add zone creators and position-update senders; the audio
pipeline does not change.

---

## Client-side receive logic

In `voice/src/playback.rs` (Wavvon-desktop), extending the per-sender
pipeline from `voice-volume.md`:

```
// on voice_zone_state / voice_position_updated events:
positions[zone_id][pubkey] = position

// in the audio mix tick, for each per-sender entry:
my_pos    = positions.get(active_zone_id, my_pubkey)
their_pos = positions.get(active_zone_id, sender_pubkey)
if both known:
  d = distance(my_pos, their_pos)
  proximity_gain = evaluate_attenuation(zone.attenuation, d)
else:
  proximity_gain = 1.0   // no zone or no position: full volume
entry.gain = manual_gain * proximity_gain
```

No position → no attenuation (graceful fallback to full volume). This means
a user who hasn't published a position yet, or who is in a different zone,
is heard at full manual-gain volume.

---

## What changes on the implementation side

| Piece | Repo / file |
|---|---|
| `voice_zones` in-memory state | `hub/src/state.rs` (Wavvon-server) |
| `voice_zone_create/destroy`, `voice_position_update` WS handlers | `hub/src/routes/ws.rs` + `chat_models.rs` (Wavvon-server) |
| `manage_voice` permission | hub DB migration + roles (Wavvon-server) |
| `voice_zone_state` on voice join | WS join handler (Wavvon-server) |
| Client position map + attenuation evaluation | `voice/src/playback.rs` (Wavvon-desktop) |
| WS event handlers for zone events | client WS layer (Wavvon-desktop, Wavvon-web, Wavvon-android) |
| `wavvon:createVoiceZone` + `wavvon:setVoicePosition` SDK calls | game iframe parent handler (Wavvon-desktop, Wavvon-web) |
| `voice_zone` capability in the Tier 1/2 capability model | `gaming.md` capability table + admin UI |

---

## Relationship to Gaming Tier 3

Gaming Tier 3 (MMO + persistent shared world) will **consume** this feature
— proximity voice in a game world is implemented by posting position
updates from the game SDK and letting the platform handle attenuation. The
MMO design does not need to own voice attenuation logic; it only needs to
call `wavvon:setVoicePosition` per tick. This is the whole point of making
proximity voice a general platform primitive: Tier 3 gets it for free when
the time comes.

---

## What's deferred

- **Persistent zones** via a `voice_zones` DB table (durable across hub
  restarts; useful for virtual offices). The hub-memory-only model ships
  first.
- **Directional audio** (panning based on bearing, not just distance) —
  requires stereo positioning logic; out of scope.
- **Zone visibility to non-voice members** — positions are currently
  broadcast to all channel members in voice. Restricting position
  information to a need-to-know set is a privacy refinement deferred until
  a use case demands it.
- **Cross-hub zones** (alliance-wide spatial spaces) — same federation
  complexity as cross-hub game sessions; deferred to when Tier 3 and the
  alliance federation story mature.
