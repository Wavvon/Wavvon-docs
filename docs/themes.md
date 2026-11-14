# Themes: one package for the look of the official client

**Status: designed, not built** (2026-11-14). Rationale in
[decisions.md](decisions.md), "Themes are packages for the official client;
the directory lists them in two sections". Supersedes the skin as the unit a
user installs; a `.wavvonskin` keeps importing as a colours-only theme
([custom-themes.md](custom-themes.md)).

A theme changes how the official Wavvon client looks: colours, icons,
background, layout and font, installed and switched in one click, shared as a
file, and offered by a hub owner as that hub's default. It contains **no code
and no free CSS**: it describes choices from closed sets, and the client
applies them. That is what makes a stranger's theme safe to install.

## 1. The package

A `.wavvontheme` file is a zip with `theme.json` at its root plus the images
it names.

```json
{
  "format": "wavvon.theme",
  "version": 1,
  "name": "Sakura Night",
  "author_pubkey": "ed25519:…",
  "description": "…",
  "base": "dark",
  "tokens":     { "--accent": "#ff8fb1", "--bg": "#14101a" },
  "icons":      { "mic": "icons/mic.svg", "settings": "icons/gear.png" },
  "background": { "image": "bg.webp", "fit": "cover", "dim": 0.45,
                  "panel_opacity": 0.82, "blur": 8 },
  "layout":     { "member_list": "left", "channel_list": "compact",
                  "tabs": "side", "density": "compact", "avatar_shape": "square" },
  "font":       "system"
}
```

Every block is optional except `format`, `version`, `name` and `base`.

- **`tokens`**: the skinnable colour tokens and their value rules, exactly as
  for a skin ([custom-themes.md](custom-themes.md) §1, §7).
- **`icons`**: a closed set of icon names, each mapped to an SVG or a raster
  image in the zip. An unknown name is ignored. Icons are always rendered as
  images (`<img>` or a CSS mask), never inlined: inline SVG can run script.
- **`background`**: one image; `fit` is `cover`, `contain`, `tile` or
  `center`; `dim` (0 to 0.9) is a dark veil over it, `panel_opacity` (0.6 to
  1) lets it show through the panels, `blur` (0 to 20 px) is the frosted
  effect and can be turned off by the user on a slow device.
- **`layout`**: each key takes one value from a closed list the client
  defines. An unknown key or value falls back to the default, so a theme made
  for a newer client still loads on an older one. New layout options are added
  over time, and every theme can use them.
- **`font`**: one of the fonts the client ships. Custom font files: later.

## 2. Limits

Zip at most 5 MB; background at most 2 MB; each icon at most 64 KB; images are
PNG, WebP, JPEG or SVG. Paths inside the zip are relative, with no `..`, no
absolute path and no links. Anything outside these rules rejects the whole
package with a message saying which rule. Images load from the package itself,
never from a URL: a remote image in a shared theme would tell a stranger's
server who uses it.

## 3. Where a theme comes from

- **The user** imports a file, installs one from the directory, or builds one
  in the editor (today's skin editor, grown tabs for icons, background and
  layout). Export writes a `.wavvontheme`. Installed themes live on the
  device and in the full backup; a colours-only theme keeps syncing through
  the settings as skins do today, and syncing packages with images through
  the home hub comes later.
- **The hub owner** uploads a theme in the admin panel. The hub validates it
  with the same rules, stores it and serves it publicly; the client served by
  that hub applies it before first paint. **The user's own choice always wins**
  over the hub's default.

## 4. The directory: two sections

- **Themes for the Wavvon client.** Signed `wavvon.theme` listings: the
  `theme.json` metadata, a preview image, and a download URL with its SHA-256.
  The official client shows this section in its theme picker, downloads the
  package, checks the hash, validates it and previews it before installing.
- **Themes for other clients.** A signed listing with a name, the client it is
  for (free text) and a description written by the author, plus a link. The
  directory does not look inside it, and the official client does not show it.

The directory never hosts the packages: it lists them, the way it lists
clients.
