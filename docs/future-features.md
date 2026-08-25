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

## Alliance extras — member discovery, game launch/lobby federation

Two gaps left in the alliance area now that space-sharing (2026-07-05),
forum federation (2026-07-19) and the voice design (2026-08-22, in
[alliances.md](alliances.md)) are accounted for:

- **Member discovery beyond invite tokens** — no way to browse an alliance's
  membership; joining is still invite-driven.
- **Game launch / lobby federation across an alliance** —
  [gaming.md](gaming.md), [bot-capability-layer.md](bot-capability-layer.md).

## Multi-device — Android QR pairing

Multi-device pairing is shipped ([multi-device.md](multi-device.md)): master
+ subkey model, QR pairing on desktop/web, revocation propagation, identity
backup/restore. Remaining: **Android** only has the text/paste pairing flow;
the QR scan-and-offer UX has not been ported. Gated on Android returning to
scope at all ([android-rewrite-notes.md](android-rewrite-notes.md)).

## Passkey registration from desktop

Blocked by a Tauri webview RP ID mismatch. Undesigned because the way out is
a choice not yet made: a native WebAuthn plugin, or a system-browser handoff.
**Both options are native-shell work**, so this cannot be designed against the
current web-only delivery target — there is no web-viable subset (passkey
registration in a browser already works; the bug *is* the webview).

## Desktop parity backlog

Named custom themes, data-export archive compat, and LAN discovery UX (mDNS +
QR). The whisper gaps, the `SoundboardPlayed` chip,
`hub_updated`/`channels_updated`/`member_updated`, the duplicate
channel-appearance modal and paired-device E2E (pairing Mechanism A) all
closed 2026-08-08. Details in [client-parity.md](client-parity.md).
**Desktop-only by definition** — deferred with desktop itself, and coupled to
the Windows code-signing blocker in [next-up.md](next-up.md).

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
