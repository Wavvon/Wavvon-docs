# Settings IA + profile model (unification design)

**Why this doc exists:** `SettingsPage` is the last app-local orchestrator
blocking two parity passes — `ProfileTab` and `IdentityBackupSection`
([client-parity.md](client-parity.md) skip table). Both can't hoist into
`packages/ui` because they sit on *diverged models*, not diverged props.
This doc inventories the fork, proposes one IA both clients render, records
the settled desktop-multi-account decision, and frames the remaining product
decisions before the engineers converge the code.

Authoritative code: web `apps/web/src/components/settings/` (in
Wavvon-clients); desktop `apps/desktop/src/components/SettingsPage.tsx` +
sections + `apps/desktop/src-tauri/src/identity_cmd.rs`.

## 1. Current-state inventory

**Web** (8 tabs, grouped nav: *Accounts / App / Audio & video*), multi-account
throughout — `SettingsPage` owns a managing-account selector shared across tabs
(`PerAccountProps`), accounts are IndexedDB rows + `wavvon:acct:<pubkey>:*`
localStorage namespaces:

| Tab | Contents |
|---|---|
| Profile | `ProfileEditorSection` (single default + per-hub `/me`, the 2026-07-12 tabbed card) + `MyCertificationsSection` |
| Accounts | switcher table, recovery phrase, `IdentityBackupSection`, `FullArchiveSection`, home hubs |
| Devices | paired devices, passkeys, trusted devices |
| Privacy | block / ignore |
| Notifications | mention ping toggle |
| Appearance | theme, skin editor, skins gallery, **language** |
| Voice / Camera | audio profile, devices, VAD/mic meter, PTT, camera bg (split into two tabs) |

**Desktop** (7 tabs, flat nav, no groups), single identity (`~/.wavvon/`
one file via `Identity::default_path()`; no account concept):

| Tab | Contents | Divergence |
|---|---|---|
| Profile | `ProfileTab` = **profile-pool model** (`NamedProfile[]`, per-hub assignment in `wavvon.hubProfiles` localStorage, apply-to-hub) | The pool `decisions.md` (2026-07-12) records as **deleted**. Stale. |
| Account | pubkey, clear local data, **public-profile publisher** (`save_public_profile` → signed `PublicHubProfile`) | Public-profile publisher is the *signed* system from the 2026-07-19 decision — parallel to web's unsigned `favorite_hubs` Hubs tab. |
| Appearance | theme, skin, language | aligned |
| Voice | audio profile, devices, VAD, camera bg, mode/PTT, **notify sound** | mention ping lives here, not a Notifications tab |
| Security | recovery phrase, `IdentityBackupSection`, restore, recovery contacts, certifications, passkeys, trusted devices, block/ignore | mixes identity presentation, account access, and privacy in one tab |
| Devices | linked devices, home hubs, pairing | |
| About | static blurb | web has none |

**Two model forks that break a mechanical hoist:**
- **Profile:** desktop = deleted pool; web = single default + hub-authoritative card.
- **Backup:** web `IdentityBackupSection` = multi-account WebCrypto **PBKDF2-SHA256**, `.wavvon-backup`, envelope `{kdf,cipher}` base64, selects which accounts to include. Desktop = Rust **Argon2id**, single identity, `.voxback` (old Voxply name — stale branding), envelope `{version,salt,nonce,ciphertext}` hex, file-path in/out. **The two files are not interchangeable** (different KDF and schema).

## 2. Proposed unified tab structure

One `TABS` array + tab components in `packages/ui/settings/`, both apps render
it. Platform-bound sections appear only where a capability is bound, gated on an
**optional prop being provided** (the established pattern — desktop omits props
for commands it lacks; web omits native-only ones):

| Tab (group) | Sections | Platform gating |
|---|---|---|
| **Profile** (Accounts) | profile card editor (converged model, §4), certifications | — |
| **Accounts** (Accounts) | switcher table, recovery phrase, backup, full archive, home hubs | now multi-account on both (§3) |
| **Devices** (Accounts) | paired devices, pairing, passkeys, trusted devices | passkey *registration* web-only (view/rename/delete both); global PTT native-only |
| **Privacy** (Accounts) | block / ignore | — |
| **Notifications** (App) | mention ping, notify sound | desktop's Voice-tab "notify sound" moves here |
| **Appearance** (App) | theme, skin editor, skins gallery, language | — |
| **Voice** (A/V) | audio profile, devices, VAD/mic, PTT mode | — |
| **Camera** (A/V) | device, background | desktop bg-blur prop only if `changeBackground` provided |

Web's grouped nav + `resolveManagingAccount` + `PerAccountProps` become the
shared skeleton; desktop gains grouping and a real managing selector (§3).

## 3. Desktop multi-account — DECIDED 2026-07-20 (adopt web's model)

**Settled by the user** (2026-07-20, "multi-account yes! We need that!").
Desktop adopts web's device-local multi-account model rather than staying
single-identity — so one `SettingsPage` and the shared `PerAccountProps`
skeleton render on both clients with no degenerate single-account branch.

What it implies (design, not open):

