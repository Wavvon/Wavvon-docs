# Voxply Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
design questions — lives in the wiki at [`docs/`](docs/README.md).
The full history of shipped work lives in
[`docs/shipped-log.md`](docs/shipped-log.md).

## 🔨 Next up

- [ ] **Web client remediation (demo-blockers first)** — close the
  highest-impact divergences from the [2026-06-11 audit](code-audit-2026-06-11.md)
  so the browser client is credible for a public demo and the
  [comparison](COMPARISON.md) "browser client" row can return to ✅.
  Priority order: screen-share viewing (W8).
  In-channel search (W16) and reconnect re-auth (W10) done.
  Reactions, typing, missing CSS (W12/W3/W4/W25), message bleed/hub identity
  (W1/W2), server error surface (W6), and admin/moderation panel routes (W13/W26)
  already done.
- [ ] **Networked voice — Phase 1** — make voice work across a network
  (today the relay only works when client and hub share a machine). Design
  is ready: token-gated source-address learning, see
  [voice-networking-design.md](docs/voice-networking-design.md). Removes the
  "voice is LAN/local only" limitation from the comparison. Phase 2 (voice
  encryption) is a separate later initiative.
- [ ] **Hub security & correctness from the audit** — federated-DM sender
  spoofing (H4). H2/H3 (presence refcount + bot_sessions per-session) and
  H5/H6 (rate-limiter trusted-proxy + IPv6 canonicalization) done. See
  [code-audit-2026-06-11.md](code-audit-2026-06-11.md).
- [ ] **First external operator pilot (videogamezone.eu)** — friend runs his
  own hub on his OVH VPS; first real doc test, first two-operator federation
  test, feeds the visibility push. Drafts ready in `pilot-videogamezone/`
  (nginx vhost, compose file, runbook). Gated on the v0.2.1 release (CORS +
  `--doctor` must reach the published image) or a dev-built image transfer;
  server-side needs docker-group access, vhost install, UDP 3001 open.
- [ ] **Fix the aarch64 hub binary build** — first real release run (v0.2.1,
  2026-06-12) failed: `aarch64-linux-gnu-gcc` link error in the musl
  cross-build (aws-lc-sys/ring object files). The x86_64 binary and Docker
  images are unaffected.
- [ ] **Remaining App.tsx decomposition** — desktop (~3,260 lines) and android
  (~2,900) hold the channel-message/WS wiring. DM cluster extracted on both
  (desktop `useDms` 348 lines; android parity port preserves its
  plaintext-group divergences). Channel message send, WS listener
  registration, and alliance cluster remain in both roots.

## 🤔 Design questions

- **Farm agent WS token in URL query string** — registration tokens appear in
  `/ws/agent?token=…` and therefore in access logs. Moving to a header or a
  first-message auth frame requires a coordinated server/agent protocol change.

