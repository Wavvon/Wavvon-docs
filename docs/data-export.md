# Personal Data Export — Full Archive

Extend the shipped identity backup into a complete, portable,
passphrase-encrypted archive of everything on the user's **personal
axis**: identity, home-hub designations, prefs, devices, and decrypted
DM history. Data sovereignty as a checkable feature, not a promise.

**Status: export implemented on web (v1); import deferred.** See
"Implementation notes" below.

---

## 0. Implementation notes (web, v1)

- **Envelope**: the web client ships its own self-contained
  `wavvon-archive` envelope (`apps/web/src/utils/archiveCrypto.ts`) —
  Argon2id (64 MiB / t=3 / p=1 / 32-byte key, same parameters as
  desktop's `identity_cmd.rs`) → AES-256-GCM via WebCrypto, with a
  `format`/`version` header. It does **not** byte-match the desktop
  identity-backup envelope; the two are structurally similar but
  distinct formats. **Cross-client compatibility (desktop reading a
  web archive, or vice versa) is deferred** — needs a shared envelope
  spec first if ever wanted.
- **Prefs**: closed. `packages/core/src/identity/master.ts` now ports
  `derive_blob_key`/`decrypt_prefs` (HKDF-SHA256 + AES-256-GCM, byte-
  identical to `apps/desktop/src-tauri/src/prefs_blob.rs` — pinned by a
  vector generated directly against `wavvon_identity`/`prefs_blob.rs`
  in `master.test.ts`/`wire.test.ts`, since no vector previously existed
  in this doc). `apps/web/src/utils/dataExport.ts` fetches the
  `SignedPrefsBlob` from `/identity/{master_pubkey}/prefs`, verifies its
  signature, and decrypts it into `prefs.hub_synced` (blocked users,
  cross-device voice settings) — `gap_note` is now only set for the one
  remaining case a *paired* device can't do itself (no local entropy to
  derive the blob key from; only the entropy-holding device can). A
  404 (nothing published yet) is an empty `hub_synced: null`, not a gap.
  Custom themes do **not** ride inside this blob — the desktop
  `LocalPrefs` struct only carries `blocked_users`/`voice_settings`; they
  stay a separate, already-covered archive section (§2, `themes`).
- **Home hubs / devices**: `home_hubs.designations` and
  `devices.subkey_certs`/`revocations` are plaintext, signed records
  (not E2E ciphertext) fetched read-only from the active hub's existing
  `/identity/{pubkey}/...` routes — no new server surface. A missing
  designation (404, e.g. a single-hub user who never configured one)
  is an empty result, not an abort. These routes are keyed by the
  HKDF-derived **master** pubkey, not the device/canonical pubkey DMs
  use — v1 originally queried them with the wrong (device) pubkey for
  entropy-holding identities, silently returning empty designation/device
  sections; fixed alongside the prefs-blob work since both need the same
  `resolveMasterPubkey()`.
- **DM attachments**: dropped from the exported message bodies (v1
  ships identity/direction/body only) rather than embedding or
  inventing a URL-reference scheme — see §6.
- **Import/restore (§5) is not built.** Export only in this pass.

## 1. The architectural constraint that shapes everything

Prefs blobs and DMs are end-to-end encrypted — **home hubs store
ciphertext they cannot read** ([home-hub.md](home-hub.md),
[e2e-encryption.md](e2e-encryption.md)). Therefore a hub-side "export
my data" endpoint can only ever produce ciphertext. The only place a
readable archive can be assembled is the **client**, which holds the
master seed. This is a feature: the export path proves the E2E claims.

So: the client fetches everything it can already fetch, decrypts
locally, bundles, and re-encrypts under a user-chosen passphrase.
**No new server-side export machinery**; at most additive pagination
params on existing fetches.

## 2. Archive format

One file: `wavvon-archive-<date>.json.enc` — the **same envelope as
the shipped identity backup** (Argon2id 64MiB/t=3/p=1 → AES-256-GCM,
`identity_cmd.rs` / its web equivalent), versioned so both backup
kinds are distinguishable on import. Inside, one pretty-printed JSON
document:

