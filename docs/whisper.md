# Whisper

Speak to a specific set of targets — users, channels, or roles — across
the hub without anyone else hearing, **including your own channel**.
Recipients hear the whisper layered on top of whatever channel audio they
are already in. The whisperer's normal channel does not hear the whisper
at all.

The motivating case is the raid commander: one person whispers to four
channels at once, all 20+ players in those channels hear the callout,
and nobody outside the target set does. The same primitive covers
"whisper to my squad lead," "whisper to everyone with the @officer
role," and saved whisper presets bound to a keybind.

This builds directly on the per-sender receive pipeline from
[`voice-volume.md`](voice-volume.md): a whisper is just another audio
source mixed into the listener's output, distinguished by a packet-type
flag. Read that doc first — the `sender_id` stamping and per-sender mix
it introduced are prerequisites here.

---

## Decision 1 — hub-routed for all group sizes, not a WebRTC mesh

**Decision**: all whisper audio is hub-routed regardless of target count.
The whisperer uploads **one** stream; the hub fans it out to the resolved
target set, exactly as it already fans out normal channel voice.

**Alternative considered — a WebRTC peer connection per target**: a
commander whispering to four channels (100+ people) would have to
establish 100 `RTCPeerConnection`s and encode 100 outbound streams.
That is untenable on a client and defeats the point of a one-to-many
callout. Rejected.

**Why hub-routed wins**: a single upload stream scales to any target
count without touching the whisperer's uplink. Bandwidth math: whisper
at ~50 pps x ~200 bytes/packet is about **10 KB/s per active whisperer**,
independent of target count. Hub outbound is `10 KB/s x N targets`. At
500 targets on a managed farm (100 Mbps uplink) that is 5 MB/s — well
within capacity. Self-hosted home-box hubs should document a **~200-target
soft limit** (20 MB/s uplink). This is the same pure-relay posture the hub
already holds for channel voice ([`voice.md`](voice.md)).

**WebRTC P2P as a future hardening layer**: for small groups (<=10 targets)
who want hub-invisible end-to-end whisper, a future enhancement adds a
`private: true` flag that switches to WebRTC peer connections with the hub
relaying only signaling — the same posture as
[`screen-share-webrtc.md`](screen-share-webrtc.md). The wire protocol
reserves a packet-type value for it (see Decision 2). Deferred to v2.

---

## Decision 2 — a `packet_type` byte in the UDP header

**Current fan-out header** (stamped by the hub, per
[`voice-volume.md`](voice-volume.md)):

```
[sender_id: u16][seq: u16][timestamp: u32][opus_data]   = 8-byte header
```

**New fan-out header**:

```
[sender_id: u16][packet_type: u8][seq: u16][timestamp: u32][opus_data]   = 9-byte header
```

`packet_type` values:

| Value | Meaning |
|---|---|
| `0x00` | normal channel voice |
| `0x01` | whisper (hub-routed) |
| `0x02` | **reserved** — private whisper via WebRTC (v2; hub relays signaling only) |

**Backward compatibility**: a receiver that understands the 9-byte header
treats `0x00` as normal voice, so the byte is transparent to existing
gain/mix logic. Old clients that don't recognise the bumped protocol
version ignore the packet — the standard protocol-version gating in
`voice/src/protocol.rs` (Wavvon-desktop). The protocol version is bumped
there.

