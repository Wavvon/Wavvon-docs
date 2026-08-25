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

## One client per device, via `web+wavvon:`

An invite link is `https://hub.example/join/<code>`, and the hub serves its own
copy of the web client from its own origin. A user who clicks it lands somewhere
their identity does not exist and is invited to create a second one — the
per-origin storage boundary showing through as "I lost my account". Nothing a
page can do fixes it (see the 2026-08-25 entry in
[decisions.md](decisions.md) for the dead ends: cookies, partitioned iframes,
file reads).

`navigator.registerProtocolHandler("web+wavvon", "/open?target=%s")` does. A
client the user registers once becomes the device-wide handler for every Wavvon
deep link, whatever origin it is served from: the landing page on
`hub.example` offers *"Open in my client"* → `web+wavvon://join?hub=…&code=…`,
the browser hands it to the registered page, which already holds the identity
and the hub list, and adds the hub from there. The invite link itself stays a
plain `https://` URL so it is still shareable and still works for someone with
no client at all.

What is not settled: **Safari does not implement it**, so the fallback has to
carry that share of users — a "paste your client's address" field, remembered
in the landing hub's own `localStorage` so it only has to be answered once per
hub. A page also cannot detect whether a handler is registered, so both paths
are always on screen. And the registration prompt has to be asked for at a
moment the user understands, which is a UX question, not an API one.

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
