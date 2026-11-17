# Language packs: languages a hub or a user adds

**Status: built** (2026-11-17): user install (Wavvon-clients#409), hub packs
and default language (Wavvon-server#401, Wavvon-clients#410), directory
listings (Wavvon-discovery#30). Not yet: installing from the directory inside
the client, and syncing installed packs through the home hub (it comes with
themes). Rationale in [decisions.md](decisions.md), "Language packs ride the
theme mechanism, with the security strings locked".

The official client ships English, Italian, Spanish and German. A language
pack adds another one without a release: a hub owner offers it to the people
on their hub, or a user installs it for themselves. It uses the package
mechanism of [themes.md](themes.md): the same zip loader, install and switch,
hub default with the user's choice winning, hash-pinned downloads, updates by
author key and name, and the full backup. A language is a **separate
package** from a theme, because the two choices are independent: one theme,
any language.

## 1. The package

A `.wavvonlang` file is a zip with `lang.json` at its root and nothing else.

```json
{
  "format": "wavvon.lang",
  "version": 1,
  "code": "sc",
  "name": "Sardu",
  "author_pubkey": "ed25519:…",
  "description": "…",
  "client_version": "0.10.0",
  "strings": { "settings.title": "Impostatziones" }
}
```

- **`code`** is a BCP-47 tag, kept in canonical case (`it-CH`, `zh-Hant`). A
  pack for a language the client ships (`it`) is allowed and overrides only
  the keys it carries, for a regional variant or a correction.
- **`strings`** has the shape of the client's own catalogues
  (Wavvon-clients: `packages/i18n/en.json`): flat, dotted keys, string
  values. Missing keys fall back to the official catalogue of the pack's
  language when there is one, then English, and the language picker shows the
  coverage ("Sardu (78%)"): the share of the translatable keys the pack
  carries after §2's filter.
- **`client_version`** records which client the pack was made against, so
  the editor can list the keys added since.
- `name` is 1 to 48 characters; `lang.json` is at most 512 KB unzipped.

## 2. Text is the dangerous part

A theme is safe because it cannot change what the interface says. A language
pack changes every word of it, so three rules hold, enforced by the client
whatever the source (Wavvon-clients: `packages/i18n/packs.ts`):

- **Locked keys.** The strings of the recovery phrase, backup, key
  confirmation, device pairing, identity handover and every security warning
  always come from the official catalogue in the chosen language (English
  when there is none). A pack's value for a locked key is ignored. The list
  (`LOCKED_KEY_PREFIXES`) lives with the catalogues and grows with them.
- **Text only.** A translation is never rendered as HTML. Formatting in a
  string uses named tags the code supplies to `Trans` (`<code>wavvon://</code>`,
  `<strong>…</strong>`), never markup the value brings with it, and a
  pack cannot add a tag: tags count as arguments in the next rule.
- **Same placeholders, valid ICU.** Messages are ICU (`{name}`, one brace;
  plurals as `{count, plural, …}`). A translated string must parse as ICU and
  carry exactly the arguments and tags of the English one, the check
  `check-i18n` already runs on the shipped catalogues (both use one
  `argNames`); a value that does not is dropped and falls back. Keys the
  client does not know are dropped too.

## 3. Where a language comes from

- **The user** installs a pack from a file in Settings → Appearance →
  Language, switches to it and removes it there. Packs live in IndexedDB,
  device-wide, and travel in the full backup as the optional `languages`
  section (restored by name, like themes).
- **The hub owner** uploads packs and picks the hub's default language in
  hub settings → Languages (owner only, not a delegable permission: a pack
  rewrites every word members read). The hub checks the envelope (a zip
  holding `lang.json` alone, format, version, BCP-47 code, name, string-only
  `strings`, 512 KB), keeps **one pack per code** (a new upload replaces it),
  and serves:
  - `GET /hub/languages` (public): `{ default, packs: [{ code, name, sha256 }] }`,
    the same object as `languages` on `/info` while there is any;
  - `GET /hub/languages/{sha256}`: the package, `immutable`;
  - `PUT /hub/languages`, `DELETE /hub/languages/{sha256}`,
    `PUT /hub/languages/default` `{ "code": "sc" | null }`.
  Capability `hub.languages`. The default is a code: the hub's own pack for
  that code if it has one, otherwise a language the client ships.
  The client checks each download against its hash, applies §2 as for any
  pack, and adds the packs to the language list while that hub is open. The
  **hub build** registers them before its first paint and uses the default
  when the user has not chosen a language; the user build and desktop offer
  the packs but never let a hub pick the language. **The user's own choice
  always wins.**
- **The directory** has a Languages page next to Themes: signed `wavvon.lang`
  listings with code, name, description, coverage, `client_version`, a
  download URL and its SHA-256, at `/api/languages`. The same author key,
  code and name republished is an update; delete is by signature, like every
  listing. The directory never hosts a pack.

## 4. One catalogue at a time

Done before packs (Wavvon-clients#438): English is bundled as the fallback
and every other catalogue is a chunk loaded on demand (`import()` per
language), and `LANGUAGES` in `@wavvon/i18n` is the one list of shipped
languages, replacing the array the web and desktop `main.tsx` each had.
Measured 2026-08-29, the three unused catalogues had cost 44.7 KB brotli in
every bundle.

Ruled out: the language in the URL (`/it/…`). The client is one SPA served by
every hub with an SPA fallback, and the path already carries `/join/{code}`
and `/hub/{slug}`; a language segment would ride along on shared invite links
and open in the sender's language.
