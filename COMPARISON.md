# Wavvon — Feature Comparison

How Wavvon compares to other voice/text chat platforms, feature by
feature. Kept factual and up to date as features land.

---

## At a glance

| Feature | **Wavvon** | Discord | Slack | Matrix / Element | TeamSpeak | Mumble |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Open source** | ✅ fully | ❌ | ❌ | ✅ | ❌ (server) | ✅ |
| **Self-hostable** | ✅ | ❌ | ⚠️ enterprise only | ✅ | ✅ | ✅ |
| **Federated / decentralized** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **No account required** | ✅ keypair identity | ❌ email + account | ❌ email + account | ⚠️ optional guest | ❌ account | ❌ account |
| **Voice channels** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Text channels** | ✅ | ✅ | ✅ | ✅ | ⚠️ basic | ⚠️ basic |
| **Screen share** | ✅ desktop (web in progress) | ✅ | ✅ | ✅ | ❌ | ❌ |
| **E2E encrypted DMs (1:1)** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **E2E encrypted group DMs** | ✅ sender-key | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Multi-device** | ✅ QR pairing | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Cross-community federation** | ✅ Alliances | ❌ | ❌ | ✅ rooms | ❌ | ❌ |
| **Community roles & permissions** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ basic |
| **Bots & webhooks** | ✅ | ✅ | ✅ | ✅ | ⚠️ limited | ❌ |
| **In-community games / activities** | ✅ | ✅ Activities | ❌ | ❌ | ❌ | ❌ |
| **Desktop client (native)** | ✅ Tauri | ✅ Electron | ✅ Electron | ✅ Electron | ✅ | ✅ |
| **Browser client** | ⚠️ functional, parity in progress | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Mobile (iOS / Android)** | ⚠️ Android beta, no iOS | ✅ | ✅ | ✅ | ✅ | ⚠️ 3rd party |
| **Free — no premium tier** | ✅ always free | ⚠️ Nitro upsell | ⚠️ message limits | ✅ | ⚠️ slot limits | ✅ |
| **Data owned by the community** | ✅ | ❌ | ❌ | ✅ (self-hosted) | ✅ (self-hosted) | ✅ (self-hosted) |
| **OpenTelemetry observability** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Anti-spam lobby + PoW** | ✅ | ⚠️ phone verify | ❌ | ❌ | ❌ | ❌ |

---

## Where Wavvon stands out

**Identity without accounts**
Your identity is a cryptographic keypair — no email, no password, no central service. Lose the recovery phrase and nobody can help you; keep it safe and nobody can take your identity away from you.

**True self-hosting with federation**
Run a hub on a home server, a VPS, or a Docker container. Your hub can form Alliances with other hubs to share channels and voice — without either hub losing control of its own data.

**Privacy by design**
1:1 DMs and group DMs are end-to-end encrypted at the protocol level using a sender-key scheme. The hub operator stores opaque ciphertexts and never sees message content. Forward secrecy (Double Ratchet) is the next planned upgrade.

**No business model that conflicts with users**
No premium tiers, no telemetry, no ads. The software is free forever; operators pay for their own infrastructure, not a subscription.

**Small binary, real native performance**
The hub is a single static Linux binary (~30 MB musl). The desktop client is Tauri (not Electron) — a fraction of the RAM footprint, native OS APIs, real audio pipeline with RNNoise denoising.

---

## Honest limitations (today)

| Limitation | Status |
|---|---|
| iOS client | Not started |
| Android client | Beta — CI builds APKs; full feature parity work in progress |
| E2E forward secrecy | Sender-key (group) and static-ECDH (1:1) are shipped; Double Ratchet upgrade not yet started |
| Windows installer unsigned | SmartScreen warning until Authenticode cert is procured (SignPath OSS application submitted) |
| macOS DMG unsigned | Gatekeeper warning until Apple Developer signing is set up |
| No push notifications | Clients must be open to receive messages |
| Voice is LAN/local only today | The hub voice relay does not yet learn real client network addresses, so voice works when client and hub share a network/machine; cross-internet voice and voice encryption are the next voice-stack work |
| Web client parity | The browser client is functional but behind the desktop client on some features (admin panel, screen-share viewing, in-channel search); active remediation in progress |

---

*All product names and trademarks are the property of their respective
owners. This comparison is independent, reflects publicly documented
features as of the date below, and implies no affiliation with or
endorsement by any of the products mentioned. Spotted an error? Please
open an issue.*

*Last updated: 2026-06-11 — v0.2.0*
