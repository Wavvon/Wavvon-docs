# Mini-apps

A generic mechanism for an app to embed an interactive web experience —
drawing games, shared whiteboards, trivia timers, anything — directly
inside a Wavvon channel, without adding game-specific logic to the hub.

## Motivation

The games feature (now removed) tried to host game logic and state in
the hub. That made the hub the bottleneck for every new game type and
created a maintenance surface the core team can't scale. Apps already
provide a clean out-of-process extension point for channel behaviour;
mini-apps extend that to arbitrary interactive UIs.

The reference use case is a Gartic Phone-style drawing game: players
take turns drawing a prompt while others guess in real time. This
requires a shared canvas, per-round state, and sub-100ms stroke relay —
none of which belong in the hub.

## Model

An app declares a `mini_app_url` in its registration. When the app (or
a user command) starts a session, the app sends an
`app_launch` WS message to the channel. The client renders a
**launch card** with a button. Clicking it opens the mini-app URL in a
sandboxed webview inside the Wavvon client window.

The hub injects auth context into the webview at load time — the same
pattern used when the hub self-serves the web client:

```
window.__WAVVON_HUB__     = "https://hub.example.com"
window.__WAVVON_TOKEN__   = "<scoped-session-token>"
window.__WAVVON_CHANNEL__ = "<channel-id>"
window.__WAVVON_APP_ID__  = "<app-pubkey>"
```

The mini-app connects to the hub's existing `/ws` endpoint using
`__WAVVON_TOKEN__` and exchanges messages with the app (and with other
mini-app instances in the same channel) through the normal WS relay.
**The hub sees only ordinary WS messages — it has no concept of
canvas, game state, or drawing strokes.**

The relay envelope (shipped 2026-07-19) is `mini_app_message`:
`{ type: "mini_app_message", app_id, channel_id, payload, to_pubkey? }`.
`payload` is an opaque JSON-encoded string the hub never inspects. From
a mini-app session, the hub forwards it to every active WS session of
`app_id`, tagged with the sender's `from_pubkey`; from the app,
`to_pubkey` selects which joined player's mini-app session receives it
(no channel-wide broadcast surface). Reference use: the tic-tac-toe
demo (deleted 2026-09-26 with the bot subsystem).

```
[Player A mini-app] ──WS──▶ hub ──WS──▶ [app server]
                                    └──WS──▶ [Player B mini-app]
```

## Scoped session token

The hub mints a short-lived token at mini-app open time:

- Bound to one channel and one app ID
- Cannot call admin or federation endpoints
- Expires with the underlying user session or after a fixed TTL (e.g.
  4 hours), whichever is first
- Revocable: the app can end the session to
  end a game session

The token is delivered to the client via the `app_open` WS reply
(see below); the client injects it into the webview — it never touches
a URL query string.

## New hub surface (minimal)

### Registration field

```json
{ "mini_app_url": "https://gartic.example.com/wavvon" }
```

Optional. An app that declares none behaves exactly as before.

### New WS message types

**App → hub → clients** (`app_launch`):
```json
{
  "type": "app_launch",
  "app_id": "<pubkey>",
  "title": "Gartic Phone",
  "description": "A drawing + guessing game. Up to 8 players.",
  "channel_id": "<id>"
}
```

Client renders this as a launch card in the channel. Users who click
"Join" trigger:

**Client → hub → app** (`app_join`):
```json
{
  "type": "app_join",
  "app_id": "<pubkey>",
  "channel_id": "<id>"
}
```

**Hub → client** (`app_open`):
```json
{
  "type": "app_open",
  "mini_app_url": "https://gartic.example.com/wavvon",
  "session_token": "<scoped-token>",
  "channel_id": "<id>",
  "app_id": "<pubkey>"
}
```

The client opens the webview and injects the context variables.

**App → hub → clients** (`app_close`):
```json
{ "type": "app_close", "app_id": "<pubkey>", "channel_id": "<id>" }
```

Clients dismiss the launch card and close any open webviews for this
session.

## Client changes

### Desktop (Tauri)

