# Networked Voice — Design Note

> **Status:** Phase 1 (token-gated bind) SHIPPED — the VXRG flow in
> `hub/src/main.rs`. Phases 1.5 and 2 are **superseded** by
> [voice-transport-v2.md](voice-transport-v2.md) (2026-08-06):
> WebTransport replaces raw UDP (making the UDP-over-WS fallback moot)
> and E2E AEAD ships with the new transport. Written 2026-06-11 in
> response to audit finding H7 ([code-audit-2026-06-11.md](../code-audit-2026-06-11.md)).

For how voice works today (Opus, UDP relay, denoise pipeline), see
[voice.md](voice.md). For the federated/farm addressing context, see
[farm-server-architecture.md](farm-server-architecture.md).

## The problem (root cause)

The hub fabricates a loopback return address for every voice
participant, so voice only works when client and hub run on the same
machine.

- `hub/hub/src/routes/ws/handlers/voice.rs:127` registers each joining
  client as `127.0.0.1:{udp_port}` in both `voice_channels` and
  `voice_addr_map` (`hub/hub/src/state.rs:235-306`).
- The relay loop at `hub/hub/src/main.rs:769-832` looks up an inbound
  packet by its **real** source `SocketAddr` (never matches the loopback
  entries) and fans out audio **to** the loopback addresses (never
  reaches a remote client).
- The `udp_port` the client reports is also useless across NAT: the
  client's router rewrites the source port on the way out, so even the
  port the hub stored is wrong for anyone behind NAT.

Net effect: inbound never matches and outbound goes to nowhere for any
client not on the hub's own machine. This is why every test and dev
session — all localhost — has voice working, and why no networked
deployment ever has.

## Why the relay model is actually the easy case for NAT

Counter-intuitively, the hub-relay topology already solves the hard part
of NAT traversal. Every client opens an **outbound** UDP flow to the
hub's single public address. Outbound flows traverse consumer NAT —
including symmetric NAT — because the client's router creates a
return-path mapping for the hub's address automatically. Clients never
talk peer-to-peer, so there is no hairpinning problem and no need for
client-side STUN/TURN to discover peer addresses.

The only reachability requirement is that the **hub** is publicly
reachable on its UDP port — which is the operator's job (port-forward /
DDNS / cloud firewall rule; `--doctor` and the startup banner already
remind them about the UDP port). The hub simply has to *learn and trust*
the real source address each client's outbound flow arrives from,
instead of inventing `127.0.0.1`.

## Recommended fix — token-gated source-address learning (Phase 1)

Stop trusting any client-reported address. Learn the real address from
the first authenticated UDP packet.

1. On `voice_join`, the hub mints a random single-use **UDP register
   token** bound to `(channel_id, pubkey)` with a short TTL, and returns
   it in the `voice_joined` reply. `voice_joined` already travels over
   the authenticated, TLS-protected WebSocket, so the token is delivered
   confidentially to exactly the right session.
2. The client sends one tiny UDP **register packet** to the hub's voice
   port carrying that token (before/alongside its first audio packet).
3. The hub matches the token, binds `from_addr → (channel_id, pubkey)`
   in `voice_addr_map` using the packet's **real** source address, and
   consumes the token (single use).
4. From there the existing relay routing works unchanged — `voice_addr_map`
   now holds real addresses, so inbound lookups match and outbound audio
   reaches real clients. The `127.0.0.1` line is deleted.

**Hard invariant:** the relay never emits to an address that has not
completed an authenticated bind. This closes the spoofed-source
reflection/amplification vector — an attacker cannot get the hub to
blast audio at a victim address by forging a source, because no audio is
sent anywhere until a valid token arrives from that address.

### Alternatives considered (rejected for Phase 1)

- **Client-reported address** — NAT rewrites the source port (and often
  the IP), so the client cannot know its own public mapping. Wrong by
  construction.
- **STUN / TURN / full SFU** — heavier infrastructure. The farm
  architecture doc already scopes TURN as a deferred *server-side*
  concern, and screen-share v2 already carries WebRTC machinery if
  voice-over-WebRTC is ever wanted. Not needed to make the existing
  relay work for the common case.

## Phase 1.5 (deferred, optional)

For clients on networks that block UDP entirely, a UDP-over-WebSocket (or
TCP) last-resort relay, and/or an operator-run TURN-like fallback. Not
needed for the common case; deferred until there's demand.

## Phase 2 (separate initiative) — voice encryption

Layered on **after** networked voice works, with its own design doc and
a [decisions.md](decisions.md) entry.

- Per-packet AEAD (ChaCha20-Poly1305 or AES-GCM) over the Opus payload,
  with the nonce derived from the existing packet `sequence`/`timestamp`
  plus a per-session salt.
- Channel **sender-key** distribution over the authenticated WS, reusing
  the shipped E2E group sender-key machinery (see [identity.md](identity.md)
  / DM encryption); rotate the key on participant join/leave.
- The relay stays a cleartext-**header** forwarder (it reads sender id /
  packet type for routing) and never holds a usable content key — the
  hub operator cannot listen in, matching the DM privacy model.

## COMPARISON / docs changes — only after each phase ships

- After **Phase 1**: remove the "Voice is LAN/local only today" row from
  [COMPARISON.md](../COMPARISON.md) honest-limitations.
- After **Phase 2**: add an "E2E encrypted voice ✅" row and update the
  [threat-model.md](threat-model.md) "voice plaintext on the hub UDP
  relay" bullet.

## Phasing & effort

| Phase | Scope | Effort |
|---|---|---|
| **1** | Token-gated bind. Server: token in `voice_join`/`voice_joined`, pending-bind map with TTL in `AppState`, register-packet handling at the relay-loop head, delete the `127.0.0.1` line. Clients (desktop/web/android): send the register packet on join — no audio wire-format change. Docs: ws-protocol token field, COMPARISON row removal, voice.md update. No new deps/infra. | **M** |
| **1.5** | UDP-over-WS/TCP client fallback + optional server-side TURN. Deferred. | **L** |
| **2** | E2E voice encryption (own design doc + decisions entry). | **L** |

## Security summary

- **Slot hijacking / spoofed source** — prevented by the token-gated
  bind: no fan-out to an unbound address, token is single-use and
  short-TTL, delivered only over the authenticated WS.
- **Replay / amplification** — the no-emit-before-bind invariant means
  the relay can't be used as a reflector; per-packet AEAD in Phase 2
  also gives replay protection via the sequence-derived nonce.
- **Operator eavesdropping** — out of scope for Phase 1 (relay sees
  plaintext Opus, same as today); resolved by Phase 2.
