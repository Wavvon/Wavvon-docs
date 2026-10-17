# Personal Data Export — Full Archive

Extend the shipped identity backup into a complete, portable,
passphrase-encrypted archive of everything on the user's **personal
axis**: identity, home-hub designations, prefs, devices, and decrypted
DM history. Data sovereignty as a checkable feature, not a promise.

**Status: export and import on web and desktop, one format (v1).** An archive
made on either client opens on the other ([Wavvon-clients#35](https://github.com/Wavvon/Wavvon-clients/issues/35),
decision in [decisions.md](decisions.md), "Desktop restores a full archive by
merge-or-create, in the web's format"). The shared pieces live in Wavvon-clients:
the envelope in `packages/core/src/identity/archive.ts`, the document type, its
validation and the merge rule (`parseArchiveDocument`, `planRestore`) in
`packages/ui/src/utils/fullArchive.ts`, the UI in `packages/ui`'s
`FullArchiveSection`. Desktop's Rust half is `apps/desktop/src-tauri/src/archive.rs`.

---

## 0. Implementation notes (v1)

- **Envelope** — `wavvon-archive`, version 1. Plain JSON, every binary
  field standard base64 with padding:

  ```jsonc
  {
    "format": "wavvon-archive",
    "version": 1,
    "kdf": { "alg": "argon2id", "m": 65536, "t": 3, "p": 1, "salt": "<16 bytes>" },
    "cipher": { "alg": "aes-256-gcm", "nonce": "<12 bytes>" },
    "ciphertext": "<AES-256-GCM output, 16-byte tag appended>"
  }
  ```

  Key = Argon2id v0x13 over the UTF-8 passphrase, `m` KiB / `t` passes /
  `p` lanes, 32-byte output — the same parameters as `.wavvon-backup`.
  The plaintext is the UTF-8 archive document; no associated data. A reader
  refuses anything whose `format` is not `wavvon-archive` (an identity backup
  has no `format` field, which is how the two are told apart), treats any
  other `version` as "made by a newer Wavvon", and reads `m`/`t`/`p` from the
  file rather than assuming them. The file is the envelope pretty-printed,
  named `wavvon-archive-<YYYY-MM-DD>.json.enc`.

  **Shared test vector**, asserted by `archive.test.ts` (core) and
  `archive.rs`'s `shared_test_vector_matches_typescript`:

  | Input | Value |
  |---|---|
  | passphrase | `correct horse battery staple` |
  | salt (hex) | `000102030405060708090a0b0c0d0e0f` → `AAECAwQFBgcICQoLDA0ODw==` |
  | nonce (hex) | `101112131415161718191a1b` → `EBESExQVFhcYGRob` |
  | plaintext | `{"kind":"full-archive","version":1,"drafts":{"hub/chan":"héllo"}}` (UTF-8; the `é` pins the encoding) |
  | ciphertext | `Z09mUE8r16LXBD5sK5AIBC9ibH1qYOmuCEGeyBKECZtAjAqdiQ2whqQvi9rfblE958JzUnfEfX914HqmzOzkkVgqoN0g34v3b+vz7Z/m70IWjA==` |

  The vector pins the envelope, not the document: JSON serialisers differ
  in key order and spacing, so the two clients agree on the document's
  *shape* (§2), checked by `parseArchiveDocument` and its Rust mirror
  `validate_document`, which refuse the same files with the same error codes.
- **Desktop keeps the seed in Rust.** Export: the renderer gathers what only
  it holds (DM plaintext through the existing `get_dm_messages`, drafts, the
  mention-ping switch) and `export_full_archive` adds the identity, the
  hub-synced prefs, the hub list / ignored users / voice gains / custom theme
  and the hub records, then encrypts and writes. Restore: `open_full_archive`
  decrypts, resolves the identity to an account — **merge** into the one
  already on the device, or **create** it — and hands back the document
  *without* its identity; the renderer runs the shared `planRestore` and
  `apply_full_archive_restore` writes the result. A paired device's archive
  (its seed is a subkey, its master is someone else's) is refused when the
  device does not already hold that account: restored as an owned account it
  would be a different identity.
- **Desktop's local differences**, which the archive carries as-is: drafts
  and the mention-ping switch are device-wide on desktop rather than per
  account; desktop keeps one custom theme per account, so a restore fills an
  empty slot with the archive's first theme and counts the rest as skipped;
  voice gains are percent in the archive and a 0–2 multiplier in desktop's
  file.
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
  designation (404) is an empty result, not an abort. That is now the rare
  case rather than the common one: since 2026-09-05 both the cert and the
  designation are published on first connect, so an identity normally has
  both by the time it can reach this screen ([multi-device.md](multi-device.md)). These routes are keyed by the
  HKDF-derived **master** pubkey, not the device/canonical pubkey DMs
  use — v1 originally queried them with the wrong (device) pubkey for
  entropy-holding identities, silently returning empty designation/device
  sections; fixed alongside the prefs-blob work since both need the same
  `resolveMasterPubkey()`.
- **DM attachments**: dropped from the exported message bodies (v1
  ships identity/direction/body only) rather than embedding or
  inventing a URL-reference scheme — see §6.
- **DM history is one page per conversation** on both clients today: each
  conversation's messages come from a single fetch (web asks for 50,
  desktop takes the hub's default), not the paginated-to-completion walk
  §4 asks for.
- **Import/restore** follows §5 except for the prefs blob: the hub list,
  drafts, themes, ignored users, voice gains and mention-ping switch are
  merged locally (union — what the account already has wins); the
  hub-synced prefs are not re-uploaded but left to the home hub that
  already holds them, and DM history, the paired-device gap and the hub
  records are listed to the user as not restored.

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
