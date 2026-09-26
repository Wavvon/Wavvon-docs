# Gaming platform: rich apps

**Status: undesigned pillar.** This is a major future direction, not
pre-launch work. It is captured here so the near-term app work stays
forward-compatible with it.

> **History:** a heavy games-platform spec (the old `gaming.md`, ~1080
> lines, plus `games-sdk.md`) was **descoped and removed** on 2026-06-26
> (`d603ef1`), along with game routes in the OpenAPI + WS-protocol docs.
> This doc is a deliberately **light, app-centric reframing** — *not* a
> resurrection of that spec. The bet is that a rich-enough app runtime is
> the platform, so we don't need a separate games SDK.

> Gaming and apps are **one theme, not two.** A game on Wavvon is an
> app-driven interactive experience. So the way we "build the gaming
> platform" is by giving apps a rich enough runtime — audio, interactive
> UI, and video/media — the same surface a Telegram mini-app has. Once an
> app can do that, a game is an app that uses it.

## The idea

An app should be able to run *whatever it needs* inside Wavvon:

- **Interactive UI** — buttons, menus, and richer components in messages
  and in a launched panel, so an app can drive a turn-based flow, a poll,
  a shop, a game board, etc.
- **Audio** — inject sound into a voice channel (music, sfx, a game's
  audio).
- **Video / media** — present video or a live canvas (a game view, a
  stream) the way a screen-share does.

That capability set is the platform. "Games" are the headline use case;
the same surface powers quizzes, music players, watch-together, etc.

## Foundation already shipped

The app runtime already has real pieces to build on — see
[apps.md](apps.md):

- **A program is an ordinary identity**: slash commands, event
  subscriptions, incoming + outgoing webhooks, all under `apps.register`.
- **Interactive message components** (buttons/actions) and **mini-apps** —
  an app can launch a panel (`app_launch` / `app_open` / `app_close`
  events). This is the seed of the "game modal."

So the interactive-UI leg exists in embryo. The audio and video legs do
not yet.

## What's needed

Three of the six items this section used to list stopped being items when
the bot distinction went: audio and video injection are now just joining
voice and sharing a screen under the ordinary permissions, and the
message-level "Play" CTA is the launch card that ships today. What is left
is the part that was always the hard part:

1. **Fuller interactive runtime** — grow the mini-app + components model
   into a proper game-modal surface (state, per-user views, input events
   back to the app). **Undesigned.**
2. **Multiplayer session / lobby** — matchmaking, shared game state,
   turn/tick synchronization. Almost certainly app-owned state with the
   hub relaying, not hub-authored game logic. **Undesigned.**
3. **Distribution** — how a hub operator finds a game and how a game
   advertises itself. The public directory listing is designed
   ([invite-directory.md](invite-directory.md)); what a *game* specifically
   needs on top of an ordinary listing is not.

## Federation angle

For alliances/farms, "game launch/lobby federation across an alliance"
is explicitly out of scope today ([alliances.md](alliances.md), [mini-apps.md](mini-apps.md),
[apps.md](apps.md)). It stopped being a
backlog entry on 2026-09-14: nothing can federate a lobby that does not exist
single-hub, and item 4 above is undesigned. A game session is single-hub first; cross-hub multiplayer is
a later, harder problem tied to the [farm layer](farm-model.md).

## Sequencing

1. Design the **interactive game-modal runtime**.
2. Design **multiplayer session/lobby**.
3. Then **distribution** falls out.

No timeline. This pillar is deliberately after the [farm layer](farm-model.md).