The receiving client reads `packet_type`; for `0x01` it shows the
whisper indicator on the sender's tile and routes the audio through the
whisper path (a per-sender mix entry, separate from normal channel
gain — see [Client receive path](#client-receive-path)).

---

## Whisper target types

```
WhisperTarget:
  { type: "user",    pubkey: string }      — a specific user currently in voice
  { type: "channel", channel_id: string }  — everyone currently in voice in this channel
  { type: "role",    role_id: string }     — everyone with this role currently in voice
```

Targets are resolved at whisper-start time into a set of `SocketAddr`s,
then **kept live**: as users join or leave voice, the hub re-resolves the
affected sessions so a player who joins a target channel mid-callout
starts hearing the whisper, and one who leaves stops.

Only users **currently in voice** are ever in a resolved set. Whisper to
an offline or text-only user is out of scope (see
[What's deferred](#whats-deferred)).

---

## Hub state additions

In `hub/src/state.rs` (Wavvon-server), alongside `voice_channels` and the
proximity `voice_zones`:

```rust
/// Active whisper sessions: sender_pubkey -> set of destination SocketAddrs.
whisper_targets: RwLock<HashMap<String, HashSet<SocketAddr>>>,

/// Reverse index: sender_pubkey -> original target descriptors,
/// kept so the hub can re-resolve on any voice join/leave.
whisper_target_defs: RwLock<HashMap<String, Vec<WhisperTargetDef>>>,
```

`WhisperTargetDef` carries the original spec (the `type` + id, not the
resolved addresses). On any `VoiceJoin` or `VoiceLeave` event, the hub
walks the active sessions whose target set could be affected and rebuilds
the `whisper_targets` entry from the stored defs. Re-resolution is cheap:
the candidate set is "sessions targeting the channel/role the user joined
or left," not every session.

A whisper session is torn down on `voice_whisper_stop`, on the
whisperer leaving voice, and on WS disconnect (same lifecycle hooks that
clean up `voice_channels` membership).

---

## New WS envelopes

New variants on the existing per-hub chat WebSocket (same transport the
proximity and screen-share signaling use — no new socket).

**Client -> Hub:**

| Message | Purpose |
|---|---|
| `voice_whisper_start { targets: [{ type, id }] }` | resolve targets, open a whisper session for this sender |
| `voice_whisper_stop {}` | close the sender's whisper session |

**Hub -> Client (targeted, not broadcast):**

| Message | When |
|---|---|
| `voice_whisper_started { sender_pubkey }` | delivered only to the resolved target recipients, so their clients show the indicator |
| `voice_whisper_stopped { sender_pubkey }` | same recipient set, on stop |

`voice_whisper_started` / `voice_whisper_stopped` are **not** broadcast to
the whole channel — they go only to the resolved target set, via `chat_tx`
with a `to_pubkeys` filter (the same targeted-delivery mechanism the
screen-share signaling already uses). A bystander never learns a whisper
is happening.

When the live target set changes mid-session (a player joins a target
channel), the hub sends `voice_whisper_started` to the newcomer and
`voice_whisper_stopped` to anyone who dropped out, so indicators stay
correct without re-announcing to the whole set.

---

## UDP relay change

In the `hub/src/` UDP relay loop (Wavvon-server), after the sender lookup
that already produces `sender_id`:

```
if whisper_targets contains sender_pubkey:
    targets = whisper_targets[sender_pubkey]
    packet  = [sender_id(2)] + [0x01(1)] + rest_of_header_and_opus
else:
    targets = voice_channels[channel_id].all_except(sender)
    packet  = [sender_id(2)] + [0x00(1)] + rest_of_header_and_opus
```

**The type byte is inserted by the hub fan-out, not by the client.** The
client's send path is unchanged: it sends the same frame it always has,
and the hub stamps `sender_id` and `packet_type` when relaying — exactly
as it already stamps `sender_id` for normal voice. This keeps the whole
client send pipeline (`voice/src/transport.rs`, Wavvon-desktop) untouched;
whisper is a routing decision the hub makes from WS state.

A whisperer's frames go **only** to the whisper target set — they are not
also fanned out to their own channel. That is what makes the whisper
inaudible to the channel the whisperer is sitting in.

---

## Client receive path

In `voice/src/playback.rs` (Wavvon-desktop), extending the per-sender
pipeline from [`voice-volume.md`](voice-volume.md):

```
on incoming UDP packet:
  sender_id   = header.sender_id
  packet_type = header.packet_type
  entry = per_sender.entry(sender_id)         // same per-sender state
  entry.is_whisper = (packet_type == 0x01)    // tag the current source
  entry.jitter_buffer.push(packet)
```

A whisper is mixed like any other sender, through the same per-sender
gain and jitter buffer. The `is_whisper` tag drives two things:

- **The indicator** — the sender's participant tile shows the whisper
  indicator while whisper packets are arriving.
- **An optional whisper-path gain** — a separate user preference can make
  whispers slightly louder or duck the channel under them, since a callout
  the listener must hear over game audio is the point. This composes on
  top of the existing per-sender gain (`effective = manual_gain x
  whisper_boost`), reusing the single `entry.gain` application point.

No new decoder or buffer is introduced — whisper rides the existing
per-sender infrastructure. The block/ignore rule still wins: a blocked
user's whisper is forced to gain `0.0`, same as their channel voice
([`block-mute-ignore.md`](block-mute-ignore.md)).

---

## Whisper lists (presets)

A whisper list is a saved set of targets with a name and an optional
keybind:

```json
{
  "name": "Raid Callout",
  "targets": [
    { "type": "channel", "id": "..." },
    { "type": "channel", "id": "..." }
  ],
  "keybind": "F1"
}
```

Whisper lists are **personal-axis state, per hub** — they describe who
*this user* wants to whisper to on *this hub*, not anything the community
owns. They live in the encrypted prefs blob on the home hub list
([`home-hub.md`](home-hub.md)), keyed per hub, and are exposed via the
home hub list API. Same storage and debounced-flush pattern as
`voice_gains` in [`voice-volume.md`](voice-volume.md).

Storing target ids (not resolved members) keeps a preset stable as people
come and go — resolution happens fresh each time the list is activated.

---

## Client activation and UI

**Two activation modes** (per whisper list or ad-hoc target):

- **PTT whisper** — hold the configured keybind while in voice; the client
  sends `voice_whisper_start` on keydown and `voice_whisper_stop` on
  keyup. This is the raid-commander default.
- **Toggle whisper** — click to start, click again to stop.

**Target selection UI** (Wavvon-desktop, mirrored in Wavvon-web /
Wavvon-android):

- Right-click a user in the voice participants list -> **Whisper**.
- Right-click a channel header -> **Whisper to channel**.
- A dedicated whisper button in the voice controls opens a target
  selector listing users, channels, roles, and saved whisper lists.

**Visual indicators:**

- **Whisperer** — the voice bar shows `Whispering -> #team-1, #team-2`.
  In their own channel's participant list they appear as muted (correct:
  they are silent *to that channel* while speaking to the target set).
- **Recipient** — a small badge `[Commander] is whispering` appears
  above their channel, driven by `voice_whisper_started`/`stopped` plus
  the `0x01` packets actually arriving.

**Tauri commands** (Wavvon-desktop): `start_whisper(targets)` and
`stop_whisper()` send `voice_whisper_start` / `voice_whisper_stop` over
the active hub WS via `send_hub_ws_raw`. No new UDP path on the client —
the whisper distinction is entirely a hub-routing decision driven by these
WS messages.

---

## What changes on the implementation side

| Piece | Repo / file |
|---|---|
| `packet_type` byte in fan-out header; bump protocol version | `voice/src/protocol.rs` (Wavvon-desktop) |
| Read `packet_type`, tag per-sender entry, whisper-path gain | `voice/src/playback.rs` (Wavvon-desktop) |
| Stamp `0x01`/`0x00`; route whisperer frames to `whisper_targets` | `hub/src/` UDP relay (Wavvon-server) |
| `whisper_targets` + `whisper_target_defs` state | `hub/src/state.rs` (Wavvon-server) |
| `voice_whisper_start/stop` handlers; target resolution + live re-resolve on join/leave | `hub/src/routes/ws.rs` + `chat_models.rs` (Wavvon-server) |
| `voice_whisper_started/stopped` targeted delivery via `to_pubkeys` | `hub/src/routes/ws.rs` (Wavvon-server) |
| Whisper lists in the prefs blob; home hub list API | Wavvon-desktop prefs layer + home hub list API (Wavvon-server) |
| Activation modes, target selector, indicators | Wavvon-desktop / Wavvon-web / Wavvon-android |
| `start_whisper` / `stop_whisper` Tauri commands | `desktop/src-tauri/` (Wavvon-desktop) |

---

## What's deferred

- **WebRTC P2P whisper** — truly E2E-private small-group whisper, hub sees
  no audio. Reserved as `packet_type = 0x02`; the hub relays only
  signaling, same posture as [`screen-share-webrtc.md`](screen-share-webrtc.md).
- **Whisper reply** — recipient presses a key to whisper straight back to
  the sender.
- **Whisper history indicator** — "X whispered to you 30s ago" when the
  recipient was focused on another app.
- **Whisper to offline / text-only users** — async delivery as a DM.
- **Per-hub max-targets enforcement** — an operator setting that caps the
  resolved target set for self-hosted bandwidth control (the ~200-target
  soft limit becomes a hard limit). Documented here as a soft limit; the
  enforcement knob ships later.