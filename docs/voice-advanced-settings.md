# Voice Advanced Settings (Audio Quality Modes)

Three selectable quality profiles for the voice pipeline: **Standard**
(current default, speech-optimised), **Music** (live performance and
instruments), and **Custom** (all parameters exposed). Profiles are stored
per-device in `voice.json` alongside the existing device/VAD settings.

---

## Profiles

### Standard (default)

Current behaviour — no change for existing users.

| Parameter | Value |
|---|---|
| Opus application | `Voip` |
| Bitrate | auto (~32–48 kbps) |
| Noise suppression | on |
| VAD | on |
| VAD threshold | 0.02 |
| Channels | mono |
| Frame duration | 20 ms |
| Complexity | 5 |

### Music

For live performance, instruments, podcasting, or any audio where the
speech-optimisation pipeline is destructive.

| Parameter | Value | Why |
|---|---|---|
| Opus application | `Audio` | Preserves harmonics; less aggressive compression |
| Bitrate | 128 kbps | Enough headroom for full-range audio |
| Noise suppression | **off** | RNNoise would destroy musical timbre |
| VAD | **off** | Silences are musically intentional |
| Channels | stereo | Full stereo field; doubles bandwidth |
| Frame duration | 20 ms | Keeps latency low even without VAD |
| Complexity | 9 | Best quality at the given bitrate |

### Custom

Every parameter exposed. Any combination is valid. The UI shows all knobs
only in this mode.

| Parameter | UI control | Range |
|---|---|---|
| Opus application | Dropdown | Voip / Audio / LowDelay |
| Bitrate | Slider + number | 6 – 320 kbps; "auto" = Opus default |
| Noise suppression | Toggle | |
| VAD | Toggle | |
| VAD sensitivity | Slider | 0.001 – 0.2 (lower = more sensitive) |
| Channels | Toggle | Mono / Stereo |
| Frame duration | Dropdown | 20 ms / 40 ms / 60 ms |
| Complexity | Slider 0–10 | 0 = fastest, 10 = best quality |

---

## Decision — stereo without a hub protocol change

**Decision**: stereo is implemented by configuring the Opus encoder for 2
channels (`Channels::Stereo`) and adjusting the cpal capture to keep the
stereo signal rather than summing to mono. Encoded frames are wider but
the hub treats them as opaque bytes — it fans out the frames unchanged.
Receiving clients decode the two-channel frame; those running mono settings
sum channels to mono at the decoder (Opus handles this automatically).
No hub protocol change is needed.

**Tradeoff**: a stereo stream at 128 kbps doubles the data the hub fans out
per sender. Hub operators on constrained uplinks may want to document this.

---

## Decision — LowDelay mode trade-offs

`Application::LowDelay` disables the psychoacoustic model and most packet
loss concealment. Lowest latency of the three modes (~5 ms less than Voip),
worst quality under packet loss. Appropriate only for real-time monitoring
where latency matters more than quality. Exposed in Custom; not a named
profile because the use case is narrow.

---

## Changes in the voice crate

### `VoiceSettings`

```rust
#[derive(Clone, Debug, Default)]
pub enum AudioProfile { Standard, Music, Custom }

pub struct VoiceSettings {
    pub input_device:    Option<String>,
    pub output_device:   Option<String>,
    pub audio_profile:   AudioProfile,
    // Custom overrides (ignored when profile is Standard or Music)
    pub custom_bitrate:       Option<u32>,    // kbps; None = auto
    pub custom_app:           Option<String>, // "voip" | "audio" | "lowdelay"
    pub custom_noise_suppress: Option<bool>,
    pub custom_vad:           Option<bool>,
    pub custom_vad_threshold: Option<f32>,
    pub custom_channels:      Option<u16>,   // 1 or 2
    pub custom_frame_ms:      Option<u32>,   // 20 | 40 | 60
    pub custom_complexity:    Option<u32>,   // 0–10
}
```

`VoiceSettings::effective()` resolves the active profile into a flat
`EffectiveVoiceConfig` struct that the pipeline reads.

### `codec.rs`

`VoiceEncoder::new` accepts bitrate, application, complexity, channels from
`EffectiveVoiceConfig`. Calls `encoder.set_bitrate()` and
`encoder.set_complexity()` after construction.

### `denoise.rs`

`Denoiser` gains a `bypass: bool` flag. When true, `process()` returns
the input slice unchanged.

### `pipeline.rs`

- Reads `EffectiveVoiceConfig` at pipeline start.
- Passes `bypass` to `Denoiser`.
- Skips the VAD gate when `vad_enabled = false` (always transmit).
  This line described an intention rather than the code until 2026-08-22:
  `vad_enabled` only chose how the speaking indicator behaved, and every frame
  went out either way, so "drops silence" in the settings was a switch wired to
  nothing. The gate exists now on both clients. The web engine resolves the same
  profile table in `apps/web/src/platform/speakingDetector.ts` (`effectiveVad`)
  and has to test a playing soundboard clip separately, because it runs speech
  detection on the raw mic frame while this pipeline mixes the clip in before
  the VAD.
- Uses configured `frame_duration_ms` for `frame_size`.
- Passes `channels` to `AudioCapture` (keeps stereo signal if 2).

---

## Changes in lib.rs + UI

### `StoredVoiceSettings`

Add new fields with serde `default` so existing `voice.json` files are
forward-compatible:

```rust
#[serde(default)]
pub audio_profile: Option<String>,   // "standard" | "music" | "custom"
#[serde(default)]
pub custom_bitrate: Option<u32>,
#[serde(default)]
pub custom_app: Option<String>,
#[serde(default)]
pub custom_noise_suppress: Option<bool>,
#[serde(default)]
pub custom_vad: Option<bool>,
#[serde(default)]
pub custom_vad_threshold: Option<f32>,
#[serde(default)]
pub custom_channels: Option<u16>,
#[serde(default)]
pub custom_frame_ms: Option<u32>,
#[serde(default)]
pub custom_complexity: Option<u32>,
```

### Settings UI

`SettingsPage → Voice` tab gains a three-way profile selector
(Standard / Music / Custom). When Custom is selected a collapsible panel
below it shows all knobs. Standard and Music show a short description of
what they change. Profile change takes effect on next voice join (no
hot-reload mid-call; show a note if currently in voice).
