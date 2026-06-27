# Screen Share Tier 2 — WebRTC Migration

v2 of screen share. The user-visible feature is identical to v1
([`screen-share.md`](screen-share.md)); the transport changes from
**hub-relayed WebM chunks over WebSocket** to **WebRTC peer-to-peer
media with the hub as a pure SDP/ICE signaler**. The hub stops
carrying video bytes.

This doc covers only what changes. Capture (`getDisplayMedia` /
`getUserMedia`), the source picker, viewer layout, permissions, and
the audio caveats are all unchanged from v1 — read `screen-share.md`
for those.

---

## Why v2 exists

The v1 hub fans out `N × ~2.6 Mbps` per viewer. Ten viewers on one
share is ~26 Mbps of hub egress, per active share, paid by the hub
operator. That ceiling is the documented v2 trigger (see
`decisions.md`, "Screen share v1"). v2 moves the media off the hub:
the sharer uploads directly to each viewer, the hub forwards only
small signaling envelopes (kilobytes total per session).

Secondary wins: lower latency (~100 ms vs 300–500 ms) and access to
WebRTC's adaptive bitrate and congestion control, which the v1
fixed-bitrate `MediaRecorder` path lacks.

---

## 1. Architecture

```
v1:   Sharer ──chunks──▶ Hub ──fan-out──▶ Viewer × N      (hub carries N copies)

v2:   Sharer ──SDP/ICE──▶ Hub ──SDP/ICE──▶ Viewer × N     (hub carries signaling only)
       │                                        ▲
       └────────── media (SRTP, direct) ────────┘
```

- The hub is an **SDP/ICE signaler**. It validates that both ends are
  members of the same channel and forwards offer/answer/candidate
  envelopes. It never sees media.
- The sharer holds **one `RTCPeerConnection` per viewer** (mesh from
  the sharer's perspective; each viewer has exactly one connection,
  to the sharer). Screen and webcam ride as separate tracks on the
  same connection (see §6).
- Media is SRTP, flowing on whatever path ICE negotiates: host
  candidate (LAN), server-reflexive (STUN-discovered public address),
  or relayed (TURN).

### When P2P fails — the fallback ladder

NAT traversal is not guaranteed. The ladder, per viewer:

1. **Direct (host / srflx candidate)** — the common case. Free.
2. **TURN relay** — for symmetric-NAT pairs. A TURN server relays the
   SRTP. TURN is **optional per hub**: a hub operator configures a
   TURN URL + credential, or doesn't.
3. **Graceful fall back to v1 chunk relay** — if ICE fails for a given
   viewer and no TURN is configured (or TURN also fails), that viewer's
   session degrades to the v1 path. v1 stays in the codebase precisely
   as this fallback.

**TURN is optional, v1-relay is the universal floor.** A hub with no
TURN configured and a sharer/viewer pair that can't traverse NAT still
works — it just costs that one viewer hub egress, same as v1. We do
not require operators to run or pay for TURN to ship v2.

> In v2 the sharer may simultaneously be on a direct P2P path to
> viewer A, a TURN-relayed path to viewer B, and a v1-chunk-relay path
> to viewer C. The sharer runs `MediaRecorder` (for the v1 fallback)
> only if at least one viewer needs it.

### Hub egress comparison

| Scenario | v1 | v2 (all direct) | v2 (k viewers on relay fallback) |
|---|---|---|---|
| Hub media egress | N × 2.6 Mbps | 0 | k × 2.6 Mbps (k ≤ N) |
| Sharer uplink | 2.6 Mbps | N × 2.6 Mbps | N × 2.6 Mbps |

The sharer-uplink line is v2's cost and v2's limit. A sharer on a weak
uplink with many viewers is the case P2P does not solve — that's the
v3 SFU (§8).

---

## 2. Signaling protocol

Signaling rides the **existing chat WebSocket** — same typed envelope
channel as v1 (`hub/src/routes/chat_models.rs` in Wavvon-server).
No new socket.

### New envelopes

