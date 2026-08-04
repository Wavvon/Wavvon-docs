# AFK channel

Discord/TeamSpeak-style AFK handling: a hub owner designates one voice
channel as the AFK channel and picks an idle timeout; voice participants
who go idle longer than the timeout are automatically moved there.
Shipped 2026-08-04.

## Settings

Two `hub_settings` keys, editable by admins via `PATCH /hub` and shown
in the Hub admin → Overview tab:

| Key | Meaning |
|---|---|
| `afk_channel_id` | Destination channel. Must reference an existing non-category channel. Empty/unset = feature disabled. |
| `afk_timeout_secs` | Idle threshold in seconds. Minimum 60, default 300. |

Both surface in `GET /hub/settings` (`afk_channel_id` null when unset).
The admin UI offers Discord-style presets (1/5/15/30/60 min) but the
API accepts any value ≥ 60.

## Idle definition

Idle = **no speaking observed by the hub**. Clients already send
`voice_speaking` WS messages on every speaking start/stop; the hub
stamps `AppState.voice_last_active` (pubkey → unix ts, in-memory) on
voice join and on every `voice_speaking` message, and drops the stamp
on leave. Self-muted users naturally count as idle.

*Alternative rejected*: TeamSpeak-style client-reported OS idle time —
would need new wire messages and trusts the client; speaking-based
detection is server-observable and needs zero client changes.

## Sweep

`afk_worker` ticks every 30s (same shape as `temp_channel_worker`).
Each pass, when an AFK channel is configured:

1. Snapshot voice participants outside the AFK channel whose stamp is
   older than the timeout.
2. Skip anyone without effective `READ_MESSAGES` on the AFK channel —
   same gate as the manual event-less move (a move must not reveal a
   hidden channel).
3. Push the existing `voice_move` control message (events.md §7.1) with
   `auto: true` — the client runs its normal leave-and-join immediately
   with the rejoin-escape-hatch toast; the hub never yanks anyone
   server-side. An AFK user isn't there to answer a prompt, hence
   `auto`.
4. Re-stamp the target so a non-complying client is re-pushed once per
   timeout window, not every tick.

Users already parked in the AFK channel are never swept (they stay
until they move themselves, matching Discord).

## Tests

`server/crates/hub/tests/afk_flow.rs`: settings round-trip + clearing,
validation rejections (unknown channel, sub-60 timeout), sweep moves an
idle participant exactly once with `auto: true`, sweep skips active
users and AFK-channel occupants, `voice_speaking` refreshes the stamp.
