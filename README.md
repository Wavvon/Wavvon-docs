# Voxply — Documentation

A decentralized platform where players can hang out, talk, and play
together. Voice chat, text messaging, federated alliances of hubs, and
community-built games — all keypair-based identity, no central servers.

## Repositories

| Repo | Contents |
|---|---|
| **voxply-hub** | Hub server (`voxply-hub`), seed server (`voxply-seed`), identity crate (`voxply-identity`) |
| **voxply-desktop** | Tauri + React desktop client, voice crate (`voxply-voice`) |
| **voxply-docs** *(this repo)* | Architecture docs, ROADMAP, design decisions |

## Documentation

- [`docs/`](docs/README.md) — architecture, federation, identity,
  alliances, voice, data model, client structure, decisions, threat
  model, and glossary. Start at [`docs/README.md`](docs/README.md).
- [`ROADMAP.md`](ROADMAP.md) — what's next, known issues, undesigned
  wishlist, and explicit "won't do" decisions.

## Features

- **Channels** — unified text + voice in every room. Categories,
  drag-drop reorder, markdown, attachments, reactions, replies,
  mentions, edit/delete.
- **Voice** — Opus over UDP with RNNoise denoise, voice activity
  detection, push-to-talk, self-mute / self-deafen.
- **Direct messages** — federated outbox with retry, attachments,
  typing indicator, unread tracking.
- **Alliances** — multi-hub groups sharing channels and messages via
  federation.
- **Identity** — Ed25519 keypair, 24-word BIP39 recovery phrase, no
  accounts, no passwords.
- **Roles & moderation** — custom roles, ban / mute / timeout / kick,
  channel ban, voice mute, hub approval queue.
- **Security lobby** — PoW-gated entry, bot challenge (click + SVG
  puzzle), role questionnaire / onboarding survey.
- **Bots** — self-service bot creation, slash commands, webhook
  delivery.

## License

[GNU Affero General Public License v3.0](LICENSE).
