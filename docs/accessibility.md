# Accessibility & Internationalization

Wavvon's three clients (desktop, web, Android) share a React UI but
target different input surfaces. This doc defines the keyboard, screen
reader, and localization strategy for all three. Scope is the React UI
only — the Rust shell and the hub APIs are unaffected.

Today's baseline (audited 2026-05): four global key bindings
(`Ctrl+K` palette, `Esc` close on Settings/HubAdmin/BotCard, `Enter` to
send/submit), `outline: none` on most inputs, zero `aria-*` attributes,
no `role`s beyond what HTML implies, no i18n library, all strings
hard-coded in English. We start from a low floor.

## 1. Keyboard navigation

### Tab order through the main layout

The three-panel layout has four landmark regions. Tab order proceeds
left-to-right, top-to-bottom, with **one tab stop per landmark**
(roving tabindex inside each):

1. `HubSidebar` — hub icon list
2. `ChannelSidebar` — channel tree + voice footer
3. `ContentArea` — message list (read-only roving focus on messages)
4. Composer input

Modals and overlays insert themselves into the tab order via focus
trapping; they are not appended to the main tab sequence.

### Roving tabindex pattern

Lists with many items must not pollute the tab order. The pattern is
`tabindex="0"` on the focused item, `tabindex="-1"` on the rest, arrow
keys move focus, `Home`/`End` jump to ends, `Enter`/`Space` activate.
Apply to:

- Hub icon list (`HubSidebar`) — `ArrowUp` / `ArrowDown` between hubs,
  `Enter` switches hub.
- Channel tree (`ChannelSidebar`) — `ArrowUp` / `ArrowDown` between
  channels, `ArrowLeft` collapses category, `ArrowRight` expands,
  `Enter` selects.
- Message list (`ContentArea`) — `ArrowUp` / `ArrowDown` between
  messages; the message is a focusable region exposing its actions
  (react / reply / edit / delete) via `Enter` opening a menu.
- Member list (`UserListGrouped`) — same pattern.
- DM conversation list — same pattern.

### Global keyboard shortcuts

Existing shortcuts keep their bindings. Additions in **bold**.

| Binding                     | Action                                       |
|-----------------------------|----------------------------------------------|
| `Ctrl/Cmd+K`                | Open channel palette (exists)                |
| `Esc`                       | Close active modal / palette / settings      |
| `Enter`                     | Send message (composer focused)              |
| `Shift+Enter`               | Newline in composer                          |
| **`Alt+ArrowUp/Down`**      | Previous / next channel in current hub       |
| **`Ctrl/Cmd+ArrowUp/Down`** | Previous / next hub                          |
| **`Ctrl/Cmd+,`**            | Open Settings                                |
| **`Ctrl/Cmd+Shift+M`**      | Toggle self-mute (when in voice)             |
| **`Ctrl/Cmd+Shift+D`**      | Toggle self-deafen (when in voice)           |
| **`Ctrl/Cmd+Shift+V`**      | Join / leave voice on selected channel       |
| **`Ctrl/Cmd+/`**            | Open keyboard shortcut cheat-sheet           |
| **`Ctrl/Cmd+F`**            | Focus channel search (when in channel)       |
| **`Ctrl/Cmd+E`**            | Open emoji / reaction picker on focused message |
| **`/`**                     | Focus composer (when not in a text field)    |

PTT bindings live in voice settings and are user-configurable; they do
not collide with the table above because PTT is a hold-to-talk physical
key, not a chord.

The cheat-sheet (`Ctrl+/`) is a new lightweight modal listing all of
the above. It is the discoverability surface — we don't document
shortcuts in a separate help page.

### Focus management for modals

Every modal must:

1. On open, move focus to its first interactive element (or its
   primary input).
2. Trap `Tab` / `Shift+Tab` within the modal (cycle around).
3. Close on `Esc`.
4. On close, restore focus to the element that opened it.

Audit (desktop and web share the same component files):

| Modal                    | Esc closes? | Focus trap? | Focus restore? |
|--------------------------|-------------|-------------|----------------|
| `AddHubModal`            | yes         | no          | no             |
| `CreateChannelModal`     | unverified  | no          | no             |
| `CreateHubWizard`        | unverified  | no          | no             |
| `ChannelSettingsModal`   | unverified  | no          | no             |
| `ChannelAppearanceModal` | unverified  | no          | no             |
| `ChannelBansModal`       | unverified  | no          | no             |
| `EditDescriptionModal`   | unverified  | no          | no             |
| `FriendsModal`           | unverified  | no          | no             |
| `ChannelContextMenu`     | yes (click-out) | no      | no             |
| `UserContextMenu`        | yes (click-out) | no      | no             |
| `ChannelPalette`         | yes         | partial     | no             |
| `Lightbox`               | unverified  | no          | no             |
| `ReactionPicker`         | unverified  | no          | no             |
| `BotCard`                | yes         | no          | no             |

Implementation note: a single `<FocusTrap>` wrapper component (built on
`focus-trap-react` or rolled by hand — ~40 lines) eliminates the
duplication. The restore-on-close behaviour fits naturally as a
`useEffect` cleanup that calls `.focus()` on a ref captured on mount.

