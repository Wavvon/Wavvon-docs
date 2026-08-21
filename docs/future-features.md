# Future features

**On the list to build, not yet designed.** The intent is settled; the
thinking is not. An entry graduates to [next-up.md](next-up.md) once it has a
design someone could execute from.

Designed work in flight lives in [next-up.md](next-up.md). Ideas we have not
committed to live in [wishlist.md](wishlist.md). Anything shipped is removed
from this file — see [shipped-log.md](shipped-log.md) for history.

> See also: [farm-model.md](farm-model.md) (multi-hub server layer),
> [gaming.md](gaming.md), [bots.md](bots.md),
> [alliances.md](alliances.md).

---

## Cross-farm certification relay

Both anti-spam layers are shipped — proof-of-work (`identity/src/pow.rs`) and
hub certification/reputation ([hub-certifications.md](hub-certifications.md),
incl. the auto-issuance sweep). What is undesigned is letting certifications
**propagate across the hubs a single farm operator manages**, so a member
vouched-for on one hub in the farm is not re-verified from scratch on the
next. No design work started.

## Farm multi-node data plane

The farm proxy only reaches farm-local hubs (`proxy.rs` hardcodes
`127.0.0.1`, `servers` has no host column; re-verified 2026-08-20), so
agent-hosted hubs on remote nodes are lifecycle-managed but unreachable
through the farm domain. ~3–4 days (2026-08-06 assessment): additive
`servers.host` + agent-advertised address in the WS `hello`, host-aware proxy
on both paths, agent passing the public host to spawned hubs so `/info`
advertises a correct `voice_wt_url` (voice stays direct QUIC to the node),
monitor driving remote hubs via heartbeats. No hub or client changes.

Here rather than in next-up because two design questions are open: private
networking farm↔nodes instead of farm↔node TLS, and per-node Postgres.
Sketch: [farm-impl.md](farm-impl.md).

## Voice in alliance channels

Alliance space-sharing covers any space type, recursively
([alliances.md](alliances.md), shipped 2026-07-05), but voice in a shared
channel needs a relay redesign. Also still open in that area: game
launch/lobby federation, and member discovery beyond invite tokens.

## Forum post federation across alliances

Forums are shipped ([forum.md](forum.md)) but hub-local: posts and replies do
not federate over alliance-shared channels. A natural part of the
space-sharing work above.

## Server tags — trust roots and transitivity

Self-tags, badges (issue/accept/decline/revoke), and cross-hub revocation
polling are shipped ([server-tags.md](server-tags.md)). Still deferred:
**user-configurable trust roots** (v1 uses existing hub relationships) and
**badge transitivity**.

## Multi-device — Android QR pairing

Multi-device pairing is shipped ([multi-device.md](multi-device.md)): master
+ subkey model, QR pairing on desktop/web, revocation propagation, identity
backup/restore. Remaining: **Android** only has the text/paste pairing flow;
the QR scan-and-offer UX has not been ported. Gated on Android returning to
scope at all ([android-rewrite-notes.md](android-rewrite-notes.md)).

## Passkey registration from desktop

Blocked by a Tauri webview RP ID mismatch. Undesigned because the way out is
a choice not yet made: a native WebAuthn plugin, or a system-browser handoff.

## Desktop parity backlog

Named custom themes, data-export archive compat, and LAN discovery UX (mDNS +
QR). The whisper gaps, the `SoundboardPlayed` chip,
`hub_updated`/`channels_updated`/`member_updated`, the duplicate
channel-appearance modal and paired-device E2E (pairing Mechanism A) all
closed 2026-08-08. Details in [client-parity.md](client-parity.md).

## Banner-channel management surface

A bannerless banner channel cannot be renamed or deleted from the web sidebar
— no gear, no context menu. Needs a small UX decision first
([client-parity.md](client-parity.md) tracked item 4).

## Project visibility push

Hosted demo hub, directory listings, launch post. Needed for adoption and for
the code-signing re-application ([code-signing.md](code-signing.md)). Not a
feature and not designed as a campaign.

## Hub-hosted identity vault — designed, build gated

The odd one out: this **has** a design ([identity-vault.md](identity-vault.md))
and so would belong in next-up by the usual rule, but the decision to build it
is deliberately deferred. **Do not build** until after the first external
pilot, when real identity-loss patterns can justify or kill the
hub-held-ciphertext trade-off (decisions.md, 2026-07-19). Kept here rather
than in the wishlist because the intent is not in doubt — only the evidence.

---

> Demand-gated tails of shipped features live in their own docs, not here:
> forum federation ([forum.md](forum.md) §9 deferred list), gaming/bots
> ([bot-capability-layer.md](bot-capability-layer.md) §10–§11), LAN
> federation ([lan-mode.md](lan-mode.md) §6), farm follow-ups
> ([farm-model.md](farm-model.md)).
