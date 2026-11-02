# Admin Panel Auth — Archived

This design (Ed25519 challenge-signing + TOTP for a hub web admin panel) was
designed and implemented, then reverted.

**Reason:** The hub web admin panel was removed entirely. Hub management belongs
in the client. Hub ownership is bootstrapped by the hub itself (a fresh hub is
invite-only and prints a one-time first-boot owner invite), by
`WAVVON_OWNER_PUBKEY`, or by `wavvon-hub admin users set-owner` — no client
creates a hub, and no web panel is needed for any of it.

See `decisions.md` for the recorded decisions:
- "Hub admin panel removed"
- "Architecture: Farm → Server → Hub"

Farm administration is not covered by this doc: the farm's admin is a keypair
(`farm_admin_pubkey`, `WAVVON_FARM_ADMIN_PUBKEY`), not a static token.
