# Design Decisions

Why Voxply is shaped the way it is. Each entry: the decision, the
alternative we considered, and why we chose this. New decisions go at
the top.

## Screen share v1: hub-relayed WebSocket chunks, not WebRTC P2P

**Decision**: ship screen share as WebM chunks (`MediaRecorder`,
VP8/Opus) sent over the existing chat WebSocket. The hub broadcasts
each chunk to channel subscribers. Viewers buffer into a
`MediaSource`. Full design in
[`docs/screen-share.md`](screen-share.md).

**Alternative considered**: WebRTC peer-to-peer from the start, with
the hub as SDP/ICE signaler. Direct sharer→viewer media, hub carries
no video bytes.

**Tradeoff**: WebRTC is the right long-term shape — lower latency
(~100 ms vs 300–500 ms), higher quality, and zero hub egress for
media. It costs an entirely new protocol stack (peer connection
lifecycle, ICE/STUN/TURN configuration, NAT traversal, per-viewer
uploads on the sharer), none of which Voxply currently exercises.
The hub-relayed path reuses the existing typed WS envelope channel
(`server/voxply-hub/src/routes/chat_models.rs` line 175), the
existing subscriber broadcast logic, and the existing identity/role
permission machinery. Net cost is a handful of new envelope variants
plus a per-channel `ActiveShare` map. The hub egress ceiling
(N × ~2.6 Mbps per viewer) is the obvious scaling pain — and is
exactly what triggers the v2 migration to WebRTC once it bites.
Building v1 first also lets the UI surface (source picker, viewer
layout, permission gate, webcam-as-second-stream) ship and bake
without coupling it to the transport rewrite.

**Webcam**: same infrastructure, second stream ID. Can be deferred
to v2-of-the-feature at implementation time; the protocol already
allows it.

**Supersedes**: the ROADMAP wishlist entry "Screen share — WebRTC or
similar" implied WebRTC as the obvious choice. This decision says
the obvious choice is the eventual one, not the first one.

## Hub discovery: three-layer architecture

**Decision**: hub discovery is built as three composable layers — deep
links (`voxply://` URI scheme), an opt-in directory website/API, and
signed public hub profiles — rather than a single central registry.
Full design in [`docs/hub-discovery.md`](hub-discovery.md).

**Key choices within the design**:

- **Directory lives in a separate repo** (`voxply-discovery`). Separate
  deployment lifecycle (web service), separate CI/CD, separate
  contributor profile. The API contract in hub-discovery.md is the
  boundary.
- **Cryptographic listing ownership** — hub signs its own directory
  listing with its Ed25519 private key. No accounts on the directory
  service; ownership is proven, not asserted.
- **Opt-in at every layer** — hubs choose to list on a directory; users
  choose which hubs appear on their public profile. Nothing is indexed
  without operator/user action.
- **Official directory is the default but not the only one** — the
  client ships pointing at the official instance; operators can
  self-host their own directory; other client forks set their own
  default.

**Alternatives considered**: single central registry (rejected —
violates sovereignty design); DHT/gossip-based discovery (rejected —
massive complexity for marginal gain at current scale); directory merged
into the main repo (rejected — deployment lifecycle and contributor
access mismatch).

## Nested channels: DnD interaction model

**Context**: schema already supports arbitrary nesting
(`channels.parent_id`, `is_category`); server validates cycles and
parent-must-be-category. The client today builds a one-level tree
(`buildChannelTree` in `client/voxply-desktop/src/utils/channels.ts`)
and `handleDragEnd` in `App.tsx` (~line 2952) does a flat global
`arrayMove` and POSTs to `reorder_channels`. `move_channel` exists but
is never invoked from drag. Goal of this entry: pick the four
interaction primitives so implementation can start without re-deriving
them.

### 1. DnD strategy — Option A (single flat `SortableContext`, DFS order)

**Decision**: collapse the sidebar into a single `SortableContext`
that lists every visible channel/category in depth-first order, with
indentation rendered via CSS padding-left keyed off the node's depth.
Reparenting and reordering are both expressed as "where in the flat
list did the user drop, and at what indent level."

