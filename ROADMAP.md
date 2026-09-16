# Wavvon Roadmap

An index. The work itself is split by **how committed we are** — one question,
one answer, so an item has exactly one home.

| | | |
|---|---|---|
| **Issues** ([server](https://github.com/Wavvon/Wavvon-server/issues), [clients](https://github.com/Wavvon/Wavvon-clients/issues)) | designed, plus the open bugs | what we're working on |
| **[Future features](docs/future-features.md)** | intent settled, design pending | what we'll work on |
| **[Ideas](https://github.com/Wavvon/Wavvon-docs/discussions/categories/ideas)** | not committed to | what we might do |

An item moves right to left as it earns it: an idea we decide to pursue
becomes a future feature, and becomes an issue once it is designed.

Since 2026-09-16 the two ends of that line are on GitHub rather than in
Markdown — an item a stranger could act on belongs where a stranger can find
it, and a fix can close an issue but not a bullet. Why, and what was weighed
against it, is in [decisions.md](docs/decisions.md); how the issues and
milestones are used day to day is in [CONTRIBUTING.md](CONTRIBUTING.md).

**How an issue closes**: `Fixes #123` in the PR body, on merge to `develop`.
**What a milestone means**: the version it ships in, closed when that tag
leaves `main`. Merged and released are different answers, and both are public.

Looking for something to pick up? **[`help
wanted`](https://github.com/search?q=org%3AWavvon+label%3A%22help+wanted%22+state%3Aopen&type=issues)**.

Everything else has its own home. Shipped work →
[shipped-log.md](docs/shipped-log.md), and nothing shipped stays in the three
files above. Rationale → [decisions.md](docs/decisions.md). Architecture and
design docs → the [wiki](docs/README.md).

## 💤 Won't do

Decisions, not plans — here so the same proposal does not come back every few
months. The reasoning lives in [decisions.md](docs/decisions.md).

- **Maintain / converge the old Android client** — removed 2026-07-12;
  clean-slate rewrite if mobile is prioritized
  ([android-rewrite-notes.md](docs/android-rewrite-notes.md)).
- **A Discord importer inside this workspace** — `crates/discord-import`
  deleted 2026-09-14. Its `export` half needed a real bot token and a real
  guild, which nobody could supply, so it was never exercised end to end while
  costing workspace, audit and release weight. Migration comes back, if it
  comes back, as a separate bot against the public API
  ([decisions.md](docs/decisions.md)).
- **SQLite (or any second) hub storage backend** — PostgreSQL is the only
  backend; a dual backend silently broke revocation and federated-ban checks,
  and two engines means two migration sets forever
  ([decisions.md](docs/decisions.md), 2026-08-08).
- **Load-aware DM routing across a user's hubs** — failover only.
- **Concurrent mic test while in voice** — the live meter covers it.
- **Central authority of any kind** — no global directory, identity service,
  or DHT.
- **Any hub-held copy of a master seed, however wrapped** — including the
  designed hub-hosted identity vault, rejected 2026-09-05. A hub may hold
  anything you signed or encrypted and nothing that can reconstitute you; a
  wrapped seed is the identity, one passphrase away. The two recovery paths
  are the 24 words and the `.wavvon-backup` file, and losing both is the
  user's loss to take ([decisions.md](docs/decisions.md),
  [identity-vault.md](docs/identity-vault.md)).
- **Syncing your own sent DMs to a second device** — a ratchet cannot decrypt
  its own envelopes, so the sending device holds the only readable copy. Of
  the three ways out, the stash sync died with the rejected identity vault,
  re-encrypting every message to your own DH key is a cross-repo wire-format
  change bought for a convenience, and the third — saying plainly that you
  sent it from another device — shipped 2026-09-05. Reopen only if someone
  asks, and then the price is the re-encryption
  ([decisions.md](docs/decisions.md)).
- **Subscriptions, premium tiers, or in-chat advertising.**
- **Telemetry collection or data sales.**
- **Global web-of-trust / negative reputation** — federated ban lists are
  opt-in per hub.
- **Badge / certification transitivity** ("hub C trusts whoever hub A
  trusts") — trust stays one hop, viewer-decided. Two docs reached this
  verdict independently ([server-tags.md](docs/server-tags.md),
  [hub-certifications.md](docs/hub-certifications.md) §10), so it was a
  decision filed as a deferral ([decisions.md](docs/decisions.md),
  2026-08-22).
- **A farm as a trust root for user reputation** — the farm wires its hubs
  to trust each other and stops there; it never holds standing itself, and
  it never auto-grants good standing across siblings
  ([hub-certifications.md](docs/hub-certifications.md) §11).