```
// Client → Hub
ScreenShareOffer {
  channel_id: String,
  to_pubkey:  String,     // the viewer this offer is for
  stream_id:  String,     // sharer session id (groups screen + webcam tracks)
  sdp:        String,     // SDP offer
}
ScreenShareAnswer {
  channel_id: String,
  to_pubkey:  String,     // the sharer
  stream_id:  String,
  sdp:        String,     // SDP answer
}
ScreenShareIce {
  channel_id: String,
  to_pubkey:  String,     // the other peer
  stream_id:  String,
  candidate:  String,     // JSON: { candidate, sdpMid, sdpMLineIndex }
}
ScreenShareViewerJoin {   // viewer signals "negotiate with me"
  channel_id: String,
  stream_id:  String,
}
ScreenShareViewerLeave {  // viewer tears down
  channel_id: String,
  stream_id:  String,
}

// Hub → Client (forwarded, with from_pubkey stamped)
ScreenShareOfferIn  { /* same + from_pubkey */ }
ScreenShareAnswerIn { /* same + from_pubkey */ }
ScreenShareIceIn    { /* same + from_pubkey */ }
ScreenShareViewerJoined { channel_id, stream_id, from_pubkey }
ScreenShareViewerLeft   { channel_id, stream_id, from_pubkey }
```

The v1 lifecycle envelopes (`ScreenShareStart` / `ScreenShareStarted`
/ `ScreenShareStop` / `ScreenShareStopped`) are **retained unchanged**.
They announce that a share exists and its transport version (see §4);
the new envelopes negotiate the v2 media path on top.

### Who negotiates with whom

1. Sharer sends `ScreenShareStart { transport: "webrtc", ... }`. Hub
   broadcasts `ScreenShareStarted` to channel subscribers.
2. A subscriber who opens the viewer panel sends
   `ScreenShareViewerJoin`. The hub forwards it to the sharer as
   `ScreenShareViewerJoined { from_pubkey }`.
3. On `ScreenShareViewerJoined`, the **sharer** creates an
   `RTCPeerConnection`, adds its tracks, and sends a
   `ScreenShareOffer { to_pubkey: <viewer> }`.
4. Viewer replies `ScreenShareAnswer`; both trickle `ScreenShareIce`.
5. On `ScreenShareViewerLeft` (explicit leave or WS disconnect), the
   sharer closes that peer connection.

This **lazy, viewer-pull** model means the sharer creates connections
only for viewers who actually open the panel, not everyone subscribed.

### Hub validation

Per forwarded envelope the hub checks: (a) sender and `to_pubkey` are
both current channel members; (b) an `ActiveShare` exists for that
channel with a matching `stream_id`; (c) sender has `can_screen_share`
for offers. The hub does **not** parse SDP or ICE bodies — they are
opaque strings it relays.

---

## 3. Tauri / WebView constraints

Wavvon desktop uses Tauri 2 over the system WebView (WRY): WebView2 on
Windows, WKWebView on macOS, WebKitGTK on Linux, Android System
WebView on Android. WebRTC support is **not uniform**.

| Platform | WebView | Full WebRTC (v2) |
|---|---|---|
| Windows | WebView2 (Chromium) | **Yes** — full Chromium WebRTC stack |
| macOS | WKWebView | Effectively no — WKWebView lacks the full peer-connection surface in an embedded webview |
| Linux | WebKitGTK | **Fragile** — requires `ENABLE_WEB_RTC`, `gst-plugins-bad` (`webrtcbin`), X11; stock distro builds frequently omit these |
| Android | Android System WebView (Chromium) | **Yes** — Chromium-based |

Implications:

- **Windows and Android are the v2 happy path.**
- **Linux is the hard case.** v2 on Linux is capability-detected at
  runtime. A Linux client whose WebView lacks WebRTC stays on v1
  transparently. We do not ship a custom WebKitGTK build.
- **macOS** is a deferred packaging target; macOS-from-source users
  fall to v1.
- **Voice is unaffected.** Voice uses cpal natively (`voice/` crate),
  not WebRTC.

### Runtime capability detection

The client probes `typeof RTCPeerConnection !== "undefined"` at
startup, caching the result. This boolean is the client's half of the
v2/v1 negotiation in §4.

---

## 4. Migration path — v1 and v2 coexist

Three independent gates, all must pass for a session to use v2:

1. **Hub capability** — `/info` advertises `screen_share_v2: bool` and
   optional `turn: { url }`. An old hub omits the flag → clients use
   v1.