### Visible focus indicator

`outline: none` in `styles.css` removes the focus ring globally.
Replace with a project-wide `:focus-visible` style using the `--ring`
CSS variable (already defined in the existing theme tokens). Tokenize as
`--focus-ring: 2px solid var(--ring)` with `--focus-ring-offset: 2px`,
applied across all themes. The Light theme needs a darker `--ring` value
to maintain WCAG 2.1 contrast 3:1 against its background.

---

## 2. Screen reader support

Wavvon runs inside a Tauri webview on desktop and a normal browser on
web/Android. All three expose the DOM accessibility tree to platform
screen readers. We design once for the DOM tree; the host webview does
the bridging.

### Landmarks and roles

| Component | Landmark |
|---|---|
| `HubSidebar` | `<nav aria-label="Hubs">` |
| `ChannelSidebar` | `<nav aria-label="Channels">` |
| `ContentArea` (messages) | `<main aria-label="Messages">` |
| `ContentArea` (member sidebar) | `<aside aria-label="Members">` |
| Composer | `<form aria-label="Compose message">` |

Specific ARIA additions:

- Hub icon list: `role="tablist"`, each hub icon `role="tab"`, active
  hub `aria-selected="true"`.
- Channel tree categories: `role="group"` + `aria-expanded` on the
  category header.
- Voice mute / deafen toggle buttons: `aria-pressed="true|false"`,
  `aria-label="Mute microphone"` / `"Unmute microphone"`.
- Unread / mention badges: hide the visual badge with `aria-hidden="true"`,
  put the count in the channel button's `aria-label` —
  `aria-label="general, 3 unread messages, 1 mention"`.
- Voice participant count: include in channel `aria-label` —
  `"general, 2 people in voice"`.
- Drag-drop reorder: provide a keyboard alternative — `Space` on a
  focused hub icon enters "move mode", `ArrowUp` / `ArrowDown`
  repositions, `Space` confirms, `Esc` cancels. `@dnd-kit` already
  ships a `KeyboardSensor` — wire it up next to the existing
  `PointerSensor` in `HubSidebar` and `ChannelSidebar`.

### Live regions for messages

A polite `aria-live` region is required on the active channel's message
list so new messages announce themselves. Three rules:

1. **One live region**, scoped to the currently-visible channel. Do not
   attach `aria-live` to every channel — that would announce traffic the
   user isn't watching.
2. **Throttle** to one announcement per 2 seconds — coalesce a burst
   into "3 new messages from Alice, Bob, Carol" instead of three
   separate announcements.
3. **Suppress when window is unfocused** — OS notifications already
   cover that case; double-announcing is noise.

Placement: a visually hidden `<div aria-live="polite" aria-atomic="true">`
inside `ContentArea`, mutated by an effect watching the `messages` array.
Use `aria-relevant="additions"` to ignore edits/deletes.

A separate `aria-live="assertive"` region in `App.tsx` handles
connection-state changes ("Disconnected from hub Acme, reconnecting…")
and errors.

### Message semantics

Wrap the message list in `<ol>`. Each message is an `<li>` with an
accessible name composed at render time:

> `"{author display name} at {formatted timestamp}: {message text}"`

Reactions, attachments, and reply context are appended:

> `"{…above…} Reply to Bob. 2 reactions: thumbs up, heart. 1 attachment: screenshot.png."`

Action buttons (react / reply / edit / delete) are inside the `<li>`
in a `<div role="toolbar" aria-label="Message actions">` that appears
when the message has roving focus.

### Voice channel announcements

On join: assertive live region —
`"Joined voice in {channel} with {N} other participants: {names…}"`.

On leave: `"Left voice"`.

On others joining/leaving while you're in voice: polite live region,
throttled — `"{name} joined voice"` / `"{name} left voice"`.

### What does not get announced

- Typing indicators (visual only — the constant churn would be
  intolerable).
- Presence changes (online / offline) — too noisy.
- Edits to your own messages.

---

## 3. Localization (i18n)

### Library choice: `react-i18next`

Picked over Lingui and a custom solution.

- Works identically in Tauri webview and browser (no Babel/SWC plugin
  required, unlike Lingui).
- Lazy loading, ICU MessageFormat plugin, large pretranslated catalogs
  for common UI strings, declarative `<Trans>` for embedded React in
  strings.
- Custom solution: rejected on cost; pluralization and ICU date
  formatting alone justify a library.

Same library in all three clients. Catalogs live in the shared workspace
package `packages/i18n` in the Wavvon-client monorepo; desktop, web, and
Android all consume it as a workspace dependency.

### String catalog layout

```
packages/i18n/
  en.json            # source of truth
  it.json
  es.json
  de.json
  schema.json        # JSON schema for tooling
```

Flat keys, dot-namespaced by feature, ICU MessageFormat values:

