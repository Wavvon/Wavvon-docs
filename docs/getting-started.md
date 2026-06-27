# Getting Started with Wavvon

Wavvon is a **self-hosted community platform** built around private voice,
text, and gaming. Unlike typical hosted platforms, you own your server and
your identity — no accounts, no phone numbers, just a cryptographic key pair
that is yours forever.

---

## Download

The Wavvon desktop app is available for Windows, macOS, and Linux from the
[Wavvon releases page](https://github.com/Wavvon/Wavvon-client/releases).

**Windows**: installers are currently **not code-signed** (signing for a
young open-source project is in progress — the CI signing pipeline is
already wired). SmartScreen will warn about an unrecognized app: click
**More info → Run anyway**. Builds are reproducible from the public
[Wavvon-client](https://github.com/Wavvon/Wavvon-client) monorepo (which
holds the desktop, web, and Android apps) via GitHub Actions.

**macOS / Linux**: notarization and GPG signing are planned for a future
release. On macOS, right-click the app and choose **Open** the first time;
on Linux, `chmod +x` the AppImage.

---

## Your identity

The first time you open Wavvon, it generates an **Ed25519 key pair** on your
device. The public key is your permanent identity across every hub and every
device — it never changes and is not tied to any account. The private key never
leaves your device.

**Multi-device**: if you want the same identity on a second device, use the
**Export identity** flow in Settings → Identity. Your identity is backed by a
master key; each device gets a signed subkey certificate so the hub can
recognise all your devices as the same user.

**Recovery**: write down your seed phrase shown during setup. If you lose your
device, import the seed on a new install to recover the same key.

---

## Joining a hub

A **hub** is a community server — the Wavvon equivalent of a server or
workspace. To join one you need its URL from the hub admin (e.g.
`https://hub.example.com`).

1. Click **Add hub** on the home screen (or **+** in the sidebar).
2. Enter the hub URL and press **Join**.
3. If the hub is open, you are joined immediately.
   If the hub requires admin approval, your request is queued and you see
   a "pending approval" state until the admin accepts.
4. If the hub has a **minimum PoW level**, the client automatically computes
   the required proof-of-work the first time you join — this may take a few
   seconds on slow hardware.

---

## Running your own hub

See [hosting.md](hosting.md) for the full guide. In brief:

```bash
# Docker (recommended)
docker run -d -p 3000:3000 -p 3001:3001/udp \
  -v wavvon-hub-data:/data ghcr.io/wavvon/hub:latest

# Or build from source
cargo build --release -p wavvon-hub
WAVVON_HTTP_PORT=3000 \
WAVVON_VOICE_UDP_PORT=3001 \
./target/release/wavvon-hub
```

The hub generates its own Ed25519 identity on first run and creates an SQLite
database (`hub.db`) in the working directory. A fresh hub has **no owner** —
set yours via `owner_pubkey` in `hub.toml` / `WAVVON_OWNER_PUBKEY`, or
`wavvon-hub admin users set-owner <pubkey>` after first boot (see the
[hub operator guide](hub-operator-guide.md)).

---

## Key concepts

| Concept | What it is |
|---------|-----------|
| **Identity** | Your Ed25519 key pair. One per person; shared across devices via signed subkey certs. |
| **Hub** | A community server. Self-hosted. Fully independent of other hubs. |
| **Channel** | A text/voice room inside a hub. Organised in a tree (categories > channels). |
| **Certification** | A hub's signed attestation that a user is "in good standing." Carries across hubs when certs are recognised. |
| **Badge** | A cosmetic award a hub admin grants a user (name, description, icon URL). |
| **Farm** | An optional multi-hub deployment. One farm, many hubs. Users, games, and identity follow them across all hubs on the farm. |
| **Alliance** | A voluntary federation between two hubs. Enables cross-hub mentions and (in v2) shared channels. |
| **PoW** | Proof-of-work. Some hubs require new users to compute a small hash puzzle before joining — a sybil-resistance measure with no central authority needed. |

---

## Privacy

- **No telemetry.** The desktop app and hub server send no data to Wavvon HQ.
- **No accounts.** Your identity is a local key pair; nothing is registered
  with a central authority.
- **E2E encryption on DMs.** 1-to-1 and group DMs are end-to-end encrypted
  using a sender-key scheme. The hub relays ciphertext only.
- **Hub data.** All community data lives on the hub operator's server.
  Choose a hub you trust, or run your own.