2. **Client capability** — the runtime WebRTC probe (§3) must pass.
3. **Per-session negotiation** — the **sharer** picks the transport and
   stamps it in `ScreenShareStart { transport: "webrtc" | "chunks" }`.
   Each viewer individually falls back to v1-relay if it can't do v2,
   without affecting other viewers.

Transport is negotiated **per (sharer, viewer) pair**. The sharer
decides v2-or-not; each viewer decides can-I-actually-receive-v2.

No admin toggle for v1-vs-v2 beyond the existing "Allow screen share"
hub switch. The gate is capability-driven, not policy-driven.

Rollout: hubs ship signaling first. Clients ship v2 capability next.
Once a sharer's hub and client both report v2, new shares use WebRTC
with automatic per-viewer fallback. v1 is never removed.

---

## 5. Multiple sharers

v1 enforces one sharer per channel; v2 makes it cheaper (zero added
hub egress per extra sharer).

**Decision: make the data model forward-compatible now, defer enabling.**

- `ActiveShare` map is keyed `(channel_id, sharer_pubkey)` instead of
  `channel_id` alone. This is the only structural change needed.
- The signaling protocol already supports multiple sharers
  (`stream_id` and `to_pubkey` are explicit).
- The hub still rejects a second concurrent share behind a config flag
  (`max_sharers_per_channel`, default 1). Flipping the default is the
  entire enabling change.

UI work (tiling, focus/spotlight, per-share volume) is deferred with
the flag.

---

## 6. Webcam as a second stream

Screen and webcam are **two tracks on the same `RTCPeerConnection`**,
not two separate stream IDs (cleaner than v1).

- The sharer announces the track-to-kind mapping once in
  `ScreenShareStart`: `tracks: [{ mid, kind: "screen" | "webcam" }]`.
- Toggling webcam mid-session fires `negotiationneeded`, producing a
  fresh offer/answer over the same signaling envelopes.
- Viewer rendering (webcam as draggable PiP overlay) is unchanged
  from v1.

---

## 7. Data model and protocol changes

### Wire protocol (Wavvon-server, `hub/src/routes/chat_models.rs`)

- New signaling envelopes (§2).
- `ScreenShareStart` gains `transport: "chunks" | "webrtc"` and
  `tracks: [{ mid, kind }]`. Additive — old clients read absent
  `transport` as `"chunks"`.
- v1 chunk envelopes retained as the relay-fallback floor.

### Hub runtime state (Wavvon-server, `hub/src/state.rs`)

`ActiveShare` map is re-keyed to `HashMap<(channel_id, sharer_pubkey), ActiveShare>`. `ActiveShare` gains a `viewers: HashSet<pubkey>` field (for join/leave routing and WS-disconnect cleanup). No DB schema changes; no persistence.

### `/info` capability

Add `screen_share_v2: bool` and optional `turn: { url }`.

### Client state machine

Sharer states: `Idle → Starting(transport) → Sharing → {per-viewer: Negotiating → Connected | RelayFallback} → Stopping`.
Viewer states: `Idle → Joining → {Negotiating → Connected | RelayFallback} → Leaving`.
The `RelayFallback` branch reuses v1 MSE/chunk code verbatim. The
UI layer is transport-agnostic.

---

## 8. Deferred to v3 — SFU

P2P trades hub egress for **sharer uplink**: a sharer with 30 viewers
uploads 30 copies. v3 introduces an SFU (Selective Forwarding Unit) —
a media server (likely farm-operated) that receives one upload from the
sharer and fans out to N viewers.

The §2 signaling protocol is forward-compatible with an SFU: the SFU
is a special peer the sharer offers to and viewers answer from,
mediated by the same offer/answer/ICE envelopes.

Deferred to v3: the SFU itself, simulcast / per-viewer quality
adaptation, server-side recording, farm-level shared SFU across an
alliance.

---

## Cross-references

- [`screen-share.md`](screen-share.md) — v1 transport, capture, UI, permissions (all unchanged)
- [`decisions.md`](decisions.md) — "Screen share v1" and "Screen share v2" entries
- [`packaging.md`](packaging.md) — Tauri WebView matrix; macOS deferred
- [`farm-model.md`](farm-model.md) — natural home for the v3 shared SFU
