# WebSocket Protocol Reference

This is the complete wire contract for the hub's WebSocket endpoint. Together
with [`openapi.yaml`](../openapi.yaml) (REST) it is sufficient to implement a
client in any language without reading the hub's Rust source.

Source of truth: `hub/hub/src/routes/chat_models.rs` (`WsClientMessage`,
`WsServerMessage`) and `hub/hub/src/routes/ws.rs` (dispatch loop). Every field
listed here matches the serde wire output exactly.

---

## Connecting and authenticating

```
GET /ws?token=<token>
Upgrade: websocket
```

- The endpoint is `GET /ws` on the same host/port as the REST API.
- Authentication is a **`token` query parameter** (not a header). Two token
  kinds are accepted:
  - a session token from `POST /auth/verify` (regular clients), or
  - a bot token issued at bot creation time (bot connections).
- The token is checked with the same rules as HTTP requests: session expiry,
  revocation, approval status, and bans all apply. Failure rejects the upgrade
  with an HTTP error status before the WebSocket is established.

On successful connect the hub immediately:

1. Sends a [`hello`](#hello) message containing the current hub-event sequence
   number.
2. Auto-subscribes the connection to **every non-category channel the user is
   not banned from**. You do not need to send `subscribe` for existing
   channels; `subscribe` is needed for channels created after connect.
3. Replays a [`screen_share_started`](#screen_share_started) message (plus the
   cached init chunk, if any) for every screen share already in progress in a
   subscribed channel.

DM conversation membership is also loaded **once at connect time**: a client
added to a new DM conversation must reconnect to start receiving its events.

## Message framing

All protocol messages are JSON text frames. Both directions use an
**internally tagged** envelope: a `type` field selects the message, and the
payload fields sit at the same level as `type` (serde `#[serde(tag = "type")]`):

```json
{ "type": "voice_join", "channel_id": "abc", "udp_port": 50000 }
```

Conventions:

- Field names are `snake_case` exactly as listed below.
- "nullable" means the field is always present but may be `null`.
- "omitted when absent" means the field is left out of the JSON entirely when
  it has no value (serde `skip_serializing_if`).
- Unknown or malformed client messages are **silently ignored** — the hub
  sends no error for an unparseable frame.
- Timestamps are Unix seconds (integer) unless stated otherwise.

**Binary frames** are used only for screen-share chunk data (v1 "chunks"
transport). A JSON `screen_share_chunk` envelope is always sent first, and the
very next frame in the same direction is the binary chunk it describes. No
other binary frames exist in the protocol.

---

## Client → server messages

### Channel subscription

#### `subscribe`
Subscribe to a channel's events (needed only for channels created after
connect, or to re-subscribe). On a new subscription the hub replays
`screen_share_started` (+ init chunk) for every active share in that channel.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |

#### `unsubscribe`
Stop receiving events for a channel.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |

### Chat

#### `typing`
Broadcasts a typing indicator to other subscribers of the channel (never
echoed back to the sender).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `typing` | boolean | `true` = started typing, `false` = stopped |

#### `dm_typing`
Typing indicator in a DM conversation (delivered to other members only).

| field | type | notes |
|---|---|---|
| `conversation_id` | string | |
| `typing` | boolean | |

