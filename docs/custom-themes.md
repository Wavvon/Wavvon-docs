# Custom Themes (User Skins)

**Status:** designed, not built. Personal-axis, v1.

> Paths in this doc predate the client monorepo. The clients now live in
> the Wavvon-client monorepo: read `Wavvon-desktop/desktop/` as
> `apps/desktop/`, `Wavvon-web/web/` as `apps/web/`, and shared CSS tokens
> as a candidate for `packages/ui`. See [architecture.md](architecture.md).

Wavvon ships four built-in themes — Calm, Classic, Linear, Light — driven
entirely by CSS custom properties set on `[data-theme="..."]` in each
client's `styles.css` (desktop: `apps/desktop/src/styles.css`;
web: `apps/web/src/styles.css`). A skin is just a fifth, user-owned
set of values for those same tokens. No new rendering path — we reuse the
token cascade that already paints the whole app.

---

## Why / Where

**Why tokens, not CSS.** The four themes prove the token set already spans
the visible surface. Letting users override token *values* gets full
re-skinning for free while keeping the blast radius to a known, safe list.
Arbitrary CSS injection would let a shared `.wavvonskin` file run layout or
`url()` exfiltration attacks — see Security below.

**Why personal-axis.** A skin follows the user across hubs, like the theme
choice does today. It is cosmetic and per-person, so it belongs on the
personal axis (the user's own state), never on a community hub. Hub-level
branding is a separate, deferred community-axis feature.

---

## 1. Token taxonomy

Skinnable tokens are exactly the theme-dependent ones in the
`[data-theme]` blocks. Theme-*independent* tokens (spacing, type scale,
motion, the `--space-*` / `--text-*` / `--r-*` families) are **not**
exposed — they are layout-load-bearing and changing them breaks the UI.
The one exception is border radius, exposed as a single coarse control
(see below), not the full `--r-*` scale.

Grouped for the editor:

| Group    | Tokens                                                               | Type   |
|----------|----------------------------------------------------------------------|--------|
| Surfaces | `--bg`, `--bg-elevated`, `--bg-sunken`, `--surface`, `--surface-hover` | color  |
| Text     | `--text`, `--text-muted`, `--text-faint`                             | color  |
| Accent   | `--accent`, `--accent-hover`, `--accent-text`                        | color  |
| Status   | `--info`, `--info-hover`, `--success`, `--warning`, `--danger`, `--danger-hover`, `--danger-bg` | color |
| Borders  | `--border`                                                           | color  |
| Effects  | `--ring`, `--overlay`                                                | color (rgba) |
| Shadows  | `--shadow-sm`, `--shadow-md`, `--shadow-lg`                          | shadow |
| Radius   | `--skin-radius-scale` → multiplies the built-in `--r-*` family       | number |

Notes:

- `--ring` and `--overlay` carry alpha — the editor offers an opacity
  slider alongside the color picker for these two.
- Shadows are a guided control, not a free box-shadow string: the editor
  exposes shadow color + intensity and emits the three `--shadow-*`
  values. This keeps Light's tuned-lighter intent reachable without
  letting users type arbitrary shadow CSS.
- Radius is a single multiplier (`0.5–2×`) applied to `--r-sm/md/lg/xl`,
  not a per-token value. One knob, meaningful effect, no broken layouts.
- Do **not** expose `--bg-primary`, `--surface-2`, or `--r-xs` — these are
  legacy fallback names referenced in a few status-menu rules and are not
  part of the canonical set. Skins target the canonical tokens only.

---

## 2. Skin file format

`.wavvonskin` is a small, self-describing JSON document:

```json
{
  "format": "wavvon.skin",
  "version": 1,
  "name": "Midnight Moss",
  "author_pubkey": "ed25519:abc123…",
  "base": "calm",
  "tokens": {
    "--bg": "#10130f",
    "--accent": "#9cc79a",
    "--accent-text": "#10130f",
    "--skin-radius-scale": "1.25"
  }
}
```

- `format` + `version` gate the importer; unknown future versions are
  rejected with a clear message rather than partially applied.
- `name` is the display label in the picker. Required, ≤ 48 chars.
- `author_pubkey` is **optional** and **decorative** in v1 — shown as
  attribution, not verified or signed. Signing belongs to a future gallery;
  we don't want a half-trust signal now.
- `base` names which built-in theme fills any token the skin omits. A skin
  need only override the tokens it wants to change; everything else
  inherits from `base`. This keeps files tiny and forward-compatible when
  new tokens are added.
- `tokens` is a flat map of canonical token name → CSS literal. Unknown
  keys are dropped on import (logged, not fatal).

---

## 3. The "Custom" theme slot

`THEMES` (`Wavvon-desktop/desktop/src/constants.ts:175`, web equivalent)
gains a fifth entry with `id: "custom"`. The union type widens from
`"calm" | "classic" | "linear" | "light"` to include `"custom"` everywhere
it is used — `ThemePicker`, `App` state, and the persisted profile field.

The Custom card behaves differently from the four built-ins:

- When no skin is loaded it reads "Custom — none yet" and selecting it
  opens the editor seeded from the current `base`.
- When a skin is active the card shows the skin's `name` and its three
  representative swatches (`--bg`, `--surface`, `--accent`), matching how
  built-ins render swatches today.

The custom slot holds exactly **one** active skin in v1. Importing a second
skin replaces it (with a confirm dialog). A multi-skin library is deferred.

**Application mechanism:** the custom slot sets `data-theme="custom"` and
writes the skin's token overrides as inline properties on
`document.documentElement` (e.g. `el.style.setProperty("--bg", val)`). A
`[data-theme="custom"]` block in `styles.css` carries the `base` fallback
values; inline overrides win by specificity. Switching away from the custom
slot clears all inline properties.

---

## 4. Editor UI (Settings → Appearance, Custom selected)

Below the existing `.theme-cards` grid an editor panel appears only when
Custom is the active slot:

- **Skin name field** — text input bound to `name`, max 48 chars.
- **Base selector** — dropdown of the four built-ins; changing it
  re-seeds unset tokens and updates the live preview immediately.
- **Token controls**, grouped by the table in §1. Each row: label, a
  native `<input type="color">` plus a hex text field for paste, and a
  per-token **reset** button that reverts that one token to the `base`
  value. `--ring` / `--overlay` rows add an opacity slider; Shadows use the
  guided shadow control; Radius uses a range slider (0.5–2, step 0.05).
- **Live preview** — edits apply immediately via `setProperty` on the
  document root; the whole running app *is* the preview. No separate
  preview pane needed.
- **Reset all** — reverts every token to the `base` default.

Tokens only. There is no raw-CSS textarea anywhere in this UI.

---

## 5. Export / import

**Export** serializes the active skin to `.wavvonskin` JSON and saves it.
The serialize step is identical across clients; only the save transport
differs (see §8).

**Import flow:**

1. User picks a file via the platform file picker.
2. Parse + **validate against the schema and the security rule** (§7).
   Reject the whole file with a specific message on failure.
3. If a skin is already in the custom slot show its name alongside the
   incoming name and ask "Replace?".
4. **Preview before apply** — apply the incoming tokens temporarily so the
   user sees the result live; offer Keep / Discard. Discard restores the
   prior state exactly.

---

## 6. Persistence

The active skin and the slot selection persist to
`~/.wavvon/appearance.json`, following the `voice.json` pattern in
`Wavvon-desktop/desktop/src-tauri/src/lib.rs` (`voice_settings_path()`,
~line 640). Add `appearance_settings_path()` returning
`.wavvon/appearance.json`, plus `load_appearance` / `save_appearance`
Tauri commands mirroring the voice ones, with `#[serde(default)]` on every
field so older files keep loading as the schema grows.

```json
{ "slot": "custom", "skin": { /* .wavvonskin body */ } }
```

The theme *selection* stays where it is today — the profile field read via
`get_profile` and applied as `dataset.theme` on startup in
`Wavvon-desktop/desktop/src/App.tsx` (~lines 1884–1893). When
`slot == "custom"`, startup also reads `appearance.json` and replays the
token overrides before first paint to avoid a flash. A `[data-theme="custom"]`
block in `styles.css` must carry neutral fallback values so the skin never
flashes unstyled while `appearance.json` loads.

**Web persistence:** `localStorage` key `wavvon:appearance` via
`Wavvon-web/web/src/platform/storage.ts` (the web client has no disk access
via Tauri). Both clients share the same JSON shape and the same React editor
components.

**Migration note.** When the home-hub / personal-prefs blob lands
([`home-hub.md`](home-hub.md), [`block-mute-ignore.md`](block-mute-ignore.md)),
the skin moves into that blob as personal-axis state and `appearance.json`
becomes a local cache. The file shape is designed to drop straight into the
prefs blob unchanged.

---

## 7. Security — token value validation

Every value in `tokens` must match one of a small allow-list of CSS literal
shapes; anything else rejects the **whole file**:

- **color:** `#rgb` / `#rrggbb` / `#rrggbbaa`, or `rgb()` / `rgba()` /
  `hsl()` / `hsla()` with numeric args only.
- **number (radius scale):** a bare positive decimal within `[0.5, 2]`.
- **shadow:** produced by the guided control only; on import, parsed from
  individual numbers + a validated color and re-serialized — never passed
  through as a raw string.

Forbidden in any value (checked before the allow-list): the substrings
`url(`, `var(`, `@`, `expression`, `/*`, `;`, `}`, `<`. This blocks
external fetches (`url()`), token-chaining loops (`var()`), declaration
breakout (`;` / `}`), and comment/markup injection.

Validation runs in a **shared TS module** imported by all three clients so
the rule cannot drift between platforms.

---

## 8. Cross-client parity

**Identical across desktop / web / android** (shared TS): token taxonomy,
the `.wavvonskin` schema, the validation rule (§7), the editor React
components, the `setProperty` apply/clear logic, and the
`[data-theme="custom"]` CSS block (kept in sync between both `styles.css`
files).

**Differs — file I/O transport only:**

| Client | Export | Import | Persist |
|--------|--------|--------|---------|
| Desktop (Tauri) | `dialog::save()` Tauri command | `dialog::open()` Tauri command | `appearance.json` via new Tauri command |
| Web | `<a download>` Blob URL | `<input type="file">` | `localStorage` key `wavvon:appearance` |
| Android (Tauri wrapper) | Android share sheet | `ACTION_OPEN_DOCUMENT` content picker | same Tauri command path as desktop (`Wavvon-android/wavvon-desktop/src-tauri`) |

Engineers implement the React editor against a `platform.skins` adapter
interface (`export(skin)`, `import() → Promise<Skin>`, `persist(slot, skin)`,
`load() → Promise<AppearanceState>`) so the editor never branches on client.

---

## 9. Future direction

A **hub-level theme override** (community-axis) would let an operator brand
their hub — applied while viewing that hub, layered under the user's
personal skin, with the user always able to opt out. That is a separate
design: it lives on the community hub, needs operator permissions and
federation of the token blob, and must reconcile with the personal custom slot.

A **skin gallery in Wavvon-discovery** is now designed — see §11.

---

## 11. Discovery skin gallery

A browsable gallery of self-submitted skins in Wavvon-discovery, reusing
the same signed-listing primitive hubs, farms, bots, and games already use
([discovery-v2.md](discovery-v2.md)). This is where `author_pubkey`
graduates from decorative attribution to a verified signature.

**Registration.** The author signs the full `.wavvonskin` JSON bytes with
their Ed25519 key — the same key used for hub federation, via the same
`@noble/ed25519` primitive discovery already uses in
`discovery/src/lib/verify.ts`. The `author_pubkey` field inside the skin
body must match the signing key.

```
POST /api/skins/register
{ "payload": "<full .wavvonskin JSON, the canonical signed bytes>",
  "sig":     "<base64url Ed25519 signature over payload>" }
```

Discovery verifies `sig` against the `author_pubkey` inside `payload`,
checks the ≤5-minute nonce/replay guard, then upserts. It does **not**
validate token values (§7 is client-side on import).

**Discovery schema.** A `skins` table:

| Column | Notes |
|---|---|
| `id` | content hash of the payload (primary key) |
| `author_pubkey` | signer; also the delete authority |
| `name` | display label (≤48) |
| `base` | built-in theme the skin extends |
| `swatch_bg` / `swatch_surface` / `swatch_accent` | `--bg` / `--surface` / `--accent` values — so the browse list ships no full JSON per card |
| `payload` | full `.wavvonskin` JSON, served only by the detail endpoint |
| `featured` | INTEGER sort hint, operator-set |
| `listed_at` | timestamp |

**Browse endpoints.** Same shape as `GET /api/hubs`:

- `GET /api/skins?q=<text>&base=<theme>&page=<n>` → `{ skins: [...], total }`, each item carrying id, name, author_pubkey, base, the three swatches, featured — never the full payload.
- `GET /api/skins/:id` → the full `.wavvonskin` body.

**Delete.** `DELETE /api/skins/register` carries a signed withdrawal;
discovery verifies the signature against the stored `author_pubkey` and
removes the row. Same pattern as hub de-listing.

**Browse UI in the client.** A **Browse** tab in Settings → Appearance
shows a card grid: skin name, truncated author pubkey, base theme, three
swatches. Clicking a card calls `fetchSkin(id)` and runs the existing
import preview flow (§5) — user sees the result live, then Apply or
Discard. The `platform.skins` adapter (§8) gains two new calls:
`browse(query) → Promise<SkinListItem[]>` and
`fetchSkin(id) → Promise<Skin>`.

**`featured` flag.** Discovery operators flag skins for the default browse
landing — not a gate, just a sort hint. Identical to the `featured` flag on
hub listings.

**Spam / abuse.** Same posture as hubs: open self-submission, no
pre-moderation, operators can remove any entry. The §7 security validation
runs client-side on import, never server-side on register.

---

## 10. Deferred

- Multi-skin library (saving more than one skin locally; a browsable list).
- Hub-level (community-axis) theme override and operator branding.
- Per-token radius control (currently one global scale knob).
- Arbitrary shadow strings (currently guided control only).
- Light/dark *auto* skins that follow OS `prefers-color-scheme`.
- Custom fonts and typographic tokens.
- Syncing the skin across devices before the personal-prefs blob exists.

---

## Cross-references

- `Wavvon-desktop/desktop/src/styles.css` — canonical token definitions (`[data-theme]` blocks)
- `Wavvon-desktop/desktop/src/constants.ts:175` — `THEMES` array to extend
- `Wavvon-desktop/desktop/src/components/ThemePicker.tsx` — picker component to extend
- `Wavvon-desktop/desktop/src/App.tsx:1884` — theme apply/persist on startup
- `Wavvon-desktop/desktop/src-tauri/src/lib.rs:640` — `voice_settings_path` pattern for `appearance_settings_path`
- `Wavvon-web/web/src/styles.css` — web token source (keep in sync with desktop)
- `Wavvon-web/web/src/platform/storage.ts` — web persistence layer
- [home-hub.md](home-hub.md) — personal-axis prefs blob that eventually absorbs the skin
- [discovery-v2.md](discovery-v2.md) — signed-listing catalog pattern the skin gallery (§11) mirrors
- [decisions.md](decisions.md) — rationale log