- **`~/.wavvon/` storage layout:** move from the single identity file
  (`Identity::default_path()`) to **per-account** identity files plus a small
  accounts registry (id/pubkey + `account_label` + order + active pointer) —
  the desktop analogue of web's IndexedDB rows + `wavvon:acct:<pubkey>:*`
  namespaces. Per-account isolation must cover session tokens, drafts, home
  hub list, notification prefs, and DM ratchet state, mirroring web's
  namespacing rule from the 2026-07-11 multi-account decision. Keep the model
  **device-local**: the account list is never synced to any hub, never enters
  the prefs blob (same decision).
- **Account switcher + in-place remount:** desktop grows the switcher table
  (create/switch/remove/rename/reorder) and the guarded in-place key-remount
  the web client uses (`<App key={activeAccountId}>`, session teardown before
  the flip, voice-join switch guard, switch cooldown — the 2026-07-12
  in-place-remount decision). The Tauri shell resets its per-account file
  handles on switch the way web's `resetHubSessions()` does.
- **Removal purges the account's namespace** (session tokens + ratchet state
  must not outlive the identity on a shared device) — same rule as web.

Alpha rules apply ([project_alpha_no_backcompat]): **no migration.** The old
single-identity file is not upgraded — break and re-create; the user re-imports
via phrase/backup/pairing. Orphaned files/keys are ignored, not migrated.

The Tauri-side storage rework is the bulk of this; the React surface is
already the shared web components once desktop supplies its `invoke`-based
loaders as props.

## 4. Remaining decisions — DECIDED 2026-07-20 (user calls)

### 4a. Backup story — phrase-first + ONE cross-platform file format

The user rejected per-platform files outright: "the backup should be
usable on both web or desktop or any other kind of device."

- Shared UI leads with the 24-word phrase as the canonical backup
  (phrase-first); the encrypted file is a secondary affordance.
- The file is **one format both clients read and write**:
  - KDF: **Argon2id** (65536 KiB, 3 iters, parallelism 1 — desktop's
    existing params). Web implements via `@noble/hashes` (same family as
    the crypto deps already in `packages/core`); desktop keeps the
    `argon2` crate.
  - Cipher: AES-256-GCM. Envelope: single JSON
    `{version: 1, kdf: "argon2id", kdf_params, salt, nonce, ciphertext}`
    (base64 fields). Plaintext: **one account** `{label, secret_key_hex}`
    — backup files are per-account (user call 2026-07-20, superseding an
    earlier multi-account-array draft): the user picks which account to
    export, each export is its own file, and importing a file restores
    exactly that account.
  - Extension: `.wavvon-backup`. Desktop's `.voxback` (stale Voxply
    branding, incompatible envelope) is retired; alpha rules — no
    importer for old files.
  - The format lives in `packages/core` (TS) and desktop Rust must match
    it exactly; add a shared test vector (fixed salt/nonce/passphrase →
    ciphertext) asserted on both sides, wire-format.md style.

### 4b. Notifications tab + public-profile defer — as recommended

- One **Notifications** tab on both clients (mention ping + notify sound
  together; desktop's notify-sound moves out of Voice). Per-hub notify
  *mode* stays hub-side in the sidebar.
- The signed `PublicHubProfile` vs unsigned `favorite_hubs` fork stays
  **deferred** per the 2026-07-19 decision; the unified Profile tab
  renders the web surface, desktop's signed-publish control drops from
  Settings for now.

## 5. Migration notes

Alpha rules apply — **no client data migration, no back-compat**
([project_alpha_no_backcompat]): break and re-create freely.

- **Desktop `~/.wavvon/` restructure (§3):** old single-identity file is not
  migrated; re-import via phrase/backup/pairing on first run.
- **Desktop `ProfileTab` converges on the 2026-07-12 model:** delete the
  `NamedProfile[]` pool, the `wavvon.hubProfiles` localStorage map, and the
  pool props threaded through `SettingsPage`. Profile becomes one default
  (personal-axis, local) + hub-authoritative card via `/me` (community-axis).
  Orphaned `wavvon.hubProfiles` keys are ignored, not migrated.
- **Desktop `.voxback` files** become unreadable by the converged flow —
  acceptable (alpha, phrase is the real backup). No importer for old files.
- Nothing here touches the identity wire format or any signed envelope.

## 6. Implementation sketch (rough order)

1. ~~Decide 4a/4b~~ — all decided 2026-07-20, recorded in `decisions.md`.
2. **Desktop `~/.wavvon/` multi-account storage + switcher + in-place remount**
   (§3) — the Tauri-side rework; unblocks a non-degenerate shared
   `PerAccountProps` on desktop.
3. **Hoist `ProfileTab` + `ProfileEditorSection`** from web into
   `packages/ui/settings/`; desktop deletes its pool `ProfileTab` and passes
   the same `/me` loaders as props. Closes parity item 1.
4. **Hoist `IdentityBackupSection`** as phrase-first (4a) with an
   `exportBackup`/`importBackup` callback contract; web supplies WebCrypto,
   desktop supplies a wrapper over its (now multi-account) Tauri commands.
   Closes parity item 2.
5. **Hoist the `TABS`/nav skeleton + grouped nav** into `packages/ui`; desktop
   adopts groups, folds notify-sound into a Notifications tab, drops About into
   Appearance or a footer.
6. `SettingsPage` itself becomes a thin app-local shell wiring platform props
   into the shared shell — the orchestrator carve-out
   ([decisions.md](decisions.md) 2026-07-18) shrinks to near-nothing.

Deferred: backup file-format reconciliation; public-profile/favorite-hubs
unification (2026-07-19 defer).
