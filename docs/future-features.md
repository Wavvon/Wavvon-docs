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

## Leaving a hub asks first, and the hub gets a word in

**Every** leave gets a confirmation, not only the ones that cost something. A
mis-click currently removes a hub outright — `handleRemoveHub`
(`clients/apps/web/src/hooks/useHubLifecycle.ts`) drops it with no question —
and rejoining an invite-only hub is not something the user can do alone.

Two layers on top of that plain confirmation:

**1. Say so when it is a home hub.** The code has no idea whether it is, and it
usually is: the first hub an account signs in to becomes one automatically
([home-hub.md](home-hub.md)). That matters more since 2026-08-30, when DMs
started being read from the home hub rather than from whichever hub is on
screen. Removing a home hub locally does **not** edit the signed designation,
so senders keep delivering there — to a hub this client no longer has a session
for. The inbox goes quiet and nothing says why, which is the invisible-DM
failure that fix was for, arrived at from the other direction. Prefs, device
certs and the designation itself live there too. The dialog should say which of
those the user is walking away from, and point at Settings → Manage accounts →
Home hubs, where the list is actually edited.

**2. Let the hub add its own message.** A farewell, a "you can come back with
this invite", a link to the community's rules — operator-written, shown in the
confirmation. Same shape as `welcome_label`: a `hub_settings` key, served on
`/info` so a client can render it without a session, edited in hub admin.

Design questions, none of them obvious:

- **What the dialog offers.** Cancel / leave anyway / edit the home hub list
  first — and whether leaving can re-sign the designation itself, which needs
  the master key (a paired device cannot).
- **The last entry.** An account whose home hub list is empty has nowhere for
  its personal state to live. Refuse, warn harder, or allow it and say plainly
  what stops working?
- **The hub's message is not ours.** It is operator-written text shown at the
  moment someone is leaving, which is exactly when a hub has an incentive to
  mislead ("you will lose your messages"). Render it as mediated — attributed
  to the hub, visually secondary to the app's own words, never styled as a
  warning the client is making. Same discipline as a badge's issuer or an
  alliance visitor's hub-vouched name. Plain text, length-capped, no markup;
  `welcome_label` is the precedent to copy, including how it is sanitised.
- **One language.** The operator writes it once; the surrounding dialog is
  translated. A mixed-language dialog is the honest outcome and worth stating.
- **Where else this fires.** Account switch, and the desktop client, which
  carries its own copy of the flow.

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

## Downloadable language packs — gated on desktop delivery

The clients ship four languages (en/it/es/de), all four compiled into the
bundle. The intent is that a fifth, tenth or twentieth language does not make
everybody carry the other nineteen — and eventually that a translator can
publish one without waiting for a release.

**Deliberately not started, and the reason is a measurement.** Two real builds
of `apps/web` on 2026-08-29, identical but for the catalogues:

| bundle JS | raw | gzip | brotli |
|---|---|---|---|
| 4 languages | 2,188,344 | 682,745 | 541,570 |
| `en` only | 1,921,956 | 607,405 | 496,809 |
| difference | 266,388 | 75,340 | **44,761** |

So the three unused catalogues cost **44.7 KB brotli, 8% of the bundle** —
roughly **15 KB brotli per language**, far less than the ~25 KB each weighs
alone, because the 1,336 keys are identical across catalogues and compress
away. At four languages that is not worth a change. At ten it is 135 KB, at
twenty 285 KB. **The trigger is the fifth language, not a date.**

Two separate things, worth keeping separate when this is designed:

- **Load one catalogue instead of four.** A one-line change, available any
  time: `initI18n` already receives the language before the app mounts
  (`apps/web/src/main.tsx`), so ``await import(`./${lng}.json`)`` makes Vite emit
  a chunk per language. No new concepts.
- **Let somebody publish a pack we did not ship.** This is the actual feature,
  and it is a plugin system: a place to host packs, a signature (UI strings are
  UI — a hostile pack rewrites a screen into "type your recovery phrase here",
  and the whole identity model rests on that phrase), and a staleness story for
  when keys change under a pack nobody updated. `check-coverage` cannot see any
  of it.

**Letting each hub choose which languages it serves** is an option on the
table, and mostly it is already free rather than a feature: a hub serves the
client from a directory the operator owns (`WAVVON_WEB_CLIENT_DIR`), so once
catalogues are separate chunks, deleting the unwanted ones *is* the control. A
hub *setting* would add a capability string and wire surface to do what `rm`
does. Two things have to be true first, and neither is today: the language list
must derive from what actually shipped instead of the hardcoded
`supportedLangs` array duplicated in web and desktop `main.tsx`, or the
switcher offers a language whose chunk is missing; and the multi-hub coupling
has to be faced — the client served by hub A talks to hubs B and C, so
"the hub decides" means whichever hub you *loaded from* decides, and an Italian
user landing on a German operator's hub silently falls back to English.

**Gated on desktop delivery** (2026-08-29 decision). Web is the only delivery
target today, and a downloaded-and-installed pack is a desktop shape — on web
the same benefit is the one-line dynamic import above.

Ruled out while looking at this: **putting the language in the URL** the way
Microsoft Learn does (`/it-it/…`). That works because a docs page is a
prebuilt document per locale on a CDN, indexed separately by search. Our
client is one SPA served by every hub with an SPA fallback, so `/it` and `/ru`
return identical bytes unless each hub carries N builds and the Rust hub
learns the language list. The path is also already spoken for — `/join/{code}`,
`/adopt`, `/hub/{slug}` — so a language segment would ride along on shared
invite links and open in the *sender's* language.

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