## 🚧 Blocked

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity (the free OSS signing route requires it; paying for signing
  before there are users isn't worth it). Ship unsigned with the documented
  SmartScreen workaround meanwhile; all signing-service steps removed from CI.
  Options and design in [`code-signing.md`](docs/code-signing.md).
- **Android client icons** — placeholder solid-color PNGs in place. Waiting on
  the final logo asset. Run `cargo tauri icon <1024x1024.png>` once the brand
  logo is ready. See [`brand.md`](docs/brand.md).

## 📌 Wishlist (undesigned)

- **Project visibility push** — remaining: a hosted demo hub, directory listings, launch post.
  Needed both for adoption and for the code-signing re-application.
  *(2026-06-10: all six READMEs rewritten as landing pages with badges,
  cross-links, and a `docker compose` quick-start.
  2026-06-11: demo-seed tool added; real screenshots + join-flow GIF added to READMEs.)*
- **Gaming Tier 3** — MMO + persistent shared world; stretch goal. Proximity
  voice is already a platform primitive; only the persistent-world layer is
  undesigned.
- **E2E v2 — Double Ratchet** — forward secrecy upgrade from the shipped
  static-ECDH and sender-key schemes. See
  [`e2e-encryption.md`](docs/e2e-encryption.md).

## 🚀 Recently shipped

- **H5/H6 rate-limiter trusted-proxy + IPv6 canonicalization (2026-06-12)** —
  `rate_limit.rs` gains a `VOXPLY_TRUSTED_PROXY` setting (default false). When
  enabled, the limiter derives the real client IP from the last
  `X-Forwarded-For` entry (the hop the proxy observed) instead of the raw socket
  address, fixing accidental hub-wide login lockout behind Caddy/nginx (H5).
  All IPs are canonicalized before keying: IPv4-mapped IPv6 (`::ffff:a.b.c.d`)
  collapses to the plain IPv4 address; genuine IPv6 is bucketed at the /64
  prefix (high 64 bits, low 64 zeroed), closing the unlimited-bucket-mint attack
  vector from a single /64 (H6). Effective mode logged in the startup banner.
  6 new unit tests + existing 3 integration tests all pass.

- **H2/H3 presence refcount + bot_sessions per-session (2026-06-12)** —
  `online_users` changed from `HashSet<String>` to `HashMap<String, usize>`;
  connect increments, disconnect decrements and only removes the key at zero,
  so multi-device / reconnect-overlap no longer falsely marks a user offline.
  `bot_sessions` changed from `HashMap<pubkey, Sender>` to
  `HashMap<pubkey, HashMap<session_id, Sender>>`; each WS session registers
  under its own UUID and removes only its own entry on disconnect, so the
  older session's sender survives. `ScreenStreamMeta` gained a `session_id`
  field and disconnect cleanup now retains streams from other sessions.
  4 new tests in `hub/tests/presence_multi_session_flow.rs`; all 44 test
  suites green.

- **Hub CORS layer + self-describing CLI (2026-06-11)** — `VOXPLY_CORS_ORIGINS`
  env-var (default `*`) wires a tower-http `CorsLayer` onto the main axum
  router; `--help` prints a generated env-var table, `--version` prints the
  version, `--doctor` runs pre-flight checks (port bind, TLS PEM validity,
  working-dir write), and the startup banner logs effective port, scheme,
  UDP port, TLS state, CORS origins, and data-file paths with TLS-disabled
  and voice-UDP firewall warnings. Four CORS integration tests added.
  hosting.md and browser-client.md updated.

- **Real screenshots + join-flow GIF in READMEs; web client fixes; demo-seed tool (2026-06-11)** —
  screenshots and join-flow GIFs added to main/desktop/web/hub READMEs; web client desktop layout CSS fix, message ordering fix, onboarding style improvements, voice roster bootstrap via `GET /voice/participants`; demo-seed tool populates a fresh hub with 8 identities, 5 channels, ~30 messages, a poll, and emoji reactions.

- **Web onboarding styling + voice roster bootstrap (2026-06-11)** — web
  client onboarding screens (identity create/recover, join-hub) now match
  the app's visual style: added missing `button`, `input`/`textarea`/`select`
  base CSS rules plus `btn-primary`, `btn-ghost`, `welcome-settings-link`
  classes to `styles.css`. Voice roster is now populated on connect/hub-switch
  via `GET /voice/participants`; `voice_roster_update`, `voice_participant_joined`,
  and `voice_participant_left` WS events are handled individually so the sidebar
  stays accurate during an active session. tsc clean.

- **demo-seed tool (2026-06-11)** — new `tools/demo-seed` binary in the hub
  workspace; populates a fresh running hub with 8 identities (Nova as owner +
  7 members), 5 channels under 4 categories, ~30 realistic messages, a poll,
  a pinned welcome message, and emoji reactions. Reads `HUB_URL` (default
  `localhost:3000`); writes credentials (tokens + recovery phrases) to
  `demo-credentials.json` (gitignored). `cargo check` and `cargo build --release`
  warning-clean.

- **ContentArea.tsx ports to all forks (2026-06-11)** — web (1,157 → ~320-line
  composition root), android/voxply-desktop (979 → ~290), android/voxply-web
  (881 → ~280) now mirror desktop's `components/content/` shape; each fork's
  own behavior preserved (web `@platform` adapters and mention pattern,
  android invoke/hubFetch variants, missing-feature gaps kept as-is —
  android/voxply-web has no forum so no ForumView). tsc clean in all three
  apps; vitest web 6/6, android 14/14.

- **ws/connection.rs dispatch refactor (2026-06-11)** — introduced `ConnState`
  (voice_channel, subscribed, pending_chunk, component_rate_limit,
  my_conversations, replay_buffer, is_replaying, public_key, is_bot) and a
  `DispatchResult` enum; extracted all match-arm logic into per-domain handlers
  under `routes/ws/handlers/`: `voice.rs` (816 lines), `screen.rs` (617),
  `game.rs` (305), `chat.rs` (120), `bot.rs` (84). `connection.rs` is now 605
  lines (was 1,910). Wire behaviour, lock-acquisition order, voice_relay_active
  bookkeeping, and `leave_voice_for_test` preserved exactly. All 250+ tests
  green; cargo check/clippy/fmt clean.

- **ContentArea.tsx desktop split (2026-06-11)** — behavior-preserving split
  of the 1,383-line `ContentArea.tsx` into 9 files under
  `components/content/`: `MessageHelpers`, `ReconnectBanner`, `DmView`,
  `ForumView`, `ChannelHeader`, `MessageRow`, `ChannelMessageList`,
  `ChannelComposer`, `AllianceView`. `ContentArea.tsx` is now 688 lines (a
  thin composition root); largest extracted file is `MessageRow.tsx` at 369
  lines. Props interface and export signature unchanged — callers unaffected.
  tsc clean, vitest 71/71, vite build succeeds.

- **Signing-service removal + spec CI gate (2026-06-11)** — all
  signing-service steps and the policy file removed from the desktop repo
  (code-signing is now a Blocked item until popularity; installers ship
  unsigned with the README workaround); hub CI now fails when a registered
  route is missing from `openapi.yaml` (sparse-checkout of the docs repo +
  `scripts/check-openapi-coverage.mjs`, currently 201/201 documented).

- **Desktop `lib.rs` module split (2026-06-11)** — behavior-preserving split of
  the 9,844-line desktop `src-tauri/src/lib.rs` into 28 domain modules (bots,
  lobby, farm, games, events_polls, discovery, certs, screen_share, updater,
  etc.); `lib.rs` is now ~350 lines. Zero TS-side changes required — Tauri
  command names are unchanged. `cargo clippy -D warnings`, `cargo fmt --check`,
  and all 38 tests green.

- **Hub route module splits wave 2 (2026-06-11)** — behavior-preserving
  directory-module conversions for `dms.rs` (1,305 lines → 4 files),
  `bots.rs` (1,236 → 5 files), `alliances.rs` (1,119 → 5 files), and
  `moderation.rs` (1,016 → 5 files); no file over ~800 lines; zero route-path
  or public-API changes. `cargo check --workspace`, `cargo test -p voxply-hub`,
  `cargo clippy -D warnings`, and `cargo fmt --check` all clean.

- **Big-file refactor wave 1 + complete API spec (2026-06-11)** — behavior-
  preserving module splits: hub `routes/ws.rs` (2,101 → 4 files) and
  `routes/games.rs` (1,617 → 6 files), android Tauri `lib.rs` (5,332 → 559
  + 14 domain modules), web `App.tsx` (1,402 → 1,255 via `useHubAdmin`/
  `useSettingsProfile`/`useFarmAdmin` hooks); all CI gates green per repo.
  `openapi.yaml` now documents **all 201 hub routes** (103 were missing —
  badges, certs, events, polls, forum, games, recovery, webhooks, etc.),
  verified by the new `docs/scripts/check-openapi-coverage.mjs`.

- **App.tsx decomposition batch 3 (2026-06-11)** — extracted DM cluster
  (view/conversations/selectedConversation/dmMessages/unreadDms/
  encryptionWarning state + loadConversations/selectConversation/startDmWith/
  handleSendDm/dm-WS/dm-member-changed handlers) into
  `desktop/src/hooks/useDms.ts`. App.tsx: 3461 → 3259 lines (−202). Interface:
  narrow ref/getter/callback params; onDmEvent + onDmMemberChanged callbacks
  for the WS useEffect; selectedConversationForTypingRef stays in App as a
  shared seam with useTypingIndicators. tsc clean, vitest 71/71, vite build.
  Android parity pending.

- **App.tsx decomposition batch 2 (2026-06-11)** — extracted `useHubAdmin`,
  `useFriends`, and `useSettingsProfile` from App.tsx into
  `desktop/src/hooks/`. App.tsx: 3937 → 3461 lines (−476). Behavior
  identical; tsc clean, vitest 71/71 green, vite build succeeds. Android
  parity pending (android repo not updated in this pass).

- **UDP voice relay tied to WS session (2026-06-10)** — added
  `voice_relay_active` set to `AppState`; `VoiceJoin` inserts, `leave_voice`
  removes; the UDP receive loop rejects packets whose sender pubkey is absent
  from the set before any fan-out work, closing the gap where a stale source
  address from a closed WS session could still relay traffic. Five integration
  tests in `hub/tests/voice_relay_flow.rs` cover join/leave, WS close without
  explicit leave, and rejoin.

- **Farm/seed/server/voice security sweep (2026-06-10)** — WS agent channel
  made bounded (was unbounded, OOM risk); DB error during token lookup now
  closes the socket instead of silently admitting the agent; heartbeat endpoint
  rejects unknown hub pubkeys even on DB error (was an auth bypass); proxy body
  size capped at 32 MiB; `public_key` added to `/farm/public-info` response
  (seed registration was broken without it); `agent::run` now survives malformed
  JSON from the farm without triggering a reconnect; voice pipeline spawned tasks
  no longer panic on Opus init failure. Eight new integration tests added across
  farm_auth_flow and admin_flow.

- **Hub wishlist quick wins (2026-06-10)** — `GET /preview` rate-limited
  (10/min per user), `POST /admin/search/reindex` for operator-driven index
  rebuilds without restart, `federated_bans` now enforced on outbound messages
  and DMs (not just inbound auth), dead `game_session_left` WS variant removed.
  All with integration tests; openapi.yaml and ws-protocol.md updated to match.

- **Full CI test coverage across all repos (2026-06-10)** — vitest suites now
  gated in CI for web (6 tests), android/voxply-web (14 tests), desktop
  (71 tests), and discovery (28 tests); web gains i18n coverage check via tsx;
  android gains `cargo fmt --check` and `cargo clippy -D warnings` gates
  (scoped to `voxply-desktop` crate, which is all that compiles without the
  Android NDK); 5 pre-existing clippy warnings in android/voxply-desktop fixed
  outright (1 redundant import removed, 2 needless borrows, 1 useless
  conversion, 1 `#[allow(dead_code)]` on a planned-but-unused struct); hub
  cargo test was already present. Discovery vitest suite covers `listHubs`
  (tag filter, pagination, combined filters), `verifySignature`, and
  `buildCanonicalPayload`/`currentNonce`; a bug was fixed in `verify.ts`
  (`ed.verify` → `ed.verifyAsync` for the @noble/ed25519 v3 async API).

- **WebSocket protocol documented (2026-06-10)** — the protocol contract now
  covers the WS side: connect/auth and framing in `openapi.yaml` (plus a `/ws`
  path entry replacing a stale, inaccurate event list), and a complete
  message-by-message wire reference in
  [`docs/ws-protocol.md`](docs/ws-protocol.md) (34 client→server,
  55 server→client messages, verified against the hub source).

- **Workspace hardening batch (2026-06-10)** — hub security fixes (WS session
  validation, atomic invites, SSRF DNS-rebinding, federated-ban check on farm
  tokens, upload headers), client race/cleanup fixes + error boundaries,
  android parity restored (voice events, speaking indicators), shared
  `@voxply/utils` package consumed by desktop/web/android, wire-format spec
  with cross-client byte-level vector tests (no divergences found), CI gains
  fmt/clippy gates and SHA-pinned actions, pre-commit secret guards in all
  repos, wiki synced with code reality. Follow-up: voice refresh is now
  event-driven (listeners pointed at the events each backend actually emits),
  and the vendored android i18n copy is re-synced with a CI drift check
  (`scripts/check-vendored.sh`) covering both vendored packages. The vector
  suite now also covers DhKeyRecord and all three DM envelopes (1:1, group,
  sender-key distribution), pinned in the spec, both Rust clients, and the
  web clients (no divergences found).

Older entries: [`docs/shipped-log.md`](docs/shipped-log.md).

## ⚠️ Known issues

- **auto-tag can never trigger the release workflow** — `auto-tag.yml` pushes
  tags with the default `GITHUB_TOKEN`, and GitHub does not fire workflows from
  events created by that token, so `release.yml` silently never runs (first
  observed on v0.2.1; tag had to be re-pushed manually). Fix options: push the
  tag with a PAT/deploy key, or have auto-tag invoke release via
  `workflow_call`. Also: `main` has no required status checks — PR #1
  auto-merged with a red build check; consider requiring "Build check".
- **Flaky test: `auth_rejected_when_pow_level_below_minimum` (pow_flow)** —
  probabilistic: a below-minimum PoW can accidentally meet the target and
  return 200 instead of 403 (seen on 0f9c97d: one CI run green, twin run red).
  Pin the nonce/difficulty or retry-loop the assertion.
- **demo-seed exports recovery phrases that don't recover the seeded identity (W27)** — credentials unusable for login; re-seed/screenshot logins blocked.
- **2026-06-11 audit: web client incomplete port** — 25 divergences found. W12/W3/W4/W25 fixed (reactions 405, typing both ways, 15 CSS class families). W1/W2/W6 fixed (message bleed, hub misattribution, server error surface). W13/W26 fixed (admin panel permission check + routes corrected). W16 fixed (in-channel search now hits `GET /channels/{id}/messages?q=` with 200ms debounce). W10 fixed (WS reconnect triggers full reauth after 3 consecutive failures instead of looping forever on a dead token). Remaining: dead screen-share (W8) and 13 other items. Blocks a credible public web demo.
- **2026-06-11 audit: networked voice broken** — hub relay registers all clients as 127.0.0.1; voice only works client+hub on one machine. Needs source-address learning.
- **2026-06-11 audit: federated-DM security** — endpoint accepts spoofed senders from any logged-in user.
- Full audit with all 46 findings (file:line and effort): [`code-audit-2026-06-11.md`](code-audit-2026-06-11.md).
- **Windows installer unsigned** — SmartScreen warning; workaround "More info →
  Run anyway". See the code-signing blocker above.
- **Cross-farm cert relay** — certifications work per-hub; revocations don't
  propagate across farms. See [`hub-certifications.md`](docs/hub-certifications.md).
- **Per-hub subkey revocation propagation** — revoking a multi-device subkey on
  one hub isn't known to other hubs. See [`multi-device.md`](docs/multi-device.md).
- **Bot deferred scope** — voice/screen-share injection, bot DMs, outgoing
  webhooks, bot-launched game modals: no timeline. See
  [`future-features.md`](docs/future-features.md).
- **Forum: reactions + attachments on posts** — not yet supported. See
  [`forum.md`](docs/forum.md).

## 💤 Won't do

- **Load-aware DM routing across a user's hubs** — failover only; load-balancing
  needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable
  cross-platform; live meter covers it
- **Central authority of any kind** — no global hub directory, global identity
  service, or DHT; federation is peer-to-peer
- **Subscriptions, premium tiers, or in-chat advertising** — no paywalled
  features; funding is via voluntary donations
- **Telemetry collection or data sales** — no opt-out telemetry; operators run
  their own hubs
- **Global web-of-trust or negative reputation / shared ban lists** — federated
  ban lists are opt-in per hub, not a global negative registry
