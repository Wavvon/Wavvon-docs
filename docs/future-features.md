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

- **Member discovery beyond invite tokens** — *people*, not hubs. The member
  **hubs** are already browsable: `GET /alliances/{id}` returns each one's
  pubkey, name and URL, and the client lists them. What has no surface at all
  is the people on them — nothing federates a user list, so meeting someone on
  an allied hub still means an invite token or already knowing they are there.
  Worth saying because the two read the same in a sentence and only one is
  missing.
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

## Hub menu — entries the reference clients have and this one does not

The gesture and the menu are both built: the chevron beside the hub name and a
right-click on the hub header open the same list — invite people, hub settings,
create channel, a notifications submenu, hide silenced channels, mark all as
read, and remove-from-this-device — with the admin-only entries gated on
permission. They render from one component since 2026-09-05, so an entry added
here appears under both gestures and cannot drift (they already had: same
items, different order).

What is left is which entries to add at all, each its own small question rather
than a given:

- **Mute with a duration** (15 min / 1 h / until tomorrow) — today notification
  mode is a permanent choice. The mechanism it needs now exists: presence
  stores an absolute `until` beside the status and applies it on load
  (`packages/ui/src/utils/presenceExpiry.ts`, 2026-09-05), so a timed mute is
  that shape pointed at `hubNotifyMode` rather than a new one. Copy the
  deadline, not the timer — a timer alone is what made timed presence
  permanent across a reload. What is left is where it lives: notify mode is
  per hub *and* per channel, so an expiry per entry is a different storage
  question from presence's one per user.
- **Create category** and **create event** — both exist elsewhere in the UI;
  the question is only whether the hub menu is a second door to them.
- **Per-hub profile** — Wavvon has hub profiles already
  ([client-parity.md](client-parity.md)); this would be a shortcut into the
  editor for the hub under the cursor.
- **Show all channels** — meaningful only once there is something hiding
  channels beyond `hide_silenced`.
- **Copy hub address** — the equivalent of "copy server ID" is the hub's URL or
  its pubkey, and which one to copy depends on what the person is about to
  paste it into. Both, labelled, is the likely answer.

None of it is blocking. Adding one is now a single edit in `HubMenuItems`
rather than two that have to agree.

## Actually leaving a hub — the feature the button implied

Split out of the leave-confirmation work on 2026-09-05 (decisions.md, "Leave
hub does not leave"), which found that **no such feature exists**: the router
has `/bots/{id}/voice/leave` and `/alliances/{id}/leave` and nothing for a
person leaving a hub. `removeHub` only forgets the hub on this device, so
someone who has joined a community stays in its roster, keeps their roles and
stays a deliverable DM recipient — with no way to change that themselves.

The confirmation work makes this **visible** rather than fixing it: the control
now says what it does. What it does not do is give anyone a way out, and for a
project whose pitch is that you own your identity, "you cannot remove yourself
from a community you joined" is a gap worth naming.

Undesigned because the questions are not the dialog's:

- **What happens to what they wrote.** Messages are the community's record and
  the author's words at once. Tombstone the author and keep the text, delete
  both, or let the leaver choose? Each is a different promise, and moderation
  history (bans reference a pubkey) has to survive whichever wins.
- **Can an operator refuse?** A ban is the hub removing a person; leaving is the
  person removing themselves. If those meet — someone leaving to dodge a
  pending report — the ban list must still work afterwards.
- **Is it federated?** Alliance-visible membership and cross-hub DM routing both
  read the roster. A departure that one side of an alliance knows about and the
  other does not is the drift class this project keeps finding.
- **And rejoining.** Today it is free, because the invite gate is
  `has_roles == 0` and every member has `builtin-everyone`. An actual leave
  presumably drops the roles, which silently re-arms the invite gate — so
  leaving an invite-only hub would become one-way. That may be right; it should
  be chosen rather than inherited.
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

---

> Demand-gated tails of shipped features live in their own docs, not here:
> forum federation ([forum.md](forum.md) §9 deferred list), gaming/bots
> ([bot-capability-layer.md](bot-capability-layer.md) §10–§11), LAN
> federation ([lan-mode.md](lan-mode.md) §6), farm follow-ups
> ([farm-model.md](farm-model.md)).