**Alternatives**: keep nested `SortableContext`s, one per category,
recursively (Option B); roll a non-dnd-kit tree (Option C).

**Tradeoff**: nested contexts make "move from category X into category
Y" a context-jump that dnd-kit handles awkwardly — `over` events fire
inside whichever inner context the pointer is in, and the sortable
animations fight each other when an item leaves one context for
another. With unbounded depth (the design rule from
`future-features.md`), the recursive approach also requires every
category to instantiate its own context and `useSortable`, multiplying
re-renders. A single flat context with DFS rendering is what
dnd-kit's tree examples settle on for the same reason: it gives one
coherent stream of `over` events, supports any depth without code
changes, and keeps the indentation purely visual. The cost is that
we compute drop-target semantics (parent, sibling-index, depth)
ourselves from the over-id and the pointer's horizontal position
rather than letting nested contexts encode it.

### 2. Reparenting gesture — Option B (horizontal offset signals nest depth)

**Decision**: while dragging, the pointer's X position relative to the
sidebar's left edge picks the **target depth**. The drop indicator
shows a horizontal line at the resolved (parent, index, depth)
combination. Drag right past the row's indent to nest one level
deeper; drag left to un-nest. Dropping onto a category header is also
accepted as a shorthand for "append as last child" (mostly so users
who don't notice the offset hint still get a sensible result).

**Alternatives**: A — only "drop onto category header" reparents,
between-item drops always keep the source's parent. C — no DnD
reparenting; admin modal only.

**Tradeoff**: option A breaks down past two levels — there's no way to
move a node up to grandparent level without first dragging it onto
the grandparent header, which means the drop target keeps moving as
you scroll. Option C is fine but punishes the common case (admins
shaping their tree). Horizontal offset is the standard tree-DnD
gesture (file managers, outliners, dnd-kit's own tree example) and
reads naturally with the indentation we're already drawing. The
"drop on header = append" fallback covers the discoverability gap
without conflicting with the offset gesture.

### 3. Cycle detection — both, but client is advisory

**Decision**: server is the source of truth and rejects cycles
authoritatively (already implemented). Client also computes the
forbidden descendant set of the dragged node up front and refuses to
render the drop indicator over any of those rows — this gives
immediate visual feedback ("you can't drop a category into itself")
without a server round-trip. If the client check is bypassed somehow
(stale tree, race), the server rejection plus a toast is the
backstop.

**Alternatives**: rely on server only (simpler, but drops *appear* to
succeed for ~100 ms before the toast snaps the tree back, which feels
broken); client only (federated principle: the client never trusts
itself for invariants the server enforces).

**Tradeoff**: a few lines of `isDescendant(draggedId, candidateId)`
in the client buys a much better feel; we keep the server check
because we have to anyway.

### 4. `buildChannelTree` — make it fully recursive now

**Decision**: rewrite `buildChannelTree` to return a recursive
`TreeNode { node: Channel; children: TreeNode[] }[]` and produce a
parallel DFS-flat list (with `depth` annotations) for the
`SortableContext` to consume. Both shapes come out of the same pass.

**Alternatives**: keep the shallow shape and add a second pass on top;
recurse only as deep as today's data goes (1–2 levels) and grow it
later.

**Tradeoff**: the shallow function is already wrong for what we want
to render (it filters non-root parents into the wrong bucket once
categories nest under categories). Half-recursing is just another
place that'll need to change next time, and the recursive version is
~15 lines. Single source of truth for tree shape beats two
half-implementations.

### What changes on the implementation side

- `client/voxply-desktop/src/utils/channels.ts`: rewrite
  `buildChannelTree` to be fully recursive; export a sibling
  `flattenTree(tree)` that yields `{ node, depth, parentId }[]` in
  DFS order for the sortable. Also export `descendantIds(tree, id)`
  for the client-side cycle guard.
- `ChannelSidebar.tsx`: collapse the two nested `SortableContext`s
  (lines 221/239) into one driven by the flat DFS list. Render each
  row with `paddingLeft: depth * INDENT_PX`. Categories still render
  their header row but no longer wrap their children in a separate
  context.
- `App.tsx`'s `handleDragEnd` (~2952): resolve the drop into
  `(parentId, displayOrder)`. If `parentId` differs from the source's
  current parent, call `move_channel` first, then `reorder_channels`
  scoped to the affected sibling group(s). If only the order changed,
  skip the move call.
- New `DragOverlay` content: render the dragged row at its current
  resolved depth (recompute on `onDragMove` from pointer X) so the
  user sees the indent they're committing to.
- Tauri side: no changes. `move_channel` and `reorder_channels` are
  both already wired.

### What's deferred

- **Visual strategy past ~6 levels** (open question in
  `future-features.md` — horizontal scroll, auto-collapse,
  breadcrumb): not blocking. Indent past the sidebar width simply
  truncates with ellipsis until we pick one.
- **Permission-override UI on nested categories**: separate design.
- **Permalinks showing the full path** (`Games / LoL / #raid`): a
  display-only change, not part of this DnD work.
- **Touch / mobile drag affordances**: out of scope; desktop only.

---

## First-run / onboarding: enhanced single screen, opt-in demo hub, non-blocking recovery

**Decision**: keep the welcome screen as a single-screen layout (no
wizard), reorganise it into three named sections, add an opt-in demo
hub as a secondary CTA next to the primary "Add your first hub", and
keep recovery acknowledgement non-blocking. No identity surfacing on
first run. No in-channel first-use hints in this pass.

**Final shape of the welcome screen** (`empty-state welcome` in
`App.tsx` ~line 3185, rendered when no hubs are present):

1. **Heading + tagline** — unchanged copy.
2. **Section 1 — "Protect your identity"**: `WelcomeRecoveryBlock`
   moves up to be the first content block after the tagline.
   Rationale: backup is the only thing the user can lose forever; the
   add-hub step is recoverable. The block keeps its three sub-states
   (unrevealed / revealed / acknowledged). It does **not** gate the
   add-hub buttons — both CTAs remain enabled at all times.
3. **Section 2 — "What Voxply is"**: the existing three bullet points
   (Hubs / Identity / Alliances), kept verbatim, framed as a brief
   "what you're getting into" block under a subheading.
4. **Section 3 — "Join your first hub"**: a CTA row with two buttons:
   - **Primary** — "Add your first hub" → opens `AddHubModal`
     (existing flow, unchanged).
   - **Secondary** — "Try a demo hub" → opens `AddHubModal` with the
     URL field pre-populated from a new `DEMO_HUB_URL` constant. The
     user still sees the preview and clicks confirm. The button is
     hidden when `DEMO_HUB_URL` is empty/null.
   Followed by the existing footnote about asking a friend / pasting
   an invite / running your own.

**Demo hub concretely**:
- New constant `DEMO_HUB_URL: string | null` in `client/voxply-desktop/src/constants.ts`,
  initially `null` until a Voxply-operated demo server is stood up.
- The "Try a demo hub" button is conditionally rendered on
  `DEMO_HUB_URL != null`. No dead button ships.
- Clicking it opens the same `AddHubModal` with the URL prefilled,
  not a bypass. The preview-then-confirm flow stays so the user sees
  what hub they're joining; this also means the modal's existing
  validation, error handling, and join-approval paths apply unchanged.
- The demo hub is never auto-joined on first launch. Onboarding stays
  opt-in.

**Recovery acknowledgement is not a gate**:
- The user can click "Add your first hub" without revealing or
  acknowledging the phrase. The block stays visible (and prominent)
  on the welcome screen until acknowledged, and the same phrase is
  reachable from Settings → Security afterwards.
- Rationale: blocking the only useful action on the screen behind a
  modal-flavoured banner trains users to dismiss safety nudges. A
  prominent, non-blocking nudge with a permanent re-entry point in
  Settings is the right pressure level.

**Identity surfacing**: nothing on first run. Public-key fingerprint
display lives in Settings, not on the welcome screen — too technical
for a screen whose job is "get the user into a hub."

**Post-first-hub**: once the user has any hub, the welcome screen is
gone forever (existing behaviour). No in-channel first-use hints
("try typing a message") are added in this pass. If empty-channel
guidance is needed later, that is a separate feature with its own
design entry — it is not part of first-run.

**Alternatives considered**:
- **Multi-step wizard (Identity / Recovery / Add hub)** — rejected.
  The user has exactly one decision on first run (which hub), so
  steps 1 and 2 are filler. A wizard that runs once and then never
  again earns no reuse for its complexity, and `WelcomeRecoveryBlock`
  already covers the recovery step in place.
- **Inline quick-add for the demo hub (skip the preview modal)** —
  rejected. Hiding the URL the user is about to join contradicts the
  "you're picking which hub" framing of the rest of the product. The
  one-extra-click cost is worth keeping the demo hub indistinguishable
  from any other hub join.
- **Demo hub button as a placeholder before a URL exists** —
  rejected. A button that does nothing or shows "coming soon" trains
  users to distrust CTAs. The `DEMO_HUB_URL != null` gate keeps the
  feature dark until the server is real.
- **Block "Add hub" until recovery is acknowledged** — rejected. See
  above; nudges that block the primary action become friction the
  user routes around (force-close + relaunch, copying URL into a
  config file, etc.).
- **Show public-key fingerprint on welcome** — rejected as first-run
  noise. A user who cares can find it in Settings; a user who doesn't
  doesn't need to be told their identity has a hash.

**Implementation impact**:
- *Client* (`App.tsx` ~3185–3217): reorder the children of
  `empty-state welcome` to put `<WelcomeRecoveryBlock />` first, wrap
  the three bullet `<li>`s under a "What Voxply is" subheading, and
  replace the single primary button with a CTA row containing the
  primary "Add your first hub" plus a conditional secondary "Try a
  demo hub". Both buttons call `setShowAddHub(true)`; the demo
  variant additionally seeds the modal's URL input.
- *Client* (`AddHubModal`): accept an optional `initialUrl` prop and
  use it to pre-populate the URL input on open. No other behaviour
  change; the preview/confirm flow is shared.
- *Client* (`constants.ts`): add `export const DEMO_HUB_URL: string |
  null = null;` with a comment that this flips to a real URL once a
  Voxply demo hub is operated. The welcome screen renders the demo
  CTA only when this is non-null.
- *Client* (`WelcomeRecoveryBlock`): no behaviour change. Visual
  prominence comes from its new position in the layout, not from
  component changes.
- *Styles*: a `.welcome-cta-row` (or similar) for the two-button row;
  `welcome-points` keeps its bullets but lives under a new
  subheading. No new components.
- *Server / Tauri*: nothing. First-run is entirely client-side.

**Deferred**:
- Standing up an actual Voxply-operated demo hub and setting
  `DEMO_HUB_URL`.
- In-channel "you're in, try a message" guidance for empty channels.
- Identity-surfacing affordances (fingerprint, device name) on the
  welcome screen — kept in Settings only.
- Any concept of resuming onboarding on a second device (multi-device
  has its own design space; nothing about first-run pre-empts it).

## Notifications: client-side filtering, two distinct features, dot-on-active-hub fixed

**Decision**: a four-part answer to the notification model question.

1. **Subscription protocol stays client-driven (status quo).** The client
   sends `subscribe_all` on connect; the hub continues to firehose every
   channel the user can read. The client filters by per-channel
   `NotifyMode`. Per-channel `subscribe`/`unsubscribe` based on mode is
   designed-but-deferred — the wire shape (`WsClientMessage::Subscribe`
   / `Unsubscribe`) already exists in `chat_models.rs:175-181` so the
   switchover is a client-side change when scale demands it.
2. **Two distinct features, both gated by the same `NotifyMode`.**
   These are not two tiers of one thing; they are separate features that
   happen to share the mode knob.
   - **Notification** = proactive interruption: audio ping + OS
     notification. "Someone is calling for your attention right now."
     Fires when `allowBump` AND the channel is not currently visible
     (not active channel) AND either it's a mention OR mode is `all`
     AND the app is not focused.
   - **Unread pin** = passive reminder: the dot on a channel row and
     the badge on a hub icon in the sidebar. "There are messages waiting
     when you're ready." Fires whenever `allowBump` AND channel is not
     active.
   - Behavior under each mode:
     - `all` → unread pin for every message; notification per the
       notification rule above. Pin fires **even on the active hub**
       when the user is not in that channel. The current "no pin on
       active hub unless mention" gap is treated as a bug and removed.
     - `mentions` → unread pin **only** on mention; notification only
       on mention. Non-mention messages produce neither.
     - `silent` → no pin, no notification, ever.
   - Rule: **notification implies unread pin; unread pin does not imply
     notification**. We do not expose a fourth "pin but no sound" mode.
     Keeping the matrix at three modes is what made the user's mental
     model fit on one line.
3. **Permission gate: hidden channels produce neither pin nor
   notification.** Before processing a `chat-message` event, the client
   checks that `channel_id` exists in its local `channels` array. If
   not, the message is silently dropped — no pin, no notification, no
   unread bump — even if the body contains a mention of the user's
   display name. Today this guards against race conditions (deleted
   channels, channels not yet loaded, firehose entries the client never
   listed). Tomorrow, when per-channel ACLs land, this is the same gate
   that keeps invisible channels invisible. The hub-side firehose is
   not authoritative about what the user can see; the client's
   `channels` list is.
4. **"Hey dude, unread messages" is the existing sidebar pin + hub
   badge + tray badge. No new global banner.** Add one concrete
   affordance: a **"Jump to first notification"** button at the top of
   `ContentArea` when the selected channel has a tracked first-notifying
   message above the current scroll position. Semantics: scroll to the
   first message in the channel's history that *matched the user's
   notify criteria* — i.e., the message that caused the unread pin to
   appear. In `mentions` mode with 50 unread and one mention, this
   jumps to the mention, not to message #1. The client tracks a
   `firstNotifyingMessageId` per channel (string id, client-side state
   only; nothing new on the server). It is set when the pin first
   transitions from clear to set, and cleared when the pin clears.
   The existing `newWhileScrolledUp` pill already covers the "messages
   arrived while you were scrolled up" case; the new button covers
   "you switched into a channel with backlog you haven't seen."

**Alternatives considered**:
- **Server-side mode sync (Option B)**: client tells the hub its
  per-channel modes; server filters. Rejected — couples UI prefs to the
  protocol, and per-user filtering on the broadcast path costs more
  CPU than the firehose saves bandwidth at our scale.
- **Per-channel subscribe/unsubscribe today (Option A)**: cleaner
  long-term but pays migration cost now for a problem (bandwidth) we
  do not have. The wire shape is reserved so we can flip later without
  a protocol break.
- **Mentions-mode pins for all messages (just no notification)**:
  rejected — defeats the user's stated goal of "no pin noise for
  ignored channels." Mentions-only must mean mentions-only on both
  features.
- **Independent pin/notification toggles per channel**: rejected —
  combinatorial explosion in the UI for a use case nobody asked for.
  Three modes, one knob, two features that read it.
- **Global "you have unread messages" toast**: rejected — redundant with
  the tray badge and the window-title unread count, and intrusive when
  the user is in a non-message view (game, settings) on purpose.

**Why this combination wins**:
- Keeps the protocol unchanged today; the future-proof shape is already
  on the wire.
- Fixes the active-hub pin gap that contradicts the user's "pin for
  every message in `all` mode" expectation.
- The notification-implies-pin rule means the pin is a strict superset
  of the notification — users never get notified about something that
  isn't also visible in the sidebar after the fact.
- Naming the two features distinctly ("notification" vs "unread pin")
  prevents the design conversation from collapsing them whenever a new
  edge case shows up.
- The hidden-channel gate keeps the `channels` array as the single
  client-side authority on visibility, which is the same shape per-
  channel ACLs will need.
- Adds one piece of UX ("jump to first notification") that takes the
  user directly to the message that caused the pin, not to arbitrary
  unread #1 — without inventing a new global notification surface.

**Implementation impact**:
- *Client* (`App.tsx` chat-message handler around line 1020-1070):
  - Add the hidden-channel gate as the **first** check in the handler:
    if `!channels.some(c => c.id === msg.channel_id)`, return early.
    No pin, no notification, no unread bump, no mention check.
  - Remove the `(!isActiveHub || isMention)` gate on `bumpUnread` so the
    pin fires for `all`-mode messages on the active hub too.
  - The notification block stays scoped to mentions for `mentions` mode;
    for `all` mode the gate becomes
    `(isMention || (mode === "all" && !document.hasFocus()))`.
- *Client* (per-channel state): track `firstNotifyingMessageId: string
  | null` keyed by channel id. Set it to the incoming message id at the
  moment the pin transitions clear → set; leave it alone on subsequent
  pin-bumps; clear it when the pin clears (channel read).
- *Client* (`ContentArea`): add a "Jump to first notification"
  affordance. On channel select, if `firstNotifyingMessageId` is present
  and that message is not in view, render the button. Click scrolls to
  that message id; the button hides on scroll-into-view or on click.
- *Server*: no changes. The reserved per-channel `Subscribe` /
  `Unsubscribe` wire types stay reserved. The hidden-channel gate is
  client-side only — the hub keeps firehosing.
- *Docs*: cross-link this entry from `client.md` notification bullets.

**Deferred**:
- Per-channel firehose-off (Option A migration): defer until a real
  bandwidth/battery measurement justifies it. Trigger conditions:
  (a) median user is on >10 hubs with >50 channels each, or
  (b) mobile client lands and battery telemetry shows WS traffic as a
  top drain.
- Quiet hours / DND windows: not in this decision. If added later, they
  layer on top as a global override that downgrades all modes one step
  (`all` → `mentions`, `mentions` → `silent`, `silent` stays).
- Per-user mute (mute a person across all channels): orthogonal, lives
  in the block/ignore system in `client.md`, not here.

## Client state stays in App.tsx; no per-domain hooks, no context

**Decision**: after the JSX-extraction refactor, `App.tsx` keeps owning
all 172 hooks, all effects, and all event handlers as a single flat
state container. Components stay pure renderers that receive what they
need as props. We do not split state into per-domain custom hooks, and
we do not introduce React context for any application-state domain.

**Alternatives considered**:
- **Custom hooks per domain** (`useHubs`, `useMessaging`, `useVoice`,
  `useUI`, ...). App.tsx becomes a composer.
- **React context per domain** with leaf components consuming directly,
  removing prop drilling through `ContentArea` (~50 props) and
  `ChannelSidebar` (~30 props).
- **Hybrid**: hooks for data domains, context only for truly global
  values (theme, publicKey, blockedUsers).

**Why staying flat wins**:
- **The handlers are cross-domain.** `handleSend` touches messages,
  typing, attachments, reply target, unread, notifications. Selecting a
  hub mutates hubs, channels, messages, roles, approval status, voice,
  and admin tabs. Adding a friend touches friends, conversations, and
  view. Domains as drawn in the proposal are not closed sets; a
  `useMessaging` hook would either pull `useTyping`/`useAttachments`/
  `useUnread`/`useNotifications` in as deps (so its public surface
  re-exposes everything), or the handler would have to live above the
  hooks anyway. Both paths reintroduce App.tsx.
- **Effects already cross domains.** The hub-WS event listener writes
  into messages, channels, users, voice, typing, alliances, DMs,
  unread, and friends in one block. Splitting it across hooks means
  six hooks all subscribing to the same Tauri event stream and
  fighting over shared invariants like "active hub changed → reset".
- **Context costs more than it saves here.** The two fat-prop
  components (`ContentArea`, `ChannelSidebar`) are *not* deep trees —
  they are direct children of App.tsx. The "drilling" is one level.
  Context would replace one explicit interface with implicit coupling
  and make those components untestable without a provider harness.
  TypeScript inference on context with `T | undefined` defaults is
  also strictly worse than the current explicit prop interfaces.
- **C# mental model.** The dev is new to React. One big stateful
  parent + dumb children is easy to reason about (it maps to a
  ViewModel with child controls). Custom hooks plus context plus
  cross-hook coordination is a step into idiomatic-React territory
  with no payoff at the current size.
- **No state-library convention.** We've already committed to "React
  state + context covers everything." That convention does not say
  "use context aggressively"; it says "don't reach for Redux/Zustand."
  Plain hooks satisfy it.

**What this means in practice**:
- No `useFooDomain()` files under `src/hooks/`. If a piece of logic
  is genuinely reusable and pure (e.g., a typing-debounce helper, a
  reconnect-backoff helper), it can become a small custom hook — but
  scoped to one concern, not a domain.
- No new `*Context` providers. The existing top-level theme application
  via `data-theme` on the root element stays as-is.
- The fat prop interfaces on `ContentArea` and `ChannelSidebar` stay.
  They are the bill we pay for the explicit data flow.
- Future extraction targets are *handlers*, not state. If App.tsx grows
  again, pull pure helpers (URL builders, message formatters, sort
  comparators) into `src/utils/` — not into stateful hooks.

**Revisit when**:
- A second top-level surface starts mounting independently of App.tsx
  (e.g., a separate window, a popover that lives outside the React
  tree). At that point a context for shared identity/theme might pay
  off.
- The dev is comfortable enough with React idioms that the
  cross-domain coordination cost in App.tsx outweighs the cognitive
  cost of context wiring. That is a judgement call, not a metric.

**Supersedes**: the "future refactor could split state into context
providers per domain" hedge in [client.md](client.md). That option is
now explicitly off the table until the revisit conditions hit.

## Personal state lives on a home hub list; community state stays direct

**Decision**: a user designates a master-signed, ordered list of
**home hubs** that hold their *personal-axis* state — devices, prefs,
DMs, friends. Community-axis state (channel messages, voice,
alliances) still flows direct between client and the relevant
community hub. Writes to personal-axis state replicate across the
list; reads can hit any hub in the list.

**Alternative considered**: continue with no home hub at all (the
prior decision), pushing every personal-axis feature to invent its
own ad-hoc per-hub or per-device sync.

**Why a list wins**:
- Multi-device needs a single canonical place to publish device
  certs and revocations. Without one, every community hub would
  need its own copy and would drift.
- DMs need a canonical inbox view so phone + desktop see the same
  list. Spraying across community hubs without a canonical view
  forces every device to log into every hub.
- A *list* (rather than a single home hub) preserves the failover
  resilience that drove "DM failover, not load-balanced routing"
  below — any hub in the list can serve, and there is no single
  point of failure.
- Master-signed designations mean consumers never have to trust an
  individual home hub — they verify the master signature.

**What this supersedes**: the "Client connects directly to many hubs"
entry below was correct *for community traffic* but forced
personal-axis state into bad shapes. It is now scoped to community
traffic only; personal state goes through home hubs.

**Design docs**: [home-hub.md](home-hub.md) (storage layer) and
[multi-device.md](multi-device.md) (identity + pairing protocol).

## Channels are unified text + voice

**Decision**: every channel is both a chat room and a voice room. There
is no "text channel" vs "voice channel" type. Joining voice is something
a user *does* in a channel — not a property of the channel.

**Alternative considered**: a split model — separate channel types,
each doing one thing.

**Why unified wins**:
- Channel-as-place model: a channel is a *place*. People are there,
  talking and typing.
- Halves the channel count for the same expressiveness — communities
  don't need a "#raids" text channel and a separate "Raid Voice"
  channel; they have one "raids" room where both happen.
- Permissions, moderation, bans, naming, history all attach to the
  same entity.
- Schema is simpler: `channels` has no `kind` column. Voice is
  runtime state (`state.voice_channels` map keyed by channel id), not a
  persistent property.

**Implication for design**: when adding any channel feature, ask "does
this make sense for both chat and voice in the same room?" If yes,
build it once. If no, the feature probably belongs as a *channel
property* (e.g., `min_talk_power`) rather than a new channel kind.

## Client connects directly to many hubs

**Status**: partially superseded — see "Personal state lives on a home
hub list" above. This decision still holds for **community traffic**
(channels, voice, alliances), but **personal-axis state** (devices,
prefs, DMs, friends) now flows through a master-signed home hub list.

**Decision**: the desktop client connects to each hub directly. Hubs
are independent — they don't proxy each other's traffic.

**Alternative considered**: a "home hub" model where your home hub
proxies everything else.

**Why direct (for community traffic)**: simpler. Each hub is a self-
contained community. Cross-hub features (alliances, federated DMs)
are explicit opt-in protocols on top, not the default. The client
becomes the multi-hub orchestrator, not the hub server.

**Why this had to bend for personal-axis state**: see the home hub
list decision above — multi-device, DM unification, and prefs sync
all needed an anchor that "no home hub" couldn't provide.

## DM failover, not load-balanced routing

**Decision**: a user publishes an **ordered list** of delivery hubs in
their friend record. Sender tries primary → secondary → etc. on failure.

**Alternative considered**: load-aware / traffic-aware routing across
hubs.

**Why failover wins**: load-balancing needs gossip, cross-hub
consistency, and shared state we don't have. Failover gets ~90% of the
benefit at near-zero coordination cost. Don't add load-aware routing
without real telemetry justifying it.

## One device per account (today)

**Decision**: A recovery phrase is the secret. Pasting it on a device
*replaces* that device's identity; it doesn't sync.

**Alternatives considered**:
- HD-wallet style master seed → per-device subkeys via HKDF.
- "Home hub" picks a primary device and syncs an encrypted prefs blob.

**Why simple wins now**: multi-device adds key management, conflict
resolution, and revocation work that we don't yet need. The simple model
ships and is forward-compatible: the recovery phrase can later be
treated as a master seed without breaking existing identities (migrate
by deriving the existing key as "subkey 0").

**Revisit when**: design is now committed in
[multi-device.md](multi-device.md) (identity model + QR pairing
protocol) and [home-hub.md](home-hub.md) (storage layer). The
implementation is phased; this entry stays accurate as a description
of the *current shipped* behavior until phases 3-5 land.

## ROADMAP.md is gitignored

**Decision**: ROADMAP.md is the durable local task list. Not committed.

**Why**: it's a working document that changes hourly during a session;
versioning it produces noise without value. Public state lives in
README.md and `docs/`.

## Federated, not centralized

**Decision**: Communities are hubs. Hubs federate. No central server.

**Why**:
- Lets a community own its data and moderation policy.
- A single takedown doesn't kill the network.
- Matches the "many private servers" mental model people already have.

**Cost**: harder onboarding (you need a hub URL), harder discovery,
harder cross-community state. We accept these in exchange for community
sovereignty.

## Three crates, not a monorepo soup

**Decision**: `shared/`, `server/`, `client/` as the top-level split,
each with one or two crates.

**Why**: identity rules and voice rules must agree exactly between client
and server. One crate per cross-cutting concern prevents drift. Beyond
that, server and client have completely different shapes — separate
crates avoid a giant feature-flagged build.

## Tauri, not Electron

**Decision**: Tauri 2 + React for the desktop app.

**Why**: smaller binaries, native voice access via cpal, real OS APIs
without an Electron runtime. The cost is fewer pre-built integrations,
but for a voice-first app the OS-native audio path is non-negotiable.

## SQLite, not Postgres

**Decision**: each hub embeds SQLite.

**Why**: a hub is single-tenant by design. SQLite means zero-ops for the
operator (no DB to set up), trivial backups (one file), and good enough
performance for community-scale traffic. If we later want multi-tenant
hub farms, the storage layer can change underneath without affecting
the federation protocol.

## DMs as outbox, not session

**Decision**: federated DMs are mailbox-style — sender's hub queues
the message and pushes it to the recipient's hub.

**Why**: recipient's hub may be offline. Familiar mental model. Avoids
"home hub" picking — both hubs hold a copy by design. See
[federation.md](federation.md).

## No proof-of-work yet

**Decision**: anti-spam is in the ROADMAP, not shipped. The PoW
primitives exist (`shared/voxply-identity/src/pow.rs`) but aren't
enforced.

**Why**: premature spam mitigation in a private-network product would
just annoy real users. Add when there's actual abuse to mitigate.