#### `component_interaction`
User clicked a bot message component (button, select). Rate limited to one
interaction per `(user, custom_id)` per 3 seconds; exceeding it returns an
[`error`](#error) with context `component_interaction`. The interaction is
forwarded to the owning bot's HTTP webhook (not over WS).

| field | type | notes |
|---|---|---|
| `message_id` | string | id of the bot message containing the component |
| `custom_id` | string | component identifier set by the bot |
| `values` | array of string | optional, defaults to `[]`; selected values for selects |

### Voice

> Transport note: the events below are the channel-WS control plane and
> apply to all clients. **Audio frames** travel out of band: native clients
> (desktop, Android) use the UDP relay (the `udp_register_token` bind under
> [`voice_joined`](#voice_joined)); the browser, which cannot open raw UDP,
> uses a separate `/voice/ws` WebSocket relay (`hub/src/routes/voice_ws.rs`
> in Wavvon-server) carrying the same Opus wire format. The control-plane
> events here are identical regardless of which audio transport a participant
> uses. See [voice.md](voice.md).

#### `voice_join`
Join a voice channel. May be rejected with an [`error`](#error) (context
`voice_join`) when the user is voice-muted hub-wide, voice-muted in the
channel, or below the channel's `min_talk_power` without a raised hand.
On success the hub sends [`voice_joined`](#voice_joined), broadcasts
[`voice_participant_joined`](#voice_participant_joined) and
[`voice_roster_update`](#voice_roster_update) to the channel, and sends the
joiner a [`voice_zone_state`](#voice_zone_state) snapshot (if any zones exist)
and a [`video_participants`](#video_participants) snapshot (if anyone has
video enabled).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `udp_port` | integer (u16) | legacy; ignored since hub v0.2.2 (the hub learns the real source address via the `udp_register_token` bind — see [`voice_joined`](#voice_joined)) |

#### `voice_leave`

| field | type | notes |
|---|---|---|
| `channel_id` | string | |

#### `voice_speaking`
Broadcast a speaking indicator to the voice channel.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `speaking` | boolean | |

#### `voice_whisper_start`
Open a whisper session to a set of targets. The hub resolves the targets to
currently-connected voice participants and notifies them with
[`voice_whisper_started`](#voice_whisper_started). The resolved set is
re-computed automatically when participants join or leave voice.

| field | type | notes |
|---|---|---|
| `targets` | array of [WhisperTarget](#whispertarget) | |

#### `voice_whisper_stop`
Close the active whisper session. No payload fields:
`{"type":"voice_whisper_stop"}`. Previously-resolved recipients receive
[`voice_whisper_stopped`](#voice_whisper_stopped).

### Proximity voice (zones)

#### `voice_zone_create`
Create a proximity-voice zone in the sender's current voice channel. Requires
the `manage_voice` or `admin` permission, **or** being the host of the game
session named in `session_id`. Must be in voice. Failures produce an
[`error`](#error) with context `voice_zone_create`. Success broadcasts
[`voice_zone_created`](#voice_zone_created) to the channel.

| field | type | notes |
|---|---|---|
| `zone_id` | string | client-chosen id |
| `name` | string | |
| `coordinate_system` | string | optional, default `"2d"` |
| `attenuation` | [Attenuation](#attenuation) | required object; its fields each have defaults |
| `auth_mode` | string | optional, default `"any_channel_member"`; also `"creator_only"`, `"session_roster"` |
| `session_id` | string | optional; links the zone to a game session |

#### `voice_zone_destroy`
Destroy a zone in the sender's current voice channel. Allowed for the zone
creator or anyone with `manage_voice`/`admin`. Silently ignored otherwise.
Success broadcasts [`voice_zone_destroyed`](#voice_zone_destroyed).

| field | type | notes |
|---|---|---|
| `zone_id` | string | |

#### `voice_position_update`
Update the sender's position in a zone. Ignored unless the sender is in voice,
the zone exists, the zone's `auth_mode` admits the sender, and `position` has
1–3 elements. Accepted updates broadcast
[`voice_position_updated`](#voice_position_updated) to the channel.

| field | type | notes |
|---|---|---|
| `zone_id` | string | |
| `position` | array of number | 1–3 coordinates; empty or >3 is dropped |

### Video (webcam signaling)

#### `video_enable`
Announce webcam availability in a voice channel. Requires being in voice on
that channel (else [`error`](#error) with context `video_enable`). Broadcasts
[`video_participant_enabled`](#video_participant_enabled).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |

#### `video_disable`
Broadcasts [`video_participant_disabled`](#video_participant_disabled).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |

#### `video_offer` / `video_answer`
WebRTC SDP relay to one peer; delivered as
[`video_offer_in`](#video_offer_in) / [`video_answer_in`](#video_answer_in)
to `to_pubkey` only.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `to_pubkey` | string | target peer |
| `sdp` | string | opaque SDP text — the hub does not parse it |

#### `video_ice`
ICE candidate relay; delivered as [`video_ice_in`](#video_ice_in) to
`to_pubkey` only.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `to_pubkey` | string | |
| `candidate` | string | opaque candidate JSON string |

### Screen share

#### `screen_share_start`
Register a stream and broadcast [`screen_share_started`](#screen_share_started)
to the channel. Multiple concurrent sharers per channel are allowed; each
(channel, sharer) pair has its own slot and may carry multiple streams.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | client-chosen id, unique per sharer |
| `kind` | string | e.g. `"screen"` or `"webcam"` |
| `mime` | string | container/codec MIME of the chunk stream |
| `has_audio` | boolean | |
| `transport` | string | optional; `"chunks"` (default, v1 relay) or `"webrtc"` (v2) |
| `tracks` | array of [TrackMeta](#trackmeta) | optional; v2 track multiplexing metadata |

#### `screen_share_chunk`
Envelope for one media chunk. **Must be immediately followed by a binary
frame** containing the chunk bytes. Chunks with `is_init: true` are cached by
the hub and replayed to late joiners/subscribers.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | |
| `seq` | integer (u32) | chunk sequence number |
| `is_init` | boolean | `true` for the container init segment |

#### `screen_share_stop`
Remove the stream and broadcast
[`screen_share_stopped`](#screen_share_stopped); cross-channel subscribers
receive [`stream_subscription_ended`](#stream_subscription_ended).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | |

#### `screen_share_viewer_join` / `screen_share_viewer_leave`
(v2 WebRTC) Viewer announces it wants / no longer wants a peer connection for
a stream. Relayed to the sharer as
[`screen_share_viewer_joined`](#screen_share_viewer_joined) /
[`screen_share_viewer_left`](#screen_share_viewer_left). Joining a
non-existent stream returns an [`error`](#error) with context
`screen_share_viewer_join`.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | |

#### `screen_share_offer` / `screen_share_answer`
(v2 WebRTC) SDP relay between sharer and viewer; delivered as
[`screen_share_offer_in`](#screen_share_offer_in) /
[`screen_share_answer_in`](#screen_share_answer_in) to `to_pubkey` only.
`screen_share_offer` is only honoured when the sender is the sharer of
`stream_id`; `screen_share_answer` only when `to_pubkey` is the sharer.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `to_pubkey` | string | |
| `stream_id` | string | |
| `sdp` | string | opaque |

#### `screen_share_ice`
(v2 WebRTC) ICE relay; delivered as
[`screen_share_ice_in`](#screen_share_ice_in) to `to_pubkey` only.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `to_pubkey` | string | |
| `stream_id` | string | |
| `candidate` | string | JSON string `{ candidate, sdpMid, sdpMLineIndex }` — opaque to the hub |

#### `stream_list`
Request a snapshot of all active streams in channels visible to this
connection. No payload fields: `{"type":"stream_list"}`. The hub replies with
[`hub_streams`](#hub_streams).

#### `stream_subscribe`
Subscribe to chunks of a stream in a channel the client is not in voice on.
Success: a [`stream_subscribed`](#stream_subscribed) ack, then the cached init
chunk (if any), then live chunks. Failure: [`error`](#error) with context
`stream_subscribe`.

| field | type | notes |
|---|---|---|
| `source_channel_id` | string | |
| `stream_id` | string | |

#### `stream_unsubscribe`

| field | type | notes |
|---|---|---|
| `source_channel_id` | string | |
| `stream_id` | string | |

### Bots

#### `resume`
Bot connections only (silently ignored for users). Requests replay of
`hub_event` envelopes after `since_seq`. The hub replays matching events, then
sends [`replay_complete`](#replay_complete) — or
[`replay_unavailable`](#replay_unavailable) if `since_seq` has aged out of the
72-hour retention window. Live events arriving during replay are buffered and
flushed afterwards in order.

| field | type | notes |
|---|---|---|
| `since_seq` | integer (i64) | last sequence number the bot has processed |

### Mini-apps

#### `bot_app_announce`
*Bot identity only.* Bot announces a mini-app session in a channel. The hub
fans this to all channel subscribers as [`bot_app_launch`](#bot_app_launch).

| field | type | notes |
|---|---|---|
| `title` | string | display name for the launch card |
| `description` | string | one-line description shown below the title |
| `channel_id` | string | channel to announce in |

#### `bot_app_join`
Any connection. Sent when a user clicks "Join" on a launch card. The hub
mints a 4-hour scoped session token bound to this user, channel, and bot,
then replies with [`bot_app_open`](#bot_app_open) targeted only at this
connection.

| field | type | notes |
|---|---|---|
| `bot_id` | string | public key of the bot that announced the session |
| `channel_id` | string | channel the session was announced in |

#### `bot_app_dismiss`
*Bot identity only.* Bot closes the mini-app session. The hub fans
[`bot_app_close`](#bot_app_close) to all channel subscribers.

| field | type | notes |
|---|---|---|
| `channel_id` | string | channel the session is running in |

---

## Server → client messages

Delivery rules worth knowing:

- Channel-scoped events go to all connections subscribed to that channel.
- Voice events (`voice_participant_*`, `voice_roster_update`) go only to
  connections currently **in that voice channel**, and a participant's own
  join/leave/speaking events are not echoed back to them.
- Messages described as *targeted* are delivered only to the named recipient
  even though they carry a channel id.

### Connection lifecycle

#### `hello`
First message after connect.

| field | type | notes |
|---|---|---|
| `live_seq` | integer (i64) | current hub-event sequence number (bots use this with `resume`) |

#### `error`
Generic error for a failed client message. `context` is a machine-readable
hint matching the originating message type (e.g. `voice_join`,
`stream_subscribe`).

| field | type | notes |
|---|---|---|
| `context` | string | |
| `message` | string | human-readable description |

### Chat

#### `message`
New chat message in a subscribed channel. Also used for system messages such
as poll announcements. If the embedded message has `visible_to_pubkey` set,
it is delivered **only** to that user (ephemeral bot replies).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `message` | [Message](#message-object) | |

#### `message_edited`

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `message` | [Message](#message-object) | full updated message |

#### `message_deleted`

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `message_id` | string | |

#### `reactions_updated`
Full replacement of a message's reaction summary (not a diff). The `me` flag
inside each entry is always `false` in this broadcast — it is per-viewer and
the client must recompute it locally.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `message_id` | string | |
| `reactions` | array of [ReactionSummary](#reactionsummary) | |

#### `typing`
Another user's typing indicator (never your own).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `public_key` | string | |
| `display_name` | string | nullable |
| `typing` | boolean | |

#### `message_pinned`

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `message_id` | string | |

#### `message_unpinned`

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `message_id` | string | |

#### `forum_event`
Forum post/reply lifecycle event. The `event` object carries:
`type` (one of `post_created`, `post_updated`, `post_deleted`,
`reply_created`, `reply_updated`, `reply_deleted`), `channel_id`, `post_id`,
and `reply_id` (present only on `reply_*` events). Note that pin/lock/tag
changes are broadcast as `post_updated`. Clients re-fetch the post over REST.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `event` | object | see above |

#### `poll_vote_updated`
Live vote tally, broadcast after every vote upsert.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `poll_id` | string | |
| `totals` | object | map of option id → vote count (integer) |

### Direct messages

#### `dm`
New direct message (not echoed to the sender).

| field | type | notes |
|---|---|---|
| `conversation_id` | string | |
| `sender` | string | sender pubkey |
| `sender_name` | string | nullable |
| `content` | string | |
| `timestamp` | integer (i64) | |

#### `dm_typing`
Typing in a DM conversation (not echoed to the sender).

| field | type | notes |
|---|---|---|
| `conversation_id` | string | |
| `sender` | string | |
| `sender_name` | string | nullable |
| `typing` | boolean | |

#### `dm_member_changed`
Membership change; delivered to all members including the actor.

| field | type | notes |
|---|---|---|
| `conversation_id` | string | |
| `added` | array of string | pubkeys added |
| `removed` | array of string | pubkeys removed |

### Voice

#### `voice_joined`
Direct reply to a successful `voice_join`.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `hub_udp_port` | integer (u16) | UDP port the hub listens on for voice packets |
| `participants` | array of [VoiceParticipant](#voiceparticipant) | current participants (including you) |
| `udp_register_token` | string | 64 hex chars, single-use, 30 s TTL. Send `b"VXRG"` + the 64 ASCII chars (68 bytes) to `hub_udp_port`; the hub binds your real source address and replies `b"VXRA"` (4 bytes). Retry every ~500 ms until acked — **no audio is relayed to or from you until this bind completes**. Added in hub v0.2.2 (networked voice Phase 1). |

#### `voice_participant_joined`
Broadcast to the voice channel (not echoed to the joiner).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `participant` | [VoiceParticipant](#voiceparticipant) | |

#### `voice_participant_left`
Broadcast to the voice channel (not echoed to the leaver).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `public_key` | string | |

#### `voice_participant_speaking`
Broadcast to the voice channel (not echoed to the speaker).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `public_key` | string | |
| `speaking` | boolean | |

#### `voice_roster_update`
Full roster (with UDP `sender_id` mappings) broadcast after every voice join
and leave. Replace local state with this list.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `participants` | array of [VoiceRosterEntry](#voicerosterentry) | |

#### `voice_whisper_started`
*Targeted*: delivered only to the resolved whisper recipients.

| field | type | notes |
|---|---|---|
| `sender_pubkey` | string | the whispering user |

#### `voice_whisper_stopped`
*Targeted*: delivered only to the previously resolved recipients.

| field | type | notes |
|---|---|---|
| `sender_pubkey` | string | |

### Proximity voice (zones)

#### `voice_zone_created`
Broadcast to the channel.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `zone_id` | string | |
| `name` | string | |
| `coordinate_system` | string | |
| `attenuation` | [Attenuation](#attenuation) | |

#### `voice_zone_destroyed`

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `zone_id` | string | |

#### `voice_position_updated`
Broadcast on every accepted position update.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `zone_id` | string | |
| `pubkey` | string | the user who moved |
| `position` | array of number | |

#### `voice_zone_state`
Snapshot of all active zones, sent to a client on voice join (only when at
least one zone exists).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `zones` | array of [VoiceZoneSnapshot](#voicezonesnapshot) | |

### Video (webcam signaling)

#### `video_participant_enabled`
Broadcast: a participant enabled their webcam.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `pubkey` | string | |

#### `video_participant_disabled`
Broadcast: a participant disabled their webcam (also sent automatically when
they leave voice or disconnect).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `pubkey` | string | |

#### `video_participants`
Snapshot of video-enabled pubkeys, sent to a joining voice participant (only
when non-empty).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `pubkeys` | array of string | |

#### `video_offer_in` / `video_answer_in`
*Targeted* SDP relay (`to_pubkey` is you).

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `from_pubkey` | string | originating peer |
| `to_pubkey` | string | |
| `sdp` | string | opaque |

#### `video_ice_in`
*Targeted* ICE relay.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `from_pubkey` | string | |
| `to_pubkey` | string | |
| `candidate` | string | opaque |

### Screen share

#### `screen_share_started`
Broadcast when a share starts; also replayed on connect/subscribe for shares
already in progress.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | |
| `sharer_pubkey` | string | |
| `kind` | string | |
| `mime` | string | |
| `has_audio` | boolean | |

#### `screen_share_chunk`
Chunk envelope; **the next binary frame** is the chunk payload. Delivered to
channel subscribers (except the sharer) and to cross-channel subscribers of
the stream.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | |
| `sharer_pubkey` | string | |
| `seq` | integer (u32) | `0` for replayed init chunks |
| `is_init` | boolean | |

#### `screen_share_stopped`

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | |
| `sharer_pubkey` | string | |

#### `screen_share_offer_in` / `screen_share_answer_in`
*Targeted* (v2 WebRTC) SDP relay.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `to_pubkey` | string | you |
| `stream_id` | string | |
| `sdp` | string | opaque |
| `from_pubkey` | string | the other peer |

#### `screen_share_ice_in`
*Targeted* (v2 WebRTC) ICE relay.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `to_pubkey` | string | |
| `stream_id` | string | |
| `candidate` | string | opaque |
| `from_pubkey` | string | |

#### `screen_share_viewer_joined`
*Targeted* at the sharer: a viewer wants to negotiate.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | |
| `from_pubkey` | string | the viewer |

#### `screen_share_viewer_left`
*Targeted* at the sharer.

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | |
| `from_pubkey` | string | |

#### `stream_subscribed`
Ack for `stream_subscribe`. If an init chunk is cached it follows immediately
(as a `screen_share_chunk` envelope + binary frame).

| field | type | notes |
|---|---|---|
| `source_channel_id` | string | |
| `stream_id` | string | |
| `sharer_pubkey` | string | |
| `kind` | string | |
| `mime` | string | |
| `has_audio` | boolean | |

#### `stream_subscription_ended`
*Targeted*: a stream you cross-channel-subscribed to has stopped (sharer
stopped it or disconnected).

| field | type | notes |
|---|---|---|
| `source_channel_id` | string | |
| `stream_id` | string | |

#### `hub_streams`
Reply to `stream_list`.

| field | type | notes |
|---|---|---|
| `streams` | array of [HubStreamInfo](#hubstreaminfo) | |

### Mini-apps

#### `bot_app_launch`
Broadcast to all subscribers of the channel when a bot calls
[`bot_app_announce`](#bot_app_announce). Clients render a launch card with a
"Join" button.

| field | type | notes |
|---|---|---|
| `bot_id` | string | public key of the announcing bot |
| `title` | string | |
| `description` | string | |
| `channel_id` | string | |

#### `bot_app_open`
*Targeted* — delivered only to the connection that sent `bot_app_join`.
Contains the URL and a scoped session token the client passes to the webview.

| field | type | notes |
|---|---|---|
| `bot_id` | string | |
| `channel_id` | string | |
| `mini_app_url` | string | URL the client should load in a sandboxed webview |
| `session_token` | string | 4-hour token scoped to this user + channel + bot; injected as `window.__WAVVON_TOKEN__` |
| `requires_camera` | boolean | `true` only when the bot declared `requires_camera` **and** the hub operator has enabled `bots_allow_camera`; clients gate the webview camera permission on this flag |

#### `bot_app_close`
Broadcast to all subscribers of the channel when a bot calls
[`bot_app_dismiss`](#bot_app_dismiss). Clients close any open webview for
this session.

| field | type | notes |
|---|---|---|
| `bot_id` | string | |
| `channel_id` | string | |

### Bot-only messages

These are pushed only to connections authenticated with a bot token.

#### `hub_event`
Audit-log event matching one of the bot's subscriptions. Live events carry the
first shape; events re-sent during a `resume` replay additionally carry
`actor_pubkey`, `target_pubkey`, `channel_id`, and `replayed: true`.

| field | type | notes |
|---|---|---|
| `seq` | integer (i64) | monotonically increasing event sequence |
| `event` | string | event type, e.g. `member.joined`, `message.created` |
| `hub_url` | string | public URL of this hub |
| `at` | integer | Unix timestamp |
| `payload` | object | event-specific payload (message content may be redacted per bot permissions) |
| `actor_pubkey` | string | nullable; **replay only** |
| `target_pubkey` | string | nullable; **replay only** |
| `channel_id` | string | nullable; **replay only** |
| `replayed` | boolean | **replay only**, always `true` |

#### `replay_complete`
Sent after a successful `resume` replay; live events resume after this.

| field | type | notes |
|---|---|---|
| `replayed` | integer | number of events replayed |
| `live_from_seq` | integer (i64) | sequence number live delivery continues from |

#### `replay_unavailable`
`resume` requested a sequence older than the 72-hour retention window.

| field | type | notes |
|---|---|---|
| `earliest_seq` | integer (i64) | oldest sequence still available |
| `earliest_at` | integer | timestamp of that event |

#### `token_expiring_soon`
The bot's session token expires within 72 hours; rotate it via the bot API.

| field | type | notes |
|---|---|---|
| `expires_at` | integer | Unix timestamp |

#### `bot_removed`
The bot's session was terminated; the hub closes the socket right after.

| field | type | notes |
|---|---|---|
| `reason` | string | currently always `"token_expired"` |

---

## Shared objects

### Message object
The same shape as the REST `Message` schema in `openapi.yaml`.

| field | type | notes |
|---|---|---|
| `id` | string | |
| `channel_id` | string | |
| `sender` | string | pubkey |
| `sender_name` | string | nullable |
| `content` | string | |
| `created_at` | integer | |
| `edited_at` | integer | nullable |
| `attachments` | array | `{ name, mime, data_b64 }` per entry |
| `reactions` | array of [ReactionSummary](#reactionsummary) | |
| `reply_to` | object | nullable; `{ message_id, sender, sender_name (nullable), content_preview }` |
| `visible_to_pubkey` | string | omitted when absent; when set, only that user receives/should display the message |
| `reply_count` | integer (i64) | direct replies (non-zero only on thread roots) |

### ReactionSummary

| field | type | notes |
|---|---|---|
| `emoji` | string | |
| `count` | integer (i64) | |
| `me` | boolean | whether *you* reacted; always `false` in WS broadcasts |

### VoiceParticipant

| field | type | notes |
|---|---|---|
| `public_key` | string | |
| `display_name` | string | nullable |

### VoiceRosterEntry

| field | type | notes |
|---|---|---|
| `sender_id` | integer (u16) | id used in UDP voice packets |
| `public_key` | string | |
| `display_name` | string | omitted when absent |

### WhisperTarget

| field | type | notes |
|---|---|---|
| `type` | string | `"user"`, `"channel"`, or `"role"` (unknown types ignored) |
| `id` | string | pubkey, channel id, or role id respectively |

### Attenuation
All fields optional in client → server messages (defaults shown); always
present in server → client messages.

| field | type | notes |
|---|---|---|
| `model` | string | default `"linear"` |
| `max_radius` | number (f64) | default `200.0` |
| `ref_dist` | number (f64) | default `20.0` |
| `rolloff` | number (f64) | default `1.0` |

### VoiceZoneSnapshot

| field | type | notes |
|---|---|---|
| `zone_id` | string | |
| `name` | string | |
| `coordinate_system` | string | |
| `attenuation` | [Attenuation](#attenuation) | |
| `positions` | object | map of pubkey → position array |

### HubStreamInfo

| field | type | notes |
|---|---|---|
| `channel_id` | string | |
| `stream_id` | string | |
| `sharer_pubkey` | string | |
| `kind` | string | |
| `mime` | string | |
| `has_audio` | boolean | |

### TrackMeta

| field | type | notes |
|---|---|---|
| `mid` | string | RTP `m=` mid value (matches `RTCRtpTransceiver.mid`) |
| `kind` | string | `"screen"` or `"webcam"` |
