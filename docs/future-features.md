# Future Features

Work that's still **undesigned** or has a genuinely open remainder
beyond the current delivery scope. Ordered roughly by strategic
priority. Anything **designed and queued** lives in the
[ROADMAP](../ROADMAP.md) wishlist, not here; anything **shipped** is
removed from this file (see [shipped-log.md](shipped-log.md) or the
linked canonical doc for history).

> See also: [farm-model.md](farm-model.md) (multi-hub server layer),
> [gaming.md](gaming.md) (gaming + rich-bot platform),
> [bots.md](bots.md), [alliances.md](alliances.md).

---

## 1. Farm layer — the big architectural step

**This is the major next change.** The farm is the multi-hub control
plane: one operator runs many hubs behind one domain, with lifecycle
(spawn / monitor / stop), reverse-proxy routing, farm-level SSO, and
`agent` worker nodes that reverse-connect to the farm. Canonical design
+ current state: [farm-model.md](farm-model.md) / `farm-impl.md`
(partially implemented).

Everything else "big" hangs off this:
- **Invites are already farm-ready** — `wavvon://<host>/i/<hubSerial>/<code>`
  carries the hub serial so a farm can route the same domain to
  different hubs by serial (shipped 2026-07-05).
- Cross-farm cert relay (below) and cross-hub gaming assume the farm
  exists.

**Status:** partially implemented; the routing + lifecycle work is the
headline remaining effort.

---

## 2. Cross-farm certification relay

**Follows the farm layer.** Both anti-spam layers are shipped —
proof-of-work (`identity/src/pow.rs`) and hub certification/reputation
([hub-certifications.md](hub-certifications.md), incl. the auto-issuance
sweep). What's undesigned is letting certifications **propagate across
the hubs a single farm operator manages**, so a member vouched-for on
one hub in the farm isn't re-verified from scratch on the next. No
design work started; depends on §1.

---

## 3. Gaming platform + rich bots (one theme)

Games on Wavvon are **bot-driven interactive experiences**, so building
"the gaming platform" means giving bots a Telegram-mini-app-class
runtime — **interactive UI (buttons/components), audio, and
video/media**. Once bots can run whatever they need, games fall out.

Full writeup: [gaming.md](gaming.md). The building blocks (all tracked
in [bots.md](bots.md)'s deferred list):

- **Bot audio injection** — *designed* ([soundboard.md](soundboard.md)
  §2, `can_speak_voice`); smallest first step.
- **Bot video / canvas injection** — undesigned.
- **Fuller interactive game-modal runtime** — grow the shipped bot
  mini-app + message-component seed into stateful, per-user game views.
- **Multiplayer session / lobby** — matchmaking + shared state; bot-owned,
  hub-relayed. Undesigned.
- **Bot DMs** — bots as DM participants (needs a friend-graph rethink).
- **Game distribution** — discovery/advertising of game-bots.

No timeline; deliberately after §1.

---

## 4. Alliance space-sharing — any space, including sub-spaces

**Implemented (v2, 2026-07-05).** Alliance sharing now covers **any
space type** — banner, channel, category, forum — and **recursively**
shares a space *with its sub-spaces* (sharing a category shares the tree
beneath it, with live semantics). Canonical doc:
[alliances.md](alliances.md) ("Recursive space sharing"); rationale in
[decisions.md](decisions.md) (2026-07-05).

Still future in this area: voice in alliance channels (relay redesign),
forum post federation (posts stay hub-local — see §5), game launch/lobby
federation, member discovery beyond invite tokens.

---

## 5. Forum post federation across alliances

Forums are shipped ([forum.md](forum.md)) but hub-local: posts/replies
don't federate over alliance-shared channels. Undesigned; a natural part
of the §4 space-sharing work.

---

## 6. Live captions in voice

Client-side speech-to-text (whisper.cpp-class local models) rendering
live captions — an accessibility differentiator that keeps the
no-telemetry stance (audio never leaves the client). **Undesigned and
desktop-era** — too heavy for the web client, the current delivery
target. Parked until desktop is back in scope. See
[accessibility.md](accessibility.md).

---

## 7. Server tags — remaining bits

Self-tags, badges (issue/accept/decline/revoke), and cross-hub
revocation polling are shipped ([server-tags.md](server-tags.md)). Still
deferred: **user-configurable trust roots** (v1 uses existing hub
relationships) and **badge transitivity**.

---

## 8. Multi-device — Android QR pairing

Multi-device pairing is shipped ([multi-device.md](multi-device.md)):
master + subkey model, QR pairing on desktop/web, revocation propagation,
identity backup/restore. Remaining: **Android** only has the text/paste
pairing flow; the QR scan-and-offer UX hasn't been ported.

---

## 9. OAuth social-verification badges — SUPERSEDED

**Resolved: replaced by community achievement badges (shipped 2026-07-05).**

The OAuth idea had an unanswerable-without-a-central-authority core (who
verifies the token, how does a badge travel cross-hub without a blessed
service). **Community badges answer the same goal the federated way:** a
hub grants a user a named badge, signed by the hub's pubkey, carried in
the user's portfolio, verified offline, curated by the user — no central
authority, no external provider. See
[hub-certifications.md](hub-certifications.md) "Achievement badges."

OAuth-provider linking (GitHub/Steam/X) could still layer on *later* as
one more badge issuer, but only if there's real demand — it's no longer
on the critical path.
