# Glossary

Wavvon terms, alphabetized.

**Alliance** — a named group of peer hubs sharing channels, reactions,
forum posts and voice. Wavvon's differentiator. See
[alliances.md](alliances.md).

**Channel** — a place in a hub, with a `channel_type`: text, voice,
forum, banner or spawner. Voice happens only in `voice` channels.
Categories (`is_category` channels) are containers that hold other
channels but no messages. Channels can be shared with an alliance.

**Federation** — the umbrella term for hub-to-hub communication. Today
covers federated DMs and alliance message sharing. See
[federation.md](federation.md).

**Hub** — a single Wavvon server instance. One community lives in one
hub. Hubs are independent — no central authority.

**Hub farm** — one operator running many hubs on shared
infrastructure, behind one reverse proxy with farm-level sign-in. Partly
built (Wavvon-server: `crates/farm`, `crates/agent`); see
[farm-model.md](farm-model.md).

**Identity** — an Ed25519 keypair. Your identity is your public key. See
[identity.md](identity.md).

**Invite token** — a signed blob a hub admin generates to grant another
hub permission to join an alliance. Delivered out of band.

**Outbox** — the `dm_outbox` table holding pending federated DMs. The
DM worker drains it.

**Peer** / **peer hub** — another hub this hub knows about (URL +
pubkey). Stored in `peers`.

**Recovery phrase** — 24 BIP39 words that deterministically yield an
Ed25519 keypair. The phrase **is** the identity; pasting it on a device
replaces that device's identity.

**Role** — a bundle of permissions assigned to users. Custom per hub.
Roles have priority for moderation hierarchy.

**Three-state notifications** — per-scope notification mode: all /
mentions only / silent. The scope is a channel, DM, or hub.

**Voice (in a channel)** — "in voice" means a user has joined the
real-time audio room of a `voice` channel (capability `channels.voice`).
The hub relays end-to-end encrypted Opus over WebTransport (UDP 3001 by
default), an SFU-style fan-out (Wavvon-server: `crates/hub/src/voice_wt.rs`).
See [voice.md](voice.md).