Tauri already hosts a WebView2 (Windows) / WKWebView (macOS) window.
Open a second `WebviewWindow` for the mini-app, sandboxed with:

- `csp`: strict — no external script sources; mini-apps must be
  self-contained or served from their own domain
- `devtools`: operator/debug flag only
- No access to Tauri commands — the mini-app communicates only via the
  hub WS, never via `invoke()`

### Web

Open the mini-app in a sandboxed `<iframe>` within the channel layout
(Discord's approach). CSP `sandbox` attribute: `allow-scripts
allow-same-origin`. The host page communicates the auth context via
`postMessage` before the iframe loads, so the token never appears in
the URL.

### Android

Same as desktop: a secondary `WebviewWindow` via Tauri Android.

## App author experience

An app author ships two things:

1. **A process** — connects to the hub WS as any client does,
   manages game state, sends `app_launch` / `app_close`, and
   relays or transforms canvas messages between players.

2. **A mini-app** — a self-contained web app (HTML + JS + CSS) that
   renders the game UI. It connects to the hub WS using the injected
   token and channel, sends/receives typed JSON messages, and draws on
   a `<canvas>` element.

The hub is invisible to the game author beyond being a WebSocket relay.
There is no SDK required; the WS protocol is plain JSON as documented
in `ws-protocol.md`.

## Example: Gartic Phone

```
1. The app detects !gartic in chat → sends app_launch
2. Players click Join → hub mints tokens → clients open webview
3. The app picks a prompt, sends { type: "round_start", drawer: "<id>", prompt: "..." }
   (prompt delivered privately to the drawer's mini-app via a DM or
    a mini-app message the app relays only to that client)
4. Drawer's mini-app sends stroke events:
   { type: "stroke", points: [[x,y],...], color: "#f00", width: 3 }
   The app fans these out to all other mini-app sessions in the channel
5. Guessers type in the mini-app → the app checks guesses, sends score_update
6. Round ends → the app sends round_end, resets canvas via clear_canvas message
```

Latency: client → hub WS → app → hub WS → clients. On a co-located
app this is ~10–30ms RTT — acceptable for drawing. For a hosted app
with a geographically distant hub, stroke events may feel laggy; that
is a deployment concern for whoever runs the app, not a hub concern.

## Example: shared whiteboard

Simpler than Gartic Phone: no game state, no turns. The app just fans
every stroke event out to all channel members. Bot process could be a
~50-line Node.js script; the mini-app is a plain HTML canvas. No hub
changes needed beyond the mini-app registration.

## What we are not doing

- **Native canvas protocol in the hub** — the hub will not gain stroke
  types, canvas state, or any drawing primitives. All of that lives in
  the mini-app and the app server.
- **Hub-hosted mini-apps** — mini-apps are served from the app author's
  own infrastructure. The hub does not proxy or host mini-app assets.
- **Cross-hub mini-app sessions** — a mini-app session is scoped to one
  hub and one channel. Federation of interactive sessions is deferred.
- **Persistent mini-app state in the hub** — if the app wants to
  persist game history it uses its own database. The hub stores nothing
  on behalf of the mini-app.

## Open questions

- **Token delivery on web** — `postMessage` from parent frame is the
  natural channel, but requires the mini-app origin to be allow-listed
  or the message validated. Needs a small handshake spec.
- **Mini-app URL allow-listing** — should hub operators restrict which
  `mini_app_url` domains are permitted? A per-hub allow-list in
  `hub.toml` seems right; default open.
- **Multiple simultaneous sessions** — can two different apps have
  active mini-app sessions in the same channel? Probably yes, but the
  client UI for stacking launch cards needs thought.
- **Mobile keyboard + canvas** — soft keyboard covers the canvas on
  Android when guessing. Needs layout handling in the mini-app (app
  author's problem, but we should document it).

## Estimate

Hub (token minting + 3 new WS message types): ~2 days.
Desktop client (WebviewWindow + context injection): ~1.5 days.
Web client (sandboxed iframe + postMessage): ~1 day.
Android client: ~0.5 days (mirrors desktop Tauri pattern).
Docs + a worked example: ~1 day.

**Total: ~6 days.**
