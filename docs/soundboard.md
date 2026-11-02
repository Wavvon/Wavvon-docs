# Soundboard & Bot Audio Injection

Two features, one theme: **non-microphone audio entering a voice
channel**. Designed together because each constrains the other; they
deliberately use *different* injection points, and this doc records
why.

**Status: built, hub and clients.** Hub: Wavvon-server
`crates/hub/src/routes/soundboard.rs`. Clients (web + desktop, shared UI
in Wavvon-clients `packages/ui`): `SoundboardPopover.tsx`,
`SoundboardAdminSection.tsx`, `useSoundboardChips.ts`; the mix is in
`crates/voice/src/soundboard.rs` (desktop) and
`apps/web/src/platform/soundboardMix.ts` (web).

---

## 1. Soundboard

Per-hub library of short clips members trigger in voice.

### Injection point: client-side mix, sender's own stream

The clip is decoded on the triggering user's client and **mixed into
their outgoing stream after RNNoise, before Opus encode** (the
`crates/voice` chain; web mixes PCM before its encoder the same way).

- **Zero relay changes** — the hub keeps relaying opaque frames (now
  E2E-sealed WebTransport datagrams, voice transport v2).
- Mixing after denoise means the clip isn't mangled by RNNoise; the
  user's mic stays live under it.
- Tradeoff accepted: the clip arrives as the *user's* audio — listeners'
  per-user volume for that user applies to the clip too. Attribution is
  handled out-of-band (below), not by a separate audio stream. A
  separate synthetic sender per clip would give per-clip volume control
  at the cost of relay/roster/UI changes everywhere; not worth it for
  ≤10-second effects.

### Clip library (hub-side)

```sql
CREATE TABLE IF NOT EXISTS soundboard_clips (
    id          TEXT   PRIMARY KEY,
    name        TEXT   NOT NULL,
    emoji       TEXT,              -- button face, optional
    uploader    TEXT   NOT NULL REFERENCES users(public_key),
    size_bytes  BIGINT NOT NULL,
    duration_ms BIGINT NOT NULL,
    created_at  BIGINT NOT NULL
);
```

Audio bytes go through the existing upload storage (`uploads.rs`
patterns). Format: **Opus-in-Ogg only**, validated server-side; caps:
**≤10s, ≤512KB, ≤50 clips per hub** (hub-configurable later). Both
clients already ship Opus decoders (audiopus native, opusscript web).

### Permissions

Two permissions in `crates/hub/src/permissions.rs`:

- `voice.soundboard.use` — play clips; hub and channel scope, so a
  serious-meeting channel can deny it on everyone.
- `voice.soundboard.manage` — upload/delete clips; hub scope only.

### Routes and events

- `GET /soundboard` (list), `POST /soundboard` (multipart upload,
  `voice.soundboard.manage`), `DELETE /soundboard/{id}`
  (`voice.soundboard.manage`), `GET /soundboard/{id}/audio` (bytes,
  cacheable). No rename route.
- Playing: client mixes locally and POSTs `/soundboard/{id}/played`
  `{channel_id}` (`voice.soundboard.use` resolved channel-scoped), which
  broadcasts WS `soundboard_played { channel_id, clip_id, clip_name,
  public_key }` — the **attribution path**: clients show a transient
  "🔊 X played *airhorn*" chip in the voice roster. The server cannot
  verify the mix actually happened (it's opaque audio); the event is
  UX, and the permission check is the enforcement that matters —
  a client that mixes without POSTing gains nothing a talking user
  couldn't already do with a virtual audio cable.

### Client UI (web first)

Soundboard popover on the voice bar (grid of emoji+name buttons),
visible only when in voice and `voice.soundboard.use` is effective in the
current channel. Manage view in hub admin. Local playback preview
before/while uploading. Rate-limit client-side (one clip at a time; no
overlap with your own previous clip).

## 2. Audio injection by a program

**Status: nothing special to implement.** A program joins voice the way a
person does, under the same channel-scoped voice permissions. The capability
gate that once stood beside them was deleted with the bot subsystem
([decisions.md](decisions.md), "A bot is a client like any other"), and the
`/voice/ws` relay this section described is gone too — the transport is voice
v2 (`voice-transport-v2.md`).

No client SDK helper (`join_voice`/`send_opus`) exists yet: a program that
wants to speak opens the transport and frames Opus packets itself, matching
what `voice.md` documents for the browser client.

**Injection point: the ordinary voice relay.** A program does what a
client does: authenticate, `voice_join` over the WS, open the
WebTransport session from `voice_joined`, exchange sender keys, and send
sealed `[key_id][ctr][ts][ciphertext]` datagrams
([voice-transport-v2.md](voice-transport-v2.md)). (This section first
described the deleted `/voice/ws` binary-frame relay.) A program is just
another such session:

- Gate: the channel-scoped voice permissions every joiner passes. There is
  no second gate — the capability that used to sit beside them went with
  the bot subsystem ([apps.md](apps.md)).
- It appears in the voice roster as a normal participant, gets its own
  `sender_id`, and listeners control its volume per-participant like
  anyone else — exactly why it gets a *stream* while soundboard clips do
  not: this audio is long-form (music, TTS, recordings) where per-source
  volume and mute matter.
- SDK addition: a small `send_opus(channel_id, frames)` /
  `join_voice(channel_id)` helper; encoding is the caller's problem
  (document 48kHz/20ms mono Opus as the expected shape, same as
  clients produce).
- No new relay machinery: fan-out, session binding, self-mute
  semantics all apply as-is. **Deliberately not designed here**: a program
  *receiving* voice (recording/STT) — that's a consent/privacy design
  (voice is currently relay-opaque and unrecorded), kept separate.

## 3. Deferred

- **Per-clip synthetic streams** — revisit only if long soundboard
  clips (music stingers) become a real ask.
- **Bot voice receive** — consent design needed first (see above).
- **Hub-configurable clip caps** and per-channel soundboard sets.

---

## Decisions

- **Soundboard mixes client-side into the sender's stream; bots get a
  real relay session.** One rule decides: is the audio short-form
  decoration (rides the user's stream, zero infra) or long-form
  content (needs its own roster presence, volume, mute)? Clips are
  decoration; bots are content.
- **Opus-in-Ogg only, hard caps.** Both platforms already decode Opus;
  accepting arbitrary formats means a transcoding pipeline and a
  moderation surface. 10s/512KB/50-clips keeps the library a
  soundboard, not a file host.
- **`soundboard_played` is attribution UX, not enforcement.** The relay
  is audio-opaque by design; enforcement is the channel-scoped
  `voice.soundboard.use` check on the played-event POST plus the fact that
  mixing audio into one's own stream is already possible with a
  virtual cable — the feature adds convenience and *visibility*, not a
  new capability to abuse.
- **Bot injection reuses the voice relay wholesale.** A program is a
  first-class voice participant on the same transport as every client
  (originally the `/voice/ws` relay, WebTransport since voice v2). No
  parallel "bot audio API" to keep in sync with the relay.
