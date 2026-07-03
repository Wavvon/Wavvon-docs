# Soundboard & Bot Audio Injection

Two features, one theme: **non-microphone audio entering a voice
channel**. Designed together because each constrains the other; they
deliberately use *different* injection points, and this doc records
why.

**Status: designed, not implemented.** ROADMAP wishlist item.

---

## 1. Soundboard

Per-hub library of short clips members trigger in voice.

### Injection point: client-side mix, sender's own stream

The clip is decoded on the triggering user's client and **mixed into
their outgoing stream after RNNoise, before Opus encode** (the
`crates/voice` chain; web mixes PCM before its encoder the same way).

- **Zero relay changes** — the hub keeps relaying opaque frames; both
  transports (UDP + WS) work unchanged, today.
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

Two new constants in `permissions.rs` (they slot into the role editor
and channel overwrites automatically, since both operate on strings):

- `use_soundboard` — play clips; channel-deniable via overwrites
  (a serious-meeting channel can deny it on @everyone).
- `manage_soundboard` — upload/rename/delete clips.

### Routes and events

- `GET /soundboard` (list), `POST /soundboard` (multipart upload,
  `manage_soundboard`), `DELETE /soundboard/:id` (`manage_soundboard`),
  `GET /soundboard/:id/audio` (bytes, cacheable).
- Playing: client mixes locally and POSTs `/soundboard/:id/played`
  `{channel_id}` (`use_soundboard` resolved channel-scoped), which
  broadcasts WS `soundboard_played { channel_id, clip_id, clip_name,
  public_key }` — the **attribution path**: clients show a transient
  "🔊 X played *airhorn*" chip in the voice roster. The server cannot
  verify the mix actually happened (it's opaque audio); the event is
  UX, and the permission check is the enforcement that matters —
  a client that mixes without POSTing gains nothing a talking user
  couldn't already do with a virtual audio cable.

### Client UI (web first)

Soundboard popover on the voice bar (grid of emoji+name buttons),
visible only when in voice and `use_soundboard` is effective in the
current channel. Manage view in hub admin. Local playback preview
before/while uploading. Rate-limit client-side (one clip at a time; no
overlap with your own previous clip).

## 2. Bot audio injection

**Injection point: the existing WS voice relay.** The browser client
already proves the pattern: authenticate, `voice_join` over WS, send
`[sender_id][packet_type][seq][ts][opus]` binary frames
([voice.md](voice.md) §WS relay). A bot is just another such session:

- Gate: bot session with the `can_speak_voice` capability
  ([bots.md](bots.md) — the flag already exists, deferred) AND
  channel-scoped `read_messages` like any voice joiner.
- The bot appears in the voice roster as a normal participant (its bot
  identity), gets its own `sender_id`, and listeners control its
  volume per-participant like anyone else — exactly why bots get a
  *stream* while soundboard clips don't: bot audio is long-form
  (music, TTS, recordings) where per-source volume and mute matter.
- Bot SDK addition: a small `send_opus(channel_id, frames)` /
  `join_voice(channel_id)` helper; encoding is the bot's problem
  (document 48kHz/20ms mono Opus as the expected shape, same as
  clients produce).
- No new relay machinery: fan-out, address learning, self-mute
  semantics all apply as-is. **Deliberately not designed here**: bots
  *receiving* voice (recording/STT) — that's a consent/privacy design
  (voice is currently relay-opaque and unrecorded), kept separate.

## 3. Deferred

- **Per-clip synthetic streams** — revisit only if long soundboard
  clips (music stingers) become a real ask.
- **Bot voice receive** — consent design needed first (see above).
- **Hub-configurable clip caps** and per-channel soundboard sets.
- **Desktop/Android soundboard UI** — web first per delivery target;
  the mix point in `crates/voice` is shared, so native lags only on UI.

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
  `use_soundboard` check on the played-event POST plus the fact that
  mixing audio into one's own stream is already possible with a
  virtual cable — the feature adds convenience and *visibility*, not a
  new capability to abuse.
- **Bot injection reuses the WS voice relay wholesale.** The web
  client already proved a WS session can be a first-class voice
  participant; a bot session differs only in auth flavor. No parallel
  "bot audio API" to keep in sync with the relay.
