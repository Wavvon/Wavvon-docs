# Wavvon Docs

A navigable map of Wavvon for humans and LLMs. Optimized for **why** and
**where**, not **what** — code is authoritative for what; this wiki tells
you the rationale and points you to the right files.

## Reading order

Never seen Wavvon before? Start with
[getting-started.md](getting-started.md) — what it is and why it is
self-hosted, for a reader who has not run one. Then read in this order:

1. [architecture.md](architecture.md) — what runs where, the four repos (hub server, the Wavvon-client monorepo, docs, discovery) and the crates inside Wavvon-server
2. [identity.md](identity.md) — keypairs, recovery, auth
3. [federation.md](federation.md) — how hubs talk to each other
4. [alliances.md](alliances.md) — multi-hub groups (Wavvon's differentiator)
5. [voice.md](voice.md) — Opus + UDP relay + denoise pipeline
6. [data-model.md](data-model.md) — DB schema map
7. [client.md](client.md) — Tauri + React desktop client
8. [decisions.md](decisions.md) — design rationale, most recent entries (why federated, why no central server, etc.); older entries live in [decisions-archive.md](decisions-archive.md)
9. [threat-model.md](threat-model.md) — what we defend against, what we don't
10. [glossary.md](glossary.md) — terms

### Running a hub

- [hosting.md](hosting.md) — **deployment methods**: Docker Compose + Caddy, Docker behind an existing proxy, bare binary + systemd, build from source; TLS, firewall/UDP, web-client serving, backups, upgrades per method
- [hub-operations.md](hub-operations.md) — operator features: backup/restore, data retention, Prometheus `/metrics`, hub key rotation (built)
- [hub-operator-guide.md](hub-operator-guide.md) — **operating** a running hub: config reference, ownership, bootstrap, backup/restore, upgrade path, hardening
- [packaging.md](packaging.md) — cross-platform packaging, code signing, auto-update, CI/CD, hub Docker image
- [performance.md](performance.md) — load test plan for WS broadcast, search, voice relay; suspected ceilings and "good enough" thresholds (designed, not started)
- [hub-scaling.md](hub-scaling.md) — how one hub scales from a handful of users toward a million, and what changes at each threshold (tiers 1–3 shipped: Tantivy search, PostgreSQL, optional read replicas)

### Onboarding & anti-abuse

- [lobby-bot-survey.md](lobby-bot-survey.md) — security-level lobby, "not a bot" challenge, role questionnaire (built)

### Built features (design docs)

These shipped — the doc is the design rationale behind the code (see
[shipped-log.md](shipped-log.md) for the delivery log; the roadmap has never
had a "recently shipped" section, whatever this line used to claim):

11. [farm-model.md](farm-model.md) — multi-hub server layer + 5-layer architecture; the "Multi-node data plane" section is designed, not built (farm↔node TLS, per-node PostgreSQL)
    - [farm-impl.md](farm-impl.md) — Phase 1 + 2 + 3 implementation design (auth move, multi-tenancy, creation policy)
    - [hub-creation-wizard.md](hub-creation-wizard.md) — **superseded**: a hub is self-hosted and no client creates one. Kept for the reasoning
12. [gaming.md](gaming.md) — game distribution platform: tiers, registry, hub admin install + permissions, six-call SDK, farm-level games
13. [multi-device.md](multi-device.md) — master+subkey identity, QR pairing protocol
    - [home-hub.md](home-hub.md) — personal-axis state: the home hub list, its replication, and DM canonicalization. Designation, device registry, revocations, pairing state, the encrypted prefs blob and DM mirror-forward are built; the canonical DM inbox the clients read from, and the friend list, are still design
14. [e2e-encryption.md](e2e-encryption.md) — E2E encrypted DMs: X25519 from Ed25519 seed, static ECDH + AES-GCM, signed envelopes, group sender keys
    - [identity-recovery.md](identity-recovery.md) — recovery UX beyond the phrase: passphrase-wrapped `.wavvon-backup` export/import (Part 1) + per-hub recovery contacts (Part 2, vouch not auto-grant) + pointer to the hub-hosted identity vault ([identity-vault.md](identity-vault.md), no-file recovery from a home hub)
    - [recovery-attestation.md](recovery-attestation.md) — completes recovery contacts: the split request/attest flow, the `recovery-attestation/v1` signed envelope, and the signature verification that makes the threshold real (shipped 2026-07-20; note which key signs — roster identity, not master)
    - [wire-format.md](wire-format.md) — canonical byte-level spec for all signed envelopes in the identity crate (multi-device + E2E DM + identity verification); test vectors for client implementors
15. [server-tags.md](server-tags.md) — self-tags (discovery keywords) + portable signed hub badges
    - [hub-certifications.md](hub-certifications.md) — anti-spam Layer 2: hub-signs-user reputation certs, portable PoW credit
    - [moderation-enhancements.md](moderation-enhancements.md) — federated ban lists (signed, opt-in), auto-moderation webhook (fail-open), content reporting queue
16. [browser-client.md](browser-client.md) — second client (no Tauri), platform adapter, IndexedDB identity
17. [android-client.md](android-client.md) — Tauri 2 Android wrapper around the browser platform layer, side-loaded APK
    - [install-android.md](install-android.md) — end-user guide: enable unknown sources, download APK, Play Protect warning
    - [client-monorepo.md](client-monorepo.md) — **shipped (2026-06-13)**: the three client repos were consolidated into the one pnpm-workspace Wavvon-client monorepo (`packages/core|ui|platform|i18n` + `apps/*`); staged migration, git-subtree history preservation, CI/release/updater cutover. Hub server stays separate. See [decisions.md](decisions.md).
    - [client-parity.md](client-parity.md) — **living tracker** of feature gaps across web / desktop (web leads; the Android client was removed 2026-07-12). Current: desktop does not read hub `capabilities`, and a self-certified desktop device does not appear in its own device list.
    - [state-access-design.md](state-access-design.md) — how App.tsx and the shared components get their state: **decided 2026-09-05**, containers only — `packages/ui` stays prop-only, React Context rejected, the store deferred behind a named trigger. Read it before proposing a state library
18. [bots.md](bots.md) — external bot ecosystem: invite-by-pubkey, slash commands, webhook dispatch, per-hub directory
19. [accessibility.md](accessibility.md) — keyboard navigation, ARIA / screen-reader support, i18n strategy across desktop / web / Android
20. [forum.md](forum.md) — forum channel type: post-list variant, posts + reply threads, `create_posts`/`manage_posts` permissions, FTS search; §9 designs alliance federation (read-through proxy, owning hub authoritative — designed, not built)
21. [banner-channels.md](banner-channels.md) — banner channel type: full-width image rows in the hub sidebar (decorative chrome, hub-uploaded or external URL), drag-drop ordered like regular channels
22. [screen-share-webrtc.md](screen-share-webrtc.md) — screen share v2: WebRTC P2P, hub as SDP/ICE signaler, optional TURN, v1-relay fallback floor, multi-sharer
23. [block-mute-ignore.md](block-mute-ignore.md) — user-level block / ignore / quiet-hours (DND): personal-axis prefs-blob state, client-side filtering, server-enforced DM block
24. [discovery-v2.md](discovery-v2.md) — Wavvon-discovery enhancements: hub uptime tracking, farm browsing, global search, anonymous aggregate analytics
25. [client-qol.md](client-qol.md) — client quality-of-life: global search, drafts, custom emojis, events, polls, thread collapse, notification grouping
26. [store-trait-design.md](store-trait-design.md) — database abstraction: trait-based store, crate split (wavvon-store / wavvon-store-sqlite, wavvon-store-postgres as future community contribution), migration path
27. [custom-themes.md](custom-themes.md) — user-created skins: CSS token system, .wavvonskin file format, export/import, persistence
28. [brand.md](brand.md) — motto, one-liner, logo brief and asset checklist (final logo asset still pending)

### Future direction (designed, not built)

- [screen-share-modal.md](screen-share-modal.md) — unified desktop screen-share picker: Tauri `list_capture_sources` command, thumbnail grid, single-modal UX replacing the current two-step OS overlay
- [nested-channels-ux.md](nested-channels-ux.md) — nested-channel UX gaps: channel permalinks (breadcrumb resolution), deep-nesting sidebar strategy (capped indent + drill-in), and channel permission overwrites (net-new file-system-style cascade — data model, resolver, routes, UI)
- [settings-ia.md](settings-ia.md) — **implemented 2026-07-20** — unified Settings information architecture + profile model: one tab structure both clients render from `packages/ui`, converging desktop off the deleted profile-pool and onto multi-account (decided 2026-07-20); unblocks the `ProfileTab` + `IdentityBackupSection` parity passes
- [future-features.md](future-features.md) — intent settled, design pending: alliance member discovery, Android QR pairing, passkey-from-desktop, desktop parity, visibility push, the build-gated identity vault
- [bot-capability-layer.md](bot-capability-layer.md) — **Phases 1–2 shipped 2026-07-19** — the consent spine for the "Telegram-class bot runtime → games" pillar: capability request/grant model, interactive-UI runtime choice (declarative components vs sandboxed webview game modal), voice/video injection gates, abuse controls, phased first playable

### Archived designs

Kept for history; superseded by recorded decisions:

- [hub-admin-panel.md](hub-admin-panel.md) — **archived**: the hub web admin panel (`/admin/panel`) was removed; the admin CLI and farm console remain. See [decisions.md](decisions.md) ("Hub admin panel removed").
- [admin-panel-auth.md](admin-panel-auth.md) — **archived**: the Ed25519+TOTP web-panel auth design was built, then reverted along with the panel itself. See [decisions.md](decisions.md).
- [monetization.md](monetization.md) — **superseded in part**: missions, sparks, and the cosmetic catalog were removed; Wavvon operates no monetization infrastructure. See [decisions.md](decisions.md) ("Missions, sparks, and cosmetic catalog removed").

## Find by feature

Reading order is for learning the system end-to-end. This section is for
"I know what I'm looking for" lookups. A feature can span multiple docs.

### Identity & access
- **Keypair, recovery phrase, auth** — [identity.md](identity.md)
- **Identity backup & recovery contacts** — [identity-recovery.md](identity-recovery.md); **hub-hosted vault** — [identity-vault.md](identity-vault.md)
- **Multi-device pairing (QR, master+subkey)** — [multi-device.md](multi-device.md)
- **Wire format spec (signed envelopes, byte sequences, test vectors)** — [wire-format.md](wire-format.md)
- **Roles & permissions** — [data-model.md](data-model.md), [decisions.md](decisions.md)
- **Moderation (ban / mute / timeout / kick, approval queue)** — [data-model.md](data-model.md)
- **Federated ban lists, auto-mod webhook, report queue** — [moderation-enhancements.md](moderation-enhancements.md)
- **Lobby, "not a bot" challenge, onboarding survey** — [lobby-bot-survey.md](lobby-bot-survey.md)
- **Hub certifications (reputation certs)** — [hub-certifications.md](hub-certifications.md)
- **Block / ignore / quiet-hours (DND)** — [block-mute-ignore.md](block-mute-ignore.md); legacy per-device store in [client.md](client.md)
- **Web admin panel login (removed)** — [admin-panel-auth.md](admin-panel-auth.md) (archived; see [decisions.md](decisions.md))

### Messaging
- **Banner channels (decorative image rows in sidebar)** — [banner-channels.md](banner-channels.md)
- **Text channels & categories** — [data-model.md](data-model.md), [client.md](client.md)
- **Drag-drop channel/category reorder, nested channels** — [client.md](client.md)
- **Channel permalinks, deep-nesting sidebar, channel permission overwrites** — [nested-channels-ux.md](nested-channels-ux.md)
- **Markdown, code blocks, /me actions** — [client.md](client.md)
- **Reactions (local + federated)** — [data-model.md](data-model.md), [federation.md](federation.md)
- **Replies / threading** — [data-model.md](data-model.md)
- **Mentions** — [data-model.md](data-model.md)
- **Edit / delete messages** — [data-model.md](data-model.md)
- **Attachments (inline ≤3 MB) + file uploads (≤25 MB)** — [data-model.md](data-model.md)
- **Search per channel** — [data-model.md](data-model.md)
- **Forum channels (posts + reply threads)** — [forum.md](forum.md)
- **Typing indicators (channel + DM)** — [client.md](client.md)
- **Pin / unpin channels** — [client.md](client.md)
- **Direct messages (federated outbox)** — [federation.md](federation.md), [data-model.md](data-model.md)
- **E2E encrypted DMs (1:1 + group sender keys)** — [e2e-encryption.md](e2e-encryption.md)
- **Friends (local + cross-hub via stored hub URL)** — [federation.md](federation.md)

### Voice (in any channel — every channel is unified text + voice)
- **Opus codec + UDP relay (desktop / Android)** — [voice.md](voice.md)
- **Web voice via WebSocket Opus relay (browser)** — [voice.md](voice.md), [browser-client.md](browser-client.md), [decisions.md](decisions.md)
- **RNNoise denoise + VAD** — [voice.md](voice.md)
- **Push-to-talk** — [voice.md](voice.md)
- **Audio quality profiles (Standard / Music / Custom)** — [voice-advanced-settings.md](voice-advanced-settings.md)
- **Self-mute / self-deafen** — [voice.md](voice.md)
- **Voice participant list in sidebar** — [client.md](client.md)
- **Per-participant volume / proximity voice** — [voice-volume.md](voice-volume.md), [proximity-voice.md](proximity-voice.md)
- **Whisper (targeted voice to users/channels/lists)** — [whisper.md](whisper.md)
- **AFK channel (auto-move idle voice users)** — [afk-channel.md](afk-channel.md)
- **Video / webcam in voice channels** — [video-voice.md](video-voice.md)
- **Voice transport v2 (WebTransport + E2E, shipped 2026-08-07)** — [voice-transport-v2.md](voice-transport-v2.md)
- **Cross-hub voice in alliance channels (shipped: hub 2026-08-22, web 2026-08-29)** — [alliances.md](alliances.md)
- **Networked voice fix + voice encryption plan** (Phase 1 shipped; Phases 1.5/2 superseded by voice-transport-v2) — [voice-networking-design.md](voice-networking-design.md)
- **Screen share** — [screen-share.md](screen-share.md) (v1 transport), [screen-share-webrtc.md](screen-share-webrtc.md) (v2 WebRTC)
- **Screen share unified modal (desktop, designed)** — [screen-share-modal.md](screen-share-modal.md)

### Federation
- **Hub-to-hub auth** — [identity.md](identity.md), [federation.md](federation.md)
- **Alliances (multi-hub groups)** — [alliances.md](alliances.md)
- **Shared channels across alliance** — [alliances.md](alliances.md)
- **Voice in alliance channels (shipped: hub 2026-08-22, web 2026-08-29)** — [alliances.md](alliances.md) "Voice in alliance channels"
- **Federated DMs (outbox model)** — [federation.md](federation.md)
- **Federated reactions on alliance reads** — [federation.md](federation.md)
- **Forum post federation across alliances** — [forum.md](forum.md) §9 (shipped 2026-07-19)
- **Certification relay inside a farm (shipped 2026-08-29)** — [hub-certifications.md](hub-certifications.md) §11
- **Farm multi-node data plane (designed, not built)** — [farm-model.md](farm-model.md) "Multi-node data plane"

### Hosting & ecosystem
- **Farm → Server → Hub deployment model** — [farm-model.md](farm-model.md), [farm-impl.md](farm-impl.md), [architecture.md](architecture.md)
- **Setting a hub up** — `wavvon-hub setup` on your own machine, or `WAVVON_TEMPLATE_FILE`/`WAVVON_TEMPLATE` on first run — [hub-operator-guide.md](hub-operator-guide.md). The web wizard that once did this is superseded ([hub-creation-wizard.md](hub-creation-wizard.md))
- **Hub discovery (search, provider listings)** — [hub-discovery.md](hub-discovery.md), [discovery-v2.md](discovery-v2.md). Uptime probing was built and removed; see [decisions.md](decisions.md)
- **Server tags & portable badges** — [server-tags.md](server-tags.md); **user-configurable trust roots (designed, not built)** — same doc, Part 4
- **Database abstraction layer (trait-based store)** — [store-trait-design.md](store-trait-design.md)
- **Bots & integrations** — [bots.md](bots.md)
- **Bot capability layer (grants, game modal, media injection)** — [bot-capability-layer.md](bot-capability-layer.md)
- **Gaming platform** — [gaming.md](gaming.md), [bot-capability-layer.md](bot-capability-layer.md)
- **Protocol contract (REST + WebSocket)** — [`../openapi.yaml`](../openapi.yaml) (REST), [ws-protocol.md](ws-protocol.md) (full WS message reference)

### Notifications & UI
- **Three-state notifications (all / mentions / silent)** — [data-model.md](data-model.md), [client.md](client.md), [decisions.md](decisions.md)
- **Quiet hours / DND (notification downgrade)** — [block-mute-ignore.md](block-mute-ignore.md)
- **System tray + OS notifications + sound** — [client.md](client.md)
- **Window title unread count** — [client.md](client.md)
- **Themes (Calm / Classic / Linear / Light)** — [client.md](client.md)
- **Custom user skins** — [custom-themes.md](custom-themes.md)
- **Quick channel switcher (Ctrl+K)** — [client.md](client.md)
- **Hub drag-drop reorder, /info preview, clear local data** — [client.md](client.md)
- **Client QoL (search, drafts, emojis, events, polls, threads)** — [client-qol.md](client-qol.md)
- **Events (RSVP, role-slot sign-ups, reminders, hub-wide, propagation, voice-move staging)** — [events.md](events.md)

### Future direction (designed, not built)
- **Anti-spam proof-of-work** — [future-features.md](future-features.md), [hub-certifications.md](hub-certifications.md)
- **Home hub list (personal-axis state, DM canonicalization)** — [home-hub.md](home-hub.md)
- **Screen share unified modal (desktop)** — [screen-share-modal.md](screen-share-modal.md)
- **Gaming tails** — [bot-capability-layer.md](bot-capability-layer.md) §10–§11. (This line used to name a "Gaming Tier 3 (persistent shared world)" wishlist item; `gaming.md` no longer has a tier model and the roadmap had no such entry.)

## How to use this wiki

- **For LLMs**: each file is self-contained and small enough to read whole.
  File:line pointers (e.g. `hub/src/routes/messages.rs:42` in
  Wavvon-server) lead to authoritative code. Don't copy code from the
  wiki — read the source.
- **For humans**: same, but you can also follow the markdown cross-links.

## How to maintain this wiki

- **Add a "why" before a "what"**. If something is obvious from the code
  (a function name, a type signature), don't repeat it here.
- **File:line pointers, not code copies**. Code rots; pointers force you
  to look at current source.
- **Update on intent change, not on code change**. If the *reason* a thing
  exists changes, update the wiki. Renaming a function? Don't bother.
- **Keep files under ~200 lines**. Split when they grow past that.
- **Mark superseded docs, don't delete them**. A removed feature keeps its
  design doc with an archived banner pointing at the decision that
  removed it.

## Related docs

- [`../ROADMAP.md`](../ROADMAP.md) — index of [next-up](next-up.md) / [future-features](future-features.md) / [wishlist](wishlist.md), plus Won't do
- [`../README.md`](../README.md) — public-facing project intro
