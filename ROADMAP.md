# Wavvon Roadmap

An index. The work itself lives in three files, split by **how committed we
are** — one question, one answer, so an item has exactly one home.

| | | |
|---|---|---|
| **[Next up](docs/next-up.md)** | designed, plus the open bugs | what we're working on |
| **[Future features](docs/future-features.md)** | intent settled, design pending | what we'll work on |
| **[Wishlist](docs/wishlist.md)** | not committed to | what we might do |

An item moves right to left as it earns it: an idea we decide to pursue
becomes a future feature, and gets designed into next-up.

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
- **SQLite (or any second) hub storage backend** — PostgreSQL is the only
  backend; a dual backend silently broke revocation and federated-ban checks,
  and two engines means two migration sets forever
  ([decisions.md](docs/decisions.md), 2026-08-08).
- **Load-aware DM routing across a user's hubs** — failover only.
- **Concurrent mic test while in voice** — the live meter covers it.
- **Central authority of any kind** — no global directory, identity service,
  or DHT.
- **Subscriptions, premium tiers, or in-chat advertising.**
- **Telemetry collection or data sales.**
- **Global web-of-trust / negative reputation** — federated ban lists are
  opt-in per hub.
