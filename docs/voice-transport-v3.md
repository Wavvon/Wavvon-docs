# Voice Transport v3 — WebRTC data channels behind a transport port

> **Status:** designed 2026-11-20; hub, web, desktop and the Rust, Go and
> Python SDKs shipped on it by 2026-11-21, WebTransport removed (unreleased).
> The JS, .NET and Java SDKs have no voice yet. Replaces the *transport* of
> [voice-transport-v2.md](voice-transport-v2.md) (WebTransport/QUIC). The E2E
> layer of v2 — sender keys, `voice_key_*` signaling, the sealed packet format,
> the identity-crate constructions and their test vectors — is **kept
> unchanged**. Rationale: [decisions.md](decisions.md), "Voice transport v3:
> WebRTC data channels behind a transport port".

## Why

WebTransport over HTTP/3 is still an IETF draft. Browsers speak draft-02;
libraries that moved to current drafts no longer talk to it (the Go SDK carries
its own client for that reason, Wavvon-server#417), and Node, .NET and Java have
no WebTransport client at all, so voice is missing from three SDKs. WebRTC is a
finished standard with mature implementations in every language we ship.

Our voice stack already does everything a media stack would: Opus, a jitter
buffer, per-packet AEAD under per-sender keys. The transport only moves opaque
sealed packets. A WebRTC **data channel** configured unordered and without
retransmission (`ordered: false, maxRetransmits: 0`) has the same semantics as
a WebTransport datagram, so only the transport changes — not RTP media tracks,
which would mean rewriting codec, crypto and playout.

## Layering: logic apart from the port

Every voice implementation is split in two, so the next transport change is an
adapter, not a rewrite.

**Hub** (Wavvon-server `crates/hub`):

- *Voice relay core* — token binding to `(channel_id, pubkey)`, `sender_id`
  assignment, the `[sender_id:u16][packet_type:u8]` prefix, fan-out, whisper
  targets, permission and moderation checks, alliance visitors, roster. Knows
  nothing about QUIC or WebRTC.
- *Transport port* — the core sees a session as: an authenticated
  `(token → session)` accept, `send(bytes)`, a stream of inbound `bytes`, and
  `close(reason)`. Adapters implement it; the core never imports one.
- *Adapters* — `webrtc` (new) and `webtransport` (today's `voice_wt.rs`, kept
  only until step 5 below).

**Clients** (Wavvon-clients): the same seam. Desktop `crates/voice` keeps
capture, denoise, codec, crypto and playback; `transport.rs` becomes a trait
with a WebRTC implementation. Web keeps `voice.ts`, `voicePlayout.ts` and the
crypto in `packages/core`; the WebTransport session object is replaced by an
adapter with the same send/receive/close surface.

**SDKs**: same split, so each SDK's voice session is transport-agnostic and
only its adapter depends on a WebRTC library.

## WebRTC adapter

### Hub side

- Library: **str0m** (Rust, sans-IO, in production use). Sans-IO lets the hub
  run every voice peer on **one UDP socket** — the existing voice port
  (`WAVVON_VOICE_UDP_PORT`, default 3001) — demultiplexing by ICE credentials,
  so firewall guidance is unchanged.
- **ICE-lite** with a single host candidate (the advertise host and voice
  port). The hub has a public address, as today, so no STUN/TURN service is
  needed: clients dial out to it exactly as they do now. Browsers never send
  ICE checks to a loopback candidate, even on the same machine, so a hub
  configured as `localhost` (development, CI) also advertises the address it
  routes out of.
- The browser hands the data channel to its encode worker
  (transferable `RTCDataChannel`), so a busy main thread does not hold up
  packets; where the transfer is refused the main thread relays them.
- A client waiting for `voice_rtc_answer` must keep the other events that
  arrive meanwhile: a `voice_key_received` dropped there leaves it unable to
  open that speaker.
- DTLS uses a per-hub self-signed certificate whose fingerprint travels in the
  SDP. The WebTransport certificate rotation, `voice_cert_hash` and
  `voice_wt_url` go away.

### Signaling (main WebSocket)

1. Client sends `voice_join` (unchanged); the hub replies `voice_joined` with
   the single-use `voice_token` (unchanged, 30 s TTL).
2. Client creates an `RTCPeerConnection`, one data channel `voice`
   (`negotiated: true, id: 0, ordered: false, maxRetransmits: 0`), creates an
   offer and sends `voice_rtc_offer { token, sdp }`.
3. The hub consumes the token, binds the peer to `(channel_id, pubkey)` and
   replies `voice_rtc_answer { sdp }` carrying its ICE-lite candidate. No
   trickle from the client is needed: an ICE-lite peer learns the client's
   address from its connectivity checks.
4. Data channel open = session bound. Closing the peer connection = unbind;
   `voice_leave` stays authoritative for the roster, as today.

Alliance visitors run the same exchange over their voice-scoped session on the
**owning** hub ([alliances.md](alliances.md), "Voice in alliance channels").
The farm is untouched: clients still reach the node directly.

The new messages follow the wire discipline: `wire-format.md`, both client
mirrors, and the hub capability **`voice.webrtc`** in
`crates/hub/src/capabilities.rs`. Clients choose the WebRTC adapter by
capability, never by version.

### Packets

The data channel carries the v2 packets byte for byte: uplink
`[key_id:u32][ctr:u64][ts:u32][AES-256-GCM ciphertext+tag]`, downlink with the
relay prefix. DTLS under the data channel replaces QUIC's TLS as hop
encryption; the E2E AEAD still means the hub cannot listen.

## Libraries per platform

| Platform | Library |
|---|---|
| Hub, desktop, Rust SDK | str0m |
| Web | the browser's `RTCPeerConnection` |
| Go SDK | pion/webrtc |
| Python SDK | aiortc |
| JS SDK (Node) | werift (pure TypeScript) or node-datachannel |
| .NET SDK | SIPSorcery |
| Java SDK | webrtc-java (JNI over libwebrtc) — the weakest option; confirm data-channel support before committing |

## Sequence (keeps `develop` green)

The clients' live e2e builds the hub from server `develop`, so the switch is
staged; no release happens in between.

1. **Hub: relay core behind the transport port.** Pure refactor, WebTransport
   becomes the first adapter, no behaviour change, every voice test green.
2. **Hub: WebRTC adapter and signaling**, beside WebTransport; `voice.webrtc`
   advertised.
3. **Clients: web and desktop on the WebRTC adapter** when the capability is
   present.
4. **SDKs:** Rust, Go and Python move; JS, .NET and Java gain voice.
5. **Remove WebTransport** from hub and clients: adapter, certificate rotation,
   `/info` fields, the `wtransport` dependency. Wavvon-server#417 closes as
   superseded.

## Verification

Unit suites cannot show that audio arrives. Each step is proven with:

- the identity-crate voice vectors (unchanged, must stay green);
- the live voice specs that assert decoded media (P62–P65), not roster rows;
- the `voice-e2e` skill (two real browsers; audible, so ask first) and the
  desktop client driven in a real window;
- the `e2e-topology` alliance voice stage, with a visitor that is a true
  stranger on the owning hub.

## Not in scope

**Private calls** (DM and group calls with no hub channel) are what this port
makes possible: a peer-to-peer adapter where the callers' home hubs only carry
signaling. Designed separately — see [future-features.md](future-features.md).