```jsonc
{
  "version": 1,
  "kind": "full-archive",          // identity backup uses its existing kind
  "exported_at": 0,
  "identity": { … },               // exactly today's identity-backup payload
  "home_hubs": { "designations": […] },
  "devices": { "subkey_certs": […], "revocations": […] },
  "prefs": { … },                  // DECRYPTED prefs blob: hub list, voice
                                   // settings, theme, blocked/muted/ignored
  "dms": [                         // decrypted, grouped by peer
    { "peer_pubkey": "…", "messages": [ { "sent_at": 0, "direction": "in|out", "body": "…" } ] }
  ],
  "themes": [ … ],                 // custom themes/skins
  "drafts": { … }                  // local drafts, if any exist on this device
}
```

JSON (not zip): the personal axis is text — even years of DMs are
megabytes, and a single self-describing document stays greppable and
future-proof. DM **attachments** are referenced by URL, not embedded
(v1; see §6).

## 3. What's included / excluded

**Included** — everything the two-axis model calls personal
([home-hub.md](home-hub.md) §"What lives on the home hub list"):
identity + recovery material, home-hub designations, device certs and
revocations, the decrypted prefs blob (which already carries the hub
list, blocked/muted/ignored, voice settings, theme choice), DM
history, custom themes, local drafts.

**Excluded, deliberately**: community-axis content. Messages you wrote
in community channels live on those hubs among everyone else's; a
personal archive that embeds slices of shared channels raises consent
questions and requires per-hub crawling. "Export my own messages from
hub X" is a separate, hub-side feature if ever wanted (§6).

## 4. Export flow (client)

1. User sets a passphrase (same strength hinting as identity backup —
   the archive contains **plaintext DMs**, warn accordingly).
2. Fetch: designations, device certs/revocations, prefs blob (existing
   routes in `hub/src/routes/identity.rs`); DM history via the
   existing DM fetch, paginated to completion (if the route lacks
   `before`/`limit` params, add them — additive).
3. Decrypt prefs + DMs with existing client crypto; assemble the
   document; encrypt; download (web: Blob download; desktop: existing
   save-dialog pattern).
4. Progress UI over the DM pagination loop; a partial fetch aborts the
   export rather than silently producing an incomplete archive.

Surface: `IdentityBackupSection.tsx` (already on web AND desktop)
gains a second card — "Full archive" — beside the identity backup.

## 5. Import semantics (v1)

- **Identity + prefs restore**: on a fresh device, importing a full
  archive does everything today's identity import does, then restores
  the prefs blob (re-encrypt, `PUT` to the home hub) — so blocked
  lists, hub list, and theme survive even if every prior device is
  gone.
- **DM history is restore-to-read, not re-upload**: envelopes on the
  home hub are addressed storage the hub manages; a fresh device
  re-syncs live history from the home hub if it exists. The archive's
  DM section is the *survivor copy* for when the home hub is gone —
  readable in the archive itself (pretty JSON), with an in-app
  archive viewer deferred (§6).

## 6. Deferred

- **DM attachment embedding** — size/complexity; v1 keeps URLs.
- **In-app archive viewer** — read an archive's DMs inside the client
  without importing; v1 relies on the JSON being human-readable.
- **"Export my own messages" from a community hub** — hub-side,
  consent-scoped to the requester's own authorship; undesigned.
- **Scheduled/automatic exports** — pairs naturally with the desktop
  client era; manual on web.

---

## Decisions

- **Client-side assembly, no hub export endpoint.** The hub only holds
  ciphertext for the data that matters most (prefs, DMs) — a hub-side
  export is structurally impossible without breaking E2E, and the
  client-side path doubles as proof the E2E design is real.
- **Reuse the identity-backup envelope (Argon2id + AES-256-GCM).**
  One passphrase-wrapper format, already shipped on both web and
  desktop, already reviewed; a versioned `kind` field distinguishes
  archive types on import.
- **Single JSON document, not an archive container.** Personal-axis
  data is small text; self-describing JSON survives tooling churn and
  stays human-readable — which *is* the sovereignty feature.
- **Community content excluded.** Shared-space content is not personal
  data; embedding it raises consent questions and per-hub crawling
  complexity for marginal benefit.
- **DM restore is read-only.** Re-uploading envelopes would need new
  hub write paths for historical data; the home hub already re-syncs
  live devices, and the archive covers the hub-loss case by being
  readable itself.
