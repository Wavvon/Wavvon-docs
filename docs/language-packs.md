# Language packs: languages a hub or a user adds

**Status: designed, not built** (2026-11-14). Rationale in
[decisions.md](decisions.md), "Language packs ride the theme mechanism, with
the security strings locked". Moved here from future-features.md, where it
waited for a fifth language and desktop delivery.

The official client ships English, Italian, Spanish and German. A language
pack adds another one without a release: a hub owner offers it to the people
on their hub, or a user installs it for themselves. It uses the package
mechanism of [themes.md](themes.md): the same container rules, install and
switch, hub default with the user's choice winning, hash-pinned downloads
from the directory, updates by author key and name, and the full backup. A
language is a **separate package** from a theme, because the two choices are
independent: one theme, any language.

## 1. The package

A `.wavvonlang` file is a zip with `lang.json` at its root.

```json
{
  "format": "wavvon.lang",
  "version": 1,
  "code": "sc",
  "name": "Sardu",
  "author_pubkey": "ed25519:…",
  "description": "…",
  "client_version": "0.10.0",
  "strings": { "settings": { "title": "Impostatziones" } }
}
```

- **`code`** is a BCP-47 tag. A pack for a language the client ships (`it`)
  is allowed and overrides only the keys it carries, for a regional variant
  or a correction.
- **`strings`** has the shape of the client's own catalogues
  (Wavvon-clients: `packages/i18n/en.json`). Missing keys fall back to
  English, and the language picker shows the coverage ("78%").
- **`client_version`** records which client the pack was made against, so
  the editor can list the keys added since.
- Limits: at most 512 KB unzipped; strings only, no nested files.

## 2. Text is the dangerous part

A theme is safe because it cannot change what the interface says. A language
pack changes every word of it, so three rules hold, enforced by the client
whatever the source:

- **Locked keys.** The strings of the recovery phrase, backup, key
  confirmation, device pairing and every security warning always come from
  the official catalogue in the chosen language (English when there is none).
  A pack's value for a locked key is ignored. The list lives with the
  catalogues and grows with them.
- **Text only.** A translation is never rendered as HTML. Formatting in a
  string (bold, a key name) uses i18n components with fixed tags supplied by
  the code, not markup inside the value.
- **Same placeholders.** A translated string must carry exactly the
  `{{placeholders}}` of the English one; a value that does not is dropped and
  falls back.

## 3. Where a language comes from

- **The user** installs a pack from a file or the directory and picks it in
  the language list; it follows them through the backup, and syncing through
  the home hub comes with themes.
- **The hub owner** uploads packs in the admin panel and picks the hub's
  default language. The hub validates the envelope and size, stores the
  packs, lists them publicly and serves each at a URL that carries its hash.
  The client served by that hub adds them to its language list; the user
  build offers them while that hub is open. **The user's own language always
  wins.**
- **The directory** gets a "Languages" section next to the theme sections,
  same signed listing with a download URL and SHA-256.

## 4. Before any of this: one catalogue at a time

Today all four catalogues are compiled into the bundle. Measured on
2026-08-29 the three unused ones cost 44.7 KB brotli (about 15 KB per
language). Packs need the catalogues loaded on demand (`import()` per
language, a chunk each), and the language list derived from what is
available instead of the `supportedLangs` array duplicated in the web and
desktop `main.tsx`.

Ruled out: the language in the URL (`/it/…`). The client is one SPA served by
every hub with an SPA fallback, and the path already carries `/join/{code}`
and `/hub/{slug}`; a language segment would ride along on shared invite links
and open in the sender's language.
