# Gaming platform + rich bots

**Status: undesigned pillar.** This is a major future direction, not
pre-launch work. It is captured here so the near-term bot work stays
forward-compatible with it.

> **History:** a heavy games-platform spec (the old `gaming.md`, ~1080
> lines, plus `games-sdk.md`) was **descoped and removed** on 2026-06-26
> (`d603ef1`), along with game routes in the OpenAPI + WS-protocol docs.
> This doc is a deliberately **light, bot-centric reframing** — *not* a
> resurrection of that spec. The bet is that a rich-enough bot runtime is
> the platform, so we don't need a separate games SDK.

> Gaming and bots are **one theme, not two.** A game on Wavvon is a
> bot-driven interactive experience. So the way we "build the gaming
> platform" is by giving bots a rich enough runtime — audio, interactive
> UI, and video/media — the same capability surface a Telegram bot /
> mini-app has. Once bots can do that, games are just bots that use it.

## The idea

A bot should be able to run *whatever it needs* inside Wavvon:

- **Interactive UI** — buttons, menus, and richer components in messages
  and in a launched panel, so a bot can drive a turn-based flow, a poll,
  a shop, a game board, etc.
- **Audio** — inject sound into a voice channel (music, sfx, a game's
  audio).
- **Video / media** — present video or a live canvas (a game view, a
  stream) the way a screen-share does.

That capability set is the platform. "Games" are the headline use case;
the same surface powers quizzes, music bots, watch-together, etc.

## Foundation already shipped

The bot runtime already has real pieces to build on — see
[bots.md](bots.md):

- **Bots as first-class identities**, invite-by-pubkey, slash commands,
  event subscriptions, incoming + outgoing webhooks.
- **Interactive message components** (buttons/actions) and **bot
  mini-apps** — a bot can launch a panel (`bot_app_launch` /
  `bot_app_open` / `bot_app_close` events; `activeBotApps` on the
  client). This is the seed of the "game modal."

So the interactive-UI leg exists in embryo. The audio and video legs do
not yet.

## What's needed (the deferred bot capabilities → the platform)

These are the same items tracked in [bots.md](bots.md)'s deferred list;
they *are* the gaming platform's building blocks:

1. **Bot audio injection** — *designed* ([soundboard.md](soundboard.md)
   §2): a bot joins the existing WS voice relay as a first-class
   participant gated on `can_speak_voice`. Ship this and bots can play
   audio.
2. **Bot video / canvas injection** — *undesigned*: the equivalent for
   the video/screen-share path, so a bot can present a game view.
3. **Fuller interactive runtime** — grow the mini-app + components model
   into a proper game-modal surface (state, per-user views, input
   events back to the bot).
4. **Multiplayer session / lobby** — matchmaking, shared game state,
   turn/tick synchronization. Almost certainly bot-owned state with the
   hub relaying, not hub-authored game logic. **Undesigned.**
5. **Bot-launched game modals** — the message-level "Play" CTA that
   opens the game modal. Blocked on (3) + (4).
6. **Distribution** — how a hub operator discovers/adds a game-bot, and
   how a game-bot advertises itself. Overlaps the bot directory
   ([bots.md](bots.md) §4). **Undesigned.**

## Federation angle

For alliances/farms, "game launch/lobby federation across an alliance"
is explicitly out of scope today (see [alliances.md](alliances.md) "What's
not done"). A game session is single-hub first; cross-hub multiplayer is
a later, harder problem tied to the [farm layer](farm-model.md).

## Sequencing

1. Ship **bot audio injection** (already designed) — smallest step,
   immediately useful (music/sfx bots).
2. Design **bot video/canvas injection** + the **interactive game-modal
   runtime**.
3. Design **multiplayer session/lobby**.
4. Then **game distribution** and **bot-launched modals** fall out.

No timeline. This pillar is deliberately after the [farm layer](farm-model.md).