```json
{
  "app.title": "Wavvon",
  "hub.add.button": "Add a hub",
  "channel.unread.aria": "{count, plural, one {# unread message} other {# unread messages}}",
  "voice.joined.aria": "Joined voice in {channel} with {count, plural, one {# participant} other {# participants}}",
  "settings.tabs.profile": "Profile"
}
```

One file per locale. v1 is small enough (~600–1000 keys) that a single
file per locale beats the overhead of per-feature namespacing.

### Language detection

Resolution order on startup:

1. **Stored user preference** (`prefs.json` on desktop, `localStorage`
   on web, Tauri store on Android) — wins if present.
2. **OS locale** — Tauri exposes via `tauri-plugin-os`; browser via
   `navigator.languages`.
3. **Fallback to English**.

Hub default does not influence client language. Locale is
personal-axis state — it travels with the user, not the community.

### Language switching

A `Language` row in Settings → Appearance, persisted to the same store
that holds `theme`. Switching is immediate — no reload needed;
`i18next` re-renders subscribers automatically.

### RTL: not in v1, but don't paint into a corner

v1 ships LTR-only (EN + IT + ES + DE). To keep RTL viable later:

- Use **CSS logical properties** (`margin-inline-start`,
  `padding-inline-end`, `inset-inline`, `text-align: start`) instead
  of `left` / `right` for any new styles.
- Set `dir` on `<html>` from the active locale's directionality (each
  locale catalog includes a `_dir` meta key).
- Avoid hard-coded directional icons — use mirrored variants via
  `transform: scaleX(-1)` keyed off `[dir="rtl"]`.

When RTL lands: a single migration PR converts physical-property rules
in `styles.css` to logical, and the first RTL locale ships.

### Pluralization and dates

- **Plurals**: ICU MessageFormat via `i18next-icu`.
- **Dates**: `Intl.DateTimeFormat` with the active locale. The existing
  `formatDayLabel` / `formatFullTimestamp` / `formatRelative` helpers
  in `desktop/src/utils/format.ts` get a `locale` parameter and
  delegate to `Intl`.
- **Numbers**: `Intl.NumberFormat` for unread counts above 99 and
  attachment file sizes.

### Strings that are never translated

User-generated or identity-bearing content is always displayed as-is:
pubkeys, hub URLs, channel IDs, hub/channel/alliance names, usernames,
message content, reactions, game titles. Rule of thumb: if it came over
the wire, it is not translated.

### v1 coverage target

**EN, IT, ES, DE.** Add FR, PT-BR, JA, RU, ZH in the next pass once
the extraction pipeline is proven and community translators are
available. Crowd-sourced via PRs against the catalog files.

---

## 4. Implementation order

**Keyboard nav → screen reader → i18n.**

1. Keyboard nav first — unblocks screen reader work (an SR user's
   primary input is the keyboard; an inaccessible focus model defeats
   good ARIA). Effort: ~2–3 weeks, mostly mechanical.
2. Screen reader second — layers ARIA onto the now-navigable DOM.
   Effort: ~2–3 weeks plus dedicated NVDA/VoiceOver testing.
3. i18n last — orthogonal sweep, touches every user-visible string but
   is structurally independent of the first two. Doing it last means
   ARIA strings are translated only once, in their final form.
   Effort: ~3–4 weeks plus translator turnaround.

Each phase ships independently.

---

## 5. Testing

### Keyboard navigation

- **Manual checklist** per release: tab through every page with the
  mouse hidden; every action reachable; visible focus ring everywhere;
  every modal traps + restores; every shortcut in the cheat-sheet works.
- **Automated** via Playwright: headless keyboard simulation covers
  opening each modal via shortcut, tabbing N times and asserting the
  focused element, pressing `Esc` and asserting focus restored.

### Screen reader

Manual only — automated SR testing has poor signal-to-noise.
Prioritized flows:

1. Sign in / pair device → land on a hub → read messages.
2. Switch channel → new messages announce.
3. Compose and send a message → own message not self-announced.
4. Join voice → confirm announcement → mute / deafen → leave.
5. Open Settings → change theme + language → close → focus restored.
6. Receive a DM while in a channel → assertive announcement.

Test matrix: **NVDA + Firefox** (Windows, web), **NVDA + WebView2**
(Windows, desktop), **VoiceOver + Safari** (macOS, web),
**VoiceOver + WKWebView** (macOS, desktop), **TalkBack + Chrome
WebView** (Android). One full pass per major release.

### i18n

- **String coverage CI check**: fails the build if any key in `en.json`
  is missing in another locale or has the identical English value
  (likely untranslated).
- **Extraction lint**: a CI grep job fails if a `.tsx` file contains a
  hard-coded English-looking string in JSX text nodes or ARIA props
  outside allowed contexts (test files, comments, types).
- **Snapshot per locale**: Playwright renders the cheat-sheet modal and
  Settings page in each shipped locale — catches layout breakage from
  long German labels.

---

## Cross-references

- [client.md](client.md) — component tree and state layout
- [browser-client.md](browser-client.md) — platform adapter and shared components
- [android-client.md](android-client.md) — Tauri Android wrapper
- [decisions.md](decisions.md) — design rationale log
