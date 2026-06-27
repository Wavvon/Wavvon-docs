# Per-participant voice volume control

Lets a user independently adjust the playback volume of each person in a
voice channel — boost a quiet speaker, reduce a loud one, or mute one
person without leaving the channel. This is personal-axis state: settings
follow the user across devices, are never visible to the adjusted person,
and require no server cooperation beyond what the protocol change below
adds.

`voice.md` lists "Per-user gain / spatial audio" as not yet done. This doc
is the design. Proximity voice (`proximity-voice.md`) builds on this
feature by using per-sender gain as its attenuation hook.

---

## Decision 1 — add `sender_id` to fanned-out UDP packets

**Decision**: the hub stamps each UDP voice packet it fans out with a
2-byte `sender_id` — a session-local handle assigned to a participant when
they join voice in a channel. The client maps `sender_id → pubkey` via a
new `voice_roster` WS message (delivered when the user joins voice and on
each roster change).

**Why a sender_id is needed**: the current hub relay (the UDP voice
loop in `hub/src/main.rs`, Wavvon-server) fans out signed Opus frames but the fan-out
copy does not carry an explicit sender identifier the receiver can act on
without re-parsing the signature. Adding an explicit handle in the packet
header is the clean contract.

**Why u16 (2 bytes), not the 32-byte pubkey**: Opus frames at 40 kbps are
~80 bytes per 20 ms frame. Embedding 32 bytes per frame is 40% overhead.
A u16 sender_id is 2.5% overhead. Channels have at most a few dozen
concurrent speakers; u16 is ample and never needs cycling within a session.

**Alternative considered — derive sender from the frame's signature**: the
hub could include the signer pubkey verbatim. Rejected as wasteful on wire
(see above). Rejected also as a soft coupling between the voice relay and
the identity format; the sender_id handle is a clean boundary.

**Wire format change**: the fanned-out UDP packet header gains two bytes
before the Opus payload, carrying the `sender_id` as a big-endian u16.
The protocol version in the header is bumped. Old clients that don't
recognise the new version ignore the packet — they lose voice from updated
hubs until they update. This is the standard protocol-version gating
pattern in `voice/src/protocol.rs`.

**New WS message** (hub → client, over the chat WebSocket):
```
voice_roster_update {
  channel_id: String,
  participants: [{ sender_id: u16, pubkey: String }]
}
```
Sent on voice join (full roster snapshot) and on every join/leave event.
The client maintains `HashMap<u16, String>` mapping sender_id → pubkey.

---

## Decision 2 — per-sender receive pipeline

**Decision**: refactor `voice/src/playback.rs` from a single mixed
pipeline to a `HashMap<sender_id, PerSenderState>` where each entry holds
an independent Opus decoder, jitter buffer, and gain value.

**Current shape**: the receiver likely has a single ring buffer / jitter
buffer and decodes all incoming frames into one mixed output stream —
efficient but opaque to per-sender control.

**New shape**:
```
for each incoming UDP packet:
  sender_id = packet.header.sender_id
  entry = state.per_sender.entry(sender_id).or_insert_with(|| {
      PerSenderState::new(decoder, jitter_buffer, gain: 1.0)
  })
  entry.jitter_buffer.push(packet)

on each audio output tick (~20ms):
  mixed = silence_frame
  for entry in state.per_sender.values():
    frame = entry.jitter_buffer.pop_decoded_or_conceal()
    frame *= entry.gain          // apply per-sender gain
    mixed += frame               // mix into output
  output_device.write(mixed)
```

Each sender has their own decoder state and jitter buffer. The gain
multiplier is applied per-sender before mixing. This is the same shape
as a standard SFU client receive pipeline.

**Cleanup**: remove `PerSenderState` entries when the sender leaves the
channel (triggered by `voice_roster_update` with the sender absent).

---

## Gain model

- Range: `[0.0, 2.0]` (f32). `0.0` = fully muted, `1.0` = unity
  (default), `2.0` = doubled (+6 dB).
- Applied as a linear multiplier to the decoded PCM before mixing.
  Simple, predictable, sufficient for a social voice control. A log/dB UI
  scale maps to this linearly under the hood.
- **Composition with block/ignore** (per `block-mute-ignore.md`): a
  blocked user's voice is muted client-side by forcing their gain to `0.0`
  regardless of the stored preference. The block state wins; it is not
  stored as a volume setting.
- **Composition with proximity voice** (per `proximity-voice.md`): when
  a proximity zone is active, `effective_gain = manual_gain × proximity_gain`.
  The manual gain is the stored user preference; the proximity gain is
  computed from position. Both collapse into the same `entry.gain`
  application point in the pipeline.

---

## Persistence

Per-sender gain settings are **personal-axis state** — they follow the user
across devices and are never visible to the adjusted person or to the hub.

Storage: a `voice_gains` field in the encrypted home hub prefs blob
(`home-hub.md`), shape `{ pubkey_hex: f32 }`. At most a few dozen entries
per user in practice; space cost is negligible.

The client loads `voice_gains` from the prefs blob on startup. When the
user adjusts a slider, the client writes the new value to the blob
immediately (same debounced-flush pattern as other prefs blob mutations).

---

## UI

**Where**: in the voice participants panel (the list shown during an active
voice session in a channel). Each participant row gets a volume indicator
and a control surface.

**Interaction**: right-click (or a hover affordance on the participant row)
opens an inline popover with:
- A slider: 0 % to 200 %, default 100 %.
- A "Reset to default" option.
- A "Mute" toggle (sets gain to 0 without permanently storing 0 — a
  session-local mute separate from the stored preference; cleared on voice
  leave).

**Visual indicator**: a small speaker icon on the participant row that is
filled when at default, partially filled when reduced, outlined when muted,
and shows an upward indicator when boosted. Keeps the list uncluttered for
the common case (everyone at default) while surfacing active overrides.

**Applies to**: Wavvon-desktop, Wavvon-web, Wavvon-android. Same behaviour,
platform-appropriate slider implementation.

---

## What changes on the implementation side

| Piece | Repo / file |
|---|---|
| UDP packet header: add 2-byte `sender_id`; bump protocol version | `voice/src/protocol.rs` (Wavvon-desktop) |
| Fan-out: stamp each packet with the sender's `sender_id` | `hub/src/` UDP relay (Wavvon-server) |
| `voice_roster_update` WS message (send on voice join + roster change) | `hub/src/routes/ws.rs` + `chat_models.rs` (Wavvon-server) |
| Per-sender receive pipeline + gain multiplier | `voice/src/playback.rs` (Wavvon-desktop) |
| `voice_gains` prefs blob field; load/save | Wavvon-desktop identity/prefs layer |
| Volume slider UI on participant rows | Wavvon-desktop / Wavvon-web / Wavvon-android |

---

## What's not in this design

- Proximity attenuation (spatial gain from position) — see
  `proximity-voice.md`.
- Per-channel or per-hub default gain presets.
- Multiple output device routing per participant (assign different
  headsets to different speakers) — noted as "not done" in `voice.md`;
  still deferred.
- Global output volume (OS-level; outside the app's scope).
