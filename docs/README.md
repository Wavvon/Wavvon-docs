# Voxply Docs

A navigable map of Voxply for humans and LLMs. Optimized for **why** and
**where**, not **what** — code is authoritative for what; this wiki tells
you the rationale and points you to the right files.

## Reading order

If you're new, read in this order:

1. [architecture.md](architecture.md) — what runs where, the four repos (hub server, the Voxply-client monorepo, docs, discovery) and the crates inside Voxply-server
2. [identity.md](identity.md) — keypairs, recovery, auth
3. [federation.md](federation.md) — how hubs talk to each other
4. [alliances.md](alliances.md) — multi-hub groups (Voxply's differentiator)
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

### Onboarding & anti-abuse

- [lobby-bot-survey.md](lobby-bot-survey.md) — security-level lobby, "not a bot" challenge, role questionnaire (built)

### Built features (design docs)

These shipped — the doc is the design rationale behind the code (see
[`../ROADMAP.md`](../ROADMAP.md) "Recently shipped" for the delivery log):

11. [farm-model.md](farm-model.md) — multi-hub server layer + 5-layer architecture
    - [farm-impl.md](farm-impl.md) — Phase 1 + 2 + 3 implementation design (auth move, multi-tenancy, creation policy)
    - [hub-creation-wizard.md](hub-creation-wizard.md) — signed config templates, hub first-run bootstrap, web creation wizard at `/new`
12. [gaming.md](gaming.md) — game distribution platform: tiers, registry, hub admin install + permissions, six-call SDK, farm-level games (Tiers 1–2 built; Tier 3 is wishlist)
    - [games-sdk.md](games-sdk.md) — postMessage API reference for third-party developers
13. [multi-device.md](multi-device.md) — master+subkey identity, QR pairing protocol
14. [e2e-encryption.md](e2e-encryption.md) — E2E encrypted DMs: X25519 from Ed25519 seed, static ECDH + AES-GCM, signed envelopes, group sender keys
    - [identity-recovery.md](identity-recovery.md) — recovery UX beyond the phrase: passphrase-wrapped `.voxply-backup` export/import + per-hub recovery contacts (vouch, not auto-grant)
    - [wire-format.md](wire-format.md) — canonical byte-level spec for all signed envelopes in the identity crate (multi-device + E2E DM + identity verification); test vectors for client implementors
15. [server-tags.md](server-tags.md) — self-tags (discovery keywords) + portable signed hub badges
    - [hub-certifications.md](hub-certifications.md) — anti-spam Layer 2: hub-signs-user reputation certs, portable PoW credit
    - [moderation-enhancements.md](moderation-enhancements.md) — federated ban lists (signed, opt-in), auto-moderation webhook (fail-open), content reporting queue
16. [browser-client.md](browser-client.md) — second client (no Tauri), platform adapter, IndexedDB identity
17. [android-client.md](android-client.md) — Tauri 2 Android wrapper around the browser platform layer, side-loaded APK
    - [install-android.md](install-android.md) — end-user guide: enable unknown sources, download APK, Play Protect warning
    - [client-monorepo.md](client-monorepo.md) — **shipped (2026-06-13)**: the three client repos were consolidated into the one pnpm-workspace Voxply-client monorepo (`packages/core|ui|platform|i18n` + `apps/*`); staged migration, git-subtree history preservation, CI/release/updater cutover. Hub server stays separate. See [decisions.md](decisions.md).
18. [bots.md](bots.md) — external bot ecosystem: invite-by-pubkey, slash commands, webhook dispatch, per-hub directory
19. [accessibility.md](accessibility.md) — keyboard navigation, ARIA / screen-reader support, i18n strategy across desktop / web / Android
20. [forum.md](forum.md) — forum channel type: post-list variant, posts + reply threads, `create_posts`/`manage_posts` permissions, FTS search
21. [banner-channels.md](banner-channels.md) — banner channel type: full-width image rows in the hub sidebar (decorative chrome, hub-uploaded or external URL), drag-drop ordered like regular channels
22. [screen-share-webrtc.md](screen-share-webrtc.md) — screen share v2: WebRTC P2P, hub as SDP/ICE signaler, optional TURN, v1-relay fallback floor, multi-sharer
23. [block-mute-ignore.md](block-mute-ignore.md) — user-level block / ignore / quiet-hours (DND): personal-axis prefs-blob state, client-side filtering, server-enforced DM block
24. [discovery-v2.md](discovery-v2.md) — Voxply-discovery enhancements: hub uptime tracking, farm browsing, global search, anonymous aggregate analytics
25. [client-qol.md](client-qol.md) — client quality-of-life: global search, drafts, custom emojis, events, polls, thread collapse, notification grouping
26. [store-trait-design.md](store-trait-design.md) — database abstraction: trait-based store, crate split (voxply-store / voxply-store-sqlite, voxply-store-postgres as future community contribution), migration path
27. [custom-themes.md](custom-themes.md) — user-created skins: CSS token system, .voxplyskin file format, export/import, persistence
28. [brand.md](brand.md) — motto, one-liner, logo brief and asset checklist (final logo asset still pending)

### Future direction (designed, not built)

- [home-hub.md](home-hub.md) — personal-axis state: home hub list, replication, DM canonicalization
- [screen-share-modal.md](screen-share-modal.md) — unified desktop screen-share picker: Tauri `list_capture_sources` command, thumbnail grid, single-modal UX replacing the current two-step OS overlay
- [future-features.md](future-features.md) — anti-spam PoW, deferred bot scope, other backlog designs

### Archived designs

Kept for history; superseded by recorded decisions:

- [hub-admin-panel.md](hub-admin-panel.md) — **archived**: the hub web admin panel (`/admin/panel`) was removed; the admin CLI and farm console remain. See [decisions.md](decisions.md) ("Hub admin panel removed").
- [admin-panel-auth.md](admin-panel-auth.md) — **archived**: the Ed25519+TOTP web-panel auth design was built, then reverted along with the panel itself. See [decisions.md](decisions.md).
- [monetization.md](monetization.md) — **superseded in part**: missions, sparks, and the cosmetic catalog were removed; Voxply operates no monetization infrastructure. See [decisions.md](decisions.md) ("Missions, sparks, and cosmetic catalog removed").

## Find by feature

Reading order is for learning the system end-to-end. This section is for
"I know what I'm looking for" lookups. A feature can span multiple docs.

### Identity & access
- **Keypair, recovery phrase, auth** — [identity.md](identity.md)
- **Identity backup & recovery contacts** — [identity-recovery.md](identity-recovery.md)
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
- **Video / webcam in voice channels** — [video-voice.md](video-voice.md)
- **Networked voice fix + voice encryption plan** (design only) — [voice-networking-design.md](voice-networking-design.md)
- **Screen share** — [screen-share.md](screen-share.md) (v1 transport), [screen-share-webrtc.md](screen-share-webrtc.md) (v2 WebRTC)
- **Screen share unified modal (desktop, designed)** — [screen-share-modal.md](screen-share-modal.md)

### Federation
- **Hub-to-hub auth** — [identity.md](identity.md), [federation.md](federation.md)
- **Alliances (multi-hub groups)** — [alliances.md](alliances.md)
- **Shared channels across alliance** — [alliances.md](alliances.md)
- **Federated DMs (outbox model)** — [federation.md](federation.md)
- **Federated reactions on alliance reads** — [federation.md](federation.md)

### Hosting & ecosystem
- **Farm → Server → Hub deployment model** — [farm-model.md](farm-model.md), [farm-impl.md](farm-impl.md), [architecture.md](architecture.md)
- **Hub creation (config templates, first-run bootstrap, web wizard)** — [hub-creation-wizard.md](hub-creation-wizard.md)
- **Hub discovery (uptime, search, farm catalog)** — [hub-discovery.md](hub-discovery.md), [discovery-v2.md](discovery-v2.md)
- **Server tags & portable badges** — [server-tags.md](server-tags.md)
- **Database abstraction layer (trait-based store)** — [store-trait-design.md](store-trait-design.md)
- **Bots & integrations** — [bots.md](bots.md)
- **Gaming platform (tiers, SDK, sandbox)** — [gaming.md](gaming.md), [games-sdk.md](games-sdk.md)
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

### Future direction (designed, not built)
- **Anti-spam proof-of-work** — [future-features.md](future-features.md), [hub-certifications.md](hub-certifications.md)
- **Home hub list (personal-axis state, DM canonicalization)** — [home-hub.md](home-hub.md)
- **Screen share unified modal (desktop)** — [screen-share-modal.md](screen-share-modal.md)
- **Gaming Tier 3 (persistent shared world)** — [gaming.md](gaming.md), [`../ROADMAP.md`](../ROADMAP.md) wishlist
- **E2E v2 — Double Ratchet (forward secrecy)** — [e2e-encryption.md](e2e-encryption.md), [`../ROADMAP.md`](../ROADMAP.md) wishlist

## How to use this wiki

- **For LLMs**: each file is self-contained and small enough to read whole.
  File:line pointers (e.g. `hub/src/routes/messages.rs:42` in
  Voxply-server) lead to authoritative code. Don't copy code from the
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

- [`../ROADMAP.md`](../ROADMAP.md) — what's next, known issues, undesigned wishlist
- [`../README.md`](../README.md) — public-facing project intro
