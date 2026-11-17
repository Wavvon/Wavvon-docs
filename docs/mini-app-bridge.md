# Mini-app host bridge: a frame moves its own user in voice

> **Status (2026-11-17): built** (Wavvon-clients#433, from the design of 2026-11-16). Tracking issue
> [Wavvon-clients#423](https://github.com/Wavvon/Wavvon-clients/issues/423);
> needed by Wavvon-demo-bot#6. Replaces the `wavvon:setVoicePosition` call
> that [proximity-voice.md](proximity-voice.md) designed for the removed game
> SDK and that was never built. Parent: [mini-apps.md](mini-apps.md).
> Rationale: decisions.md, "A mini-app moves its own user in voice through
> the client".

A frame may ask its own client for exactly one thing: **to set its own
user's position in a proximity voice room**, so a game's avatar movement
drives that user's voice. It goes through the client, not the frame's
socket, because the hub refuses `voice_join` from a mini-app session and
takes positions only from the socket that is in voice.

## 1. Messages

**Frame → client**, posted to `window.parent` with target `"*"` (it carries
no secret):

```json
{ "type": "wavvon:setVoicePosition", "v": 1, "position": [40, 60], "zone_id": "<optional>" }
```

**Client → frame**, posted to the app's origin like `wavvon_context`:

```json
{ "type": "wavvon:voiceState", "v": 1, "in_voice": true,
  "zones": [{ "zone_id": "<id>", "coordinate_system": "2d" }] }
{ "type": "wavvon:voicePositionRefused", "v": 1, "reason": "not_in_voice" }
```

`voiceState` is sent right after the context and on every change (joining or
leaving the room, a zone created or destroyed); a frame that never receives
it is on a client without the bridge. Success is not acknowledged, since a
game sends at tick rate; every refusal is, with `reason` one of
`not_in_voice`, `no_zone`, `ambiguous_zone`, `bad_position`.

## 2. What the client checks

It accepts a request only when all hold:

1. It comes from this frame: on web `event.source === iframe.contentWindow`
   and `event.origin` is the `mini_app_url` origin.
2. The user is in voice **in the mini-app's channel**
   (`app_open.channel_id`); otherwise `not_in_voice`.
3. The zone is `zone_id` if given and it is a zone of that room; omitted
   means the room's only zone (`no_zone` if none, `ambiguous_zone` if
   several).
4. `position` has the zone's arity and finite numbers (`bad_position`).

The message names no pubkey: the client sends on its own voice socket, so a
frame can only ever move its own user.

## 3. Send path and rate

The **room map's path**: web `apps/web/src/hooks/useVoice.ts` `moveInRoom`
(generalised to take the zone), desktop `voice_room_map_move` in
`apps/desktop/src-tauri/src/voice_cmd.rs`. Both send `voice_position_update`
on the voice WebSocket and update local attenuation. The path gains one
coalescer, shared by the map and the bridge: keep the latest position, send
at most one every 50 ms, always send the trailing one. The hub's 30 ms drop
is unchanged; the coalescer also stops room-map clicks and arrow keys from
tripping it.

## 4. The user sees it

Once the frame has moved the user, the voice panel shows "<app title> is
moving you" for as long as the frame stays open, and the room map stops
taking the user's own clicks and arrow keys, so the two never fight. Closing
the frame, `app_close`, or leaving voice ends it; the position stays where
the frame left it. The string goes through i18n.

## 5. Desktop

The mini-app window loads an external URL with no Tauri access, and
`window.parent` is the window itself. The initialization script that
`mini_app.rs` already injects adds a `message` listener that forwards
`wavvon:setVoicePosition` to one Tauri command, `mini_app_voice_position`,
granted to that window label alone by a runtime capability scoped to the
`mini_app_url` origin. The shell maps the label to the `app_open` it was
opened for, so the channel never comes from the frame, and relays the request
to the main window as an event; the main window runs the same checks as web
(one shared implementation in `@wavvon/core`) and the same send path, and
replies through a second command, `mini_app_post`, which evals a
`postMessage` into the window. The command is listed in the app manifest
(`build.rs`), so no window holds it by default; the runtime capability grants
`allow-mini-app-voice-position` to one window label on the app origin only.

The client reports one zone: the room map's, always `2d`. A hub may hold
several zones in a room, but no client draws or tracks more than the first,
so `ambiguous_zone` is reachable only once a client does.

## 6. Contract and deferred

No hub change and no capability string: the bridge is client-side, and a
frame detects it by receiving `voiceState`. Unknown `wavvon:*` types from a
frame are logged and ignored, never acted on.

Deferred: zone creation from a frame, and forwarding other users' positions
to it. The app process can do both over its own normal session (it may join
voice and see `voice_position_updated` like anyone in the room).
