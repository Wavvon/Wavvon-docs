# Future features

**On the list to build, not yet designed.** The intent is settled; the
thinking is not. An entry graduates to an **issue** once it has a design
someone could execute from.

This is the one work file left. Designed work and open bugs are issues on
[Wavvon-server](https://github.com/Wavvon/Wavvon-server/issues) and
[Wavvon-clients](https://github.com/Wavvon/Wavvon-clients/issues); ideas we
have not committed to are [Ideas
discussions](https://github.com/Wavvon/Wavvon-docs/discussions/categories/ideas).
It stays a file because most of what is below is not one piece of work — see
[decisions.md](decisions.md). Anything shipped is removed from here — see
[shipped-log.md](shipped-log.md) for history.

Three entries that were single, nameable pieces of work became `help wanted`
issues on 2026-09-16 and are no longer described here: alliance member
discovery, Android QR pairing, and passkey registration from desktop. What
stays below is what is not one piece of work — a set of small questions, a
backlog, or project work rather than a feature.

> See also: [farm-model.md](farm-model.md) (multi-hub server layer),
> [gaming.md](gaming.md), [apps.md](apps.md),
> [alliances.md](alliances.md).

---

## Admission for a program that cannot solve a puzzle

With `challenge_mode` set to anything but `off`, `/auth/verify` wants a
`challenge_token`, and that token is minted by clicking a button or reading an
SVG. A program can do neither — the puzzle asks "are you a person" and the
honest answer is no. The bot fork used to walk past the gate by declaring
itself; that is exactly what was deleted ([decisions.md](decisions.md), "A bot
is a client like any other"), and bringing back any version of *the caller
declares itself exempt* recreates the hole.

So the question is not how a program skips the check. It is **who grants the
exemption, what it is bound to, and how it is taken away.**

Two things shape the answer and are worth settling first:

- **The gate is not at admission.** It runs on every `/auth/verify`, after
  roles are assigned, with no "is this a stranger" condition — unlike the
  invite gate a few lines above it. So a member who joined last year solves a
  puzzle at every login, a second device solves one at pairing, and a one-shot
  exemption would not survive to the next session.
- **Membership and permissions are the same number.** `builtin-everyone` is a
  role row rather than a floor, and zero roles is how the hub spells "not a
  member" — in `DELETE /me`, in a ban, in recovery and in the farm-token
  check. Until membership has its own field
  ([Wavvon-server#58](https://github.com/Wavvon/Wavvon-server/issues/58)),
  "admit it with nothing" means "admit it as a permanent stranger".

The direction being weighed is a **pubkey-bound invite**
([Wavvon-server#31](https://github.com/Wavvon/Wavvon-server/issues/31)): an
invite only one identity can redeem, where the binding *is* the exemption. A
leaked code is worthless without the private key, and the admin minting it has
already said "this exact key gets in", which is a stronger statement than any
puzzle result. A config allowlist of exempt pubkeys is the fallback for
bootstrap, when no owner exists yet to mint anything — a public key in a
config file grants nothing to whoever reads it.

Explicitly not the answer: a global "programs skip challenges" switch, a
`skip_challenge` field on the verify request, or a second admission endpoint
for machines. Proof of work is already a machine-answerable wall
(`min_pow_level`), so a PoW challenge adds nothing the hub cannot already do.

Whatever is built, drive a real unattended client through it end to end: the
per-IP auth limiter costs two requests per login, and a retrying program hits
429 long before anyone suspects the rate limit.

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

## Desktop parity backlog

Named custom themes and LAN discovery UX (mDNS + QR). The measured list of
controls that reach only one client lives in
`clients/scripts/parity-baseline.json`, which is the one CI enforces. The whisper gaps, the `SoundboardPlayed` chip,
`hub_updated`/`channels_updated`/`member_updated`, the duplicate
channel-appearance modal and paired-device E2E (pairing Mechanism A) all
closed 2026-08-08. Details in [client-parity.md](client-parity.md).
**Desktop-only by definition** — deferred with desktop itself, and coupled to
the Windows code-signing blocker, which is an issue on
[Wavvon-clients](https://github.com/Wavvon/Wavvon-clients/issues).

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
> ([apps.md](apps.md) §10–§11), LAN
> federation ([lan-mode.md](lan-mode.md) §6), farm follow-ups
> ([farm-model.md](farm-model.md)).

**Game launch / lobby federation across an alliance used to sit here and does
not belong** (removed 2026-09-14). Games arrive as bots, and three docs
already rule cross-hub sessions out: a mini-app session is scoped to one hub
and one channel ([mini-apps.md](mini-apps.md)), alliance game sessions
are out of scope ([apps.md](apps.md) §9), and
a game session is single-hub first ([gaming.md](gaming.md)). Underneath that,
the multiplayer lobby does not exist single-hub either — it is `gaming.md`
item 4, undesigned — so federating it was a plan for the tail of something
unbuilt. The one cross-hub idea with substance is **game-bot recommendation
over an alliance**, and it is already filed deferred-until-demand in
[apps.md](apps.md) §11.
