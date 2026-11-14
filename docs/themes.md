# Themes: one package for the look of the official client

**Status: designed, not built** (2026-11-14). Rationale in
[decisions.md](decisions.md), "Themes are packages for the official client;
the directory lists them in two sections". Replaces skins entirely: the skin,
the `.wavvonskin` format and its import are removed, not kept alongside
([custom-themes.md](custom-themes.md) is the record of what they were).

A theme changes how the official Wavvon client looks and sounds: colours,
icons, background, layout, font and sounds, installed and switched in one
click, shared as a file, and offered by a hub owner as that hub's default. It
contains **no code and no free CSS**: it describes choices from closed sets,
and the client applies them. That is what makes a stranger's theme safe to
install.

## 1. The package

A `.wavvontheme` file is a zip with `theme.json` at its root plus the files
it names.

```json
{
  "format": "wavvon.theme",
  "version": 1,
  "name": "Sakura Night",
  "author_pubkey": "ed25519:…",
  "description": "…",
  "colors": {
    "dark":  { "--accent": "#ff8fb1", "--bg": "#14101a" },
    "light": { "--accent": "#c2185b", "--bg": "#fff5f8" }
  },
  "icons":      { "mic": "icons/mic.svg", "settings": "icons/gear.png" },
  "background": { "image": "bg.webp", "fit": "cover", "dim": 0.45,
                  "panel_opacity": 0.82, "blur": 8 },
  "layout":     { "member_list": "left", "channel_list": "compact",
                  "tabs": "side", "density": "compact", "avatar_shape": "square" },
  "font":       "system",
  "sounds":     { "mention": "sounds/mention.ogg", "voice_join": "sounds/in.ogg" }
}
```

Every block is optional except `format`, `version`, `name` and `colors`.

- **`colors`**: one or both of `dark` and `light`, each a map of colour tokens
  over the built-in theme of the same name, with the value rules carried over
  from the retired skins ([custom-themes.md](custom-themes.md) §1, §7). With
  both, the client follows the system's light or dark setting unless the user
  pins one; with one, that one is used.
- **`icons`**: a closed set of icon names, each mapped to an SVG or a raster
  image in the zip. An unknown name is ignored. Icons are always rendered as
  images (`<img>` or a CSS mask), never inlined: inline SVG can run script.
  State styling (muted, deafened, live) stays the client's, so a replaced
  glyph never hides a state.
- **`background`**: one image; `fit` is `cover`, `contain`, `tile` or
  `center`; `dim` (0 to 0.9) is a dark veil over it, `panel_opacity` (0.6 to
  1) lets it show through the panels, `blur` (0 to 20 px) is the frosted
  effect.
- **`layout`**: each key takes one value from a closed list the client
  defines. An unknown key or value falls back to the default, so a theme made
  for a newer client still loads on an older one. New layout options are added
  over time, and every theme can use them. The user's own layout choices stay
  theirs: a theme sets defaults.
- **`font`**: one of the fonts the client ships. Custom font files: later.
- **`sounds`**: a closed set of sound names (`message`, `mention`,
  `voice_join`, `voice_leave`, `mute`, `unmute`, `deafen`, `undeafen`, …),
  each mapped to an audio file in the zip. The user's sound volume and
  on/off settings still apply.

The loader, the install and switch flow, the hub default and the directory
download are written once for both themes and [language packs](language-packs.md),
which use the same mechanism with a different package.

## 2. Limits

Zip at most 8 MB; background at most 2 MB; each icon at most 64 KB; each
sound at most 256 KB and 5 seconds. Images are PNG, WebP, JPEG or SVG; sounds
are Ogg, MP3 or WAV. Paths inside the zip are relative, with no `..`, no
absolute path and no links. Anything outside these rules rejects the whole
package with a message saying which rule. Files load from the package itself,
never from a URL: a remote file in a shared theme would tell a stranger's
server who uses it.

## 3. Accessibility

- **Contrast.** The editor measures text against its surfaces (and against
  the dimmed background, when there is one) and warns below WCAG AA. A
  warning, not a block; the gallery shows which themes pass.
- **System preferences win.** With "reduce transparency" the client ignores
  `panel_opacity` and `blur`; with "reduce motion" it drops animations. A user
  setting also turns blur or the background off on a slow device.

## 4. Where a theme comes from

- **The user** imports a file, installs one from the directory, or builds one
  in the editor (the skin editor becomes the theme editor, with tabs for
  icons, background, layout and sounds). Export writes a `.wavvontheme`, and a
  "make preview" button captures the client with the theme applied, for the
  gallery. Installed themes live on the device and in the full backup;
  syncing them through the home hub comes later. Skins saved today are not
  migrated (alpha: no client data migrations).
- **The hub owner** uploads a theme in the admin panel. The hub validates it
  with the same rules, stores it and serves it publicly at a URL that carries
  its hash, so browsers cache it for good and a change arrives at once. The
  client served by that hub applies it before first paint; the user build
  applies it while that hub is open if the user turns that on. **The user's
  own choice always wins** over the hub's default. A hub that publishes
  itself to the directory can include its theme's preview in its listing.

## 5. The directory: two sections

- **Themes for the Wavvon client.** Signed `wavvon.theme` listings: the
  `theme.json` metadata, a preview image, and a download URL with its SHA-256.
  The official client shows this section in its theme picker, downloads the
  package, checks the hash, validates it and previews it before installing.
  A listing republished with the same author key and name is an **update**:
  the client offers it to whoever installed the earlier one.
- **Themes for other clients.** A signed listing with a name, the client it is
  for (free text) and a description written by the author, plus a link. The
  directory does not look inside it, and the official client does not show it.

The directory never hosts the packages: it lists them, the way it lists
clients.
