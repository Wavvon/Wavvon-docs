# Hub Discovery

How users find hubs, and how hub operators get their communities in front
of people. Three complementary layers — each useful alone, powerful
together.

---

## The three layers

| Layer | Mechanism | Who it serves |
|---|---|---|
| 1. Deep links | `wavvon://` URI scheme + manual address entry | "I have a link or an address" |
| 2. Directory | Website + API the client fetches from | "Show me what's out there" |
| 3. Social graph | Signed public hub profiles on user pages | "Where are my friends?" |

Layer 1 ships first (pure client work, no new service). Layers 2 and 3
follow.

---

## Layer 1 — Deep links and address entry

### URI scheme

The desktop client registers a `wavvon://` custom URI scheme with the OS
via Tauri's deep-link plugin (the web client has no protocol handler). The
host comes first: `wavvon://<host>[:port]/<invite>`, `wavvon://<host>/join/<invite>`,
plus channel and message permalinks. The accepted grammar, including
`https://` invite links and path-prefixed farm hubs (`/hub/<serial>`), is
Wavvon-clients `packages/core/src/parseHubInput.ts`. (The original design
here was `wavvon://join/<host>/<invite>`; it never shipped in that form.)

### Manual address entry

The "Add hub" dialog in the client grows a second input path: type or
paste a hostname (or a full `wavvon://` URL). The client resolves it the
same way as a deep link.

### Join preview flow

Both paths converge on the same sequence:

1. Client fetches `GET https://{host}/info` (public, no auth).
2. Client shows a **hub preview card**: name, icon, description,
   security level, whether approval is required.
3. User clicks **Join**. If an invite code is present it is used
   automatically. Otherwise the standard join / auth flow runs.

The preview card is also the component reused in the Directory (Layer 2)
and wherever a hub listing is rendered.

### Share button (hub admin)

Hub settings → Overview gains a **Share this hub** button. It generates
the correct `wavvon://join/<host>` URL (with or without an active invite
code the admin picks) and copies it to the clipboard. Optionally renders
a QR code for in-person sharing.

---

## Layer 2 — Hub directory

### Separate repository

The directory lives in a separate repo (`Wavvon-discovery`, a Next.js
project). Rationale: it is a web service with its own deployment
lifecycle (deploy a CSS fix without touching the desktop or hub
releases), its own CI/CD (Vercel / Cloudflare Pages), and a different
contributor profile (web developers who don't need Rust toolchains). The
API contract documented here is the boundary between repos.

### What the website is

A public-facing web application. Hub pages (the site also lists clients,
identities and hosting providers; Wavvon-discovery `src/app/`):

- **`/hubs`** — browseable, searchable hub listings (tag, language, name).
- **`/hubs/<pubkey>`** — individual hub page with full listing and a
  "Report a broken listing" link.
- ~~**`/submit`**~~ — removed 2026-08-28. A hub publishes its own listing
  (the owner's client pushes a payload the hub signs), so a web form for an operator to do it
  by hand was a second path to the same row.
- ~~**`/about`**~~ — never built; `/` is the landing page and `/docs` serves
  selected wiki pages.

The same listing data is served as a JSON API (see endpoints below) so
the desktop client can embed the directory natively.

### Hub listing schema

Fields stored per listing:

| Field | Source | Notes |
|---|---|---|
| `hub_url` | Operator-supplied | Canonical URL of the hub |
| `hub_pubkey` | Scraped from `/info` | Used as the listing's stable ID |
| `name` | Scraped from `/info` | Refreshed periodically |
| `description` | Scraped from `/info` | Refreshed periodically |
| `icon` | Scraped from `/info` | Base64 data URL |
| `min_security_level` | Scraped from `/info` | PoW requirement |
| `invite_only` | Scraped from `/info` | Whether open or approval-gated |
| `invite_code` | Operator-supplied | Optional; for invite-only hubs |
| `bio` | Operator-supplied | Long-form description (Markdown) |
| `tags` | Operator-supplied | Array of strings, e.g. `["gaming","en"]` |
| `language` | Operator-supplied | BCP-47 code, e.g. `"en"`, `"it"` |
| `listed_at` | Server-assigned | Submission timestamp |
| `last_verified_at` | Server-assigned | Last time `/info` was read (on submit/update; the directory never polls) |

`hub_pubkey` (from `/info`) is the primary key — a listing is
permanently tied to the hub's cryptographic identity regardless of URL
changes.

### Cryptographic ownership proof

Every hub has an Ed25519 keypair (`hub_identity.json`). Only the hub
operator holds the private key. Listings are therefore owned by proof,
not by account:

**Signing payload** (canonical — deterministic serialisation):
```json
{
  "hub_url": "https://hub.example.com",
  "tags": ["gaming", "en"],
  "language": "en",
  "bio": "...",
  "invite_code": "<only when the listing carries one>",
  "nonce": "<ISO-8601 timestamp, rounded to the minute>"
}
```

Keys are serialised in alphabetical order with tags sorted; `invite_code` is
included only when present, so nobody but the hub can change a listing's
invite link. The hub signs this with its private key. The directory service:

1. Validates every field's type and size, and requires a public `https` hub URL
   with no query or fragment.
2. Rejects if the nonce is more than 5 minutes off (replay protection).
3. Verifies the signature against the canonical payload — before fetching
   anything, so an unsigned caller cannot make the directory fetch a URL.
4. Fetches `GET {hub_url}/info` (no redirects, no private address, bounded
   body) and requires its `public_key` to be the signing key.
5. Stores the listing, keyed on `hub_pubkey`.

**Update / delete**: an update is a newly signed payload. A delete signs
the string `wavvon-directory/delete/v1:hub:<pubkey>:<listed_at>`
(Wavvon-discovery `src/lib/signed-listing.ts`) — naming `listed_at` so a
captured delete dies with that listing instead of removing a later
re-publication. No account recovery, no password reset — if you lose the hub
key you lose listing ownership.

### Signing flow from the admin UI

Hub settings → Overview → **Submit to directory** button. On click:

1. Desktop client calls a new Tauri command `sign_directory_listing`.
2. Command POSTs to the hub's own new endpoint
   `POST /admin/directory-sign` (authenticated, `directory.publish`) with the
   operator-supplied fields (tags, language, bio, invite code).
3. Hub signs the canonical payload with its private key and returns
   `{ signature, hub_pubkey, canonical_payload }`.
4. Client POSTs to the directory API `POST /api/hubs` with the signed
   bundle.
5. Client shows success / error.

The hub's private key never leaves the server.

### Anti-spam

What is built: the signature (only the hub's key can list it) and a
**Report a broken listing** link on each hub page that opens a GitHub
issue on Wavvon-discovery. Not built, deliberately:

- No PoW on submission — the hub-key signature plus the live `/info`
  check already bound a listing to a running hub.
- **The directory never probes hubs.** Scheduled re-verification and
  uptime tracking were built and removed (cost of the aggregate table, and
  nobody browses by uptime); a stale listing is reported by whoever
  noticed.
- No in-site moderation queue.

### API contract

All endpoints return `application/json`.

```
GET  /api/hubs
     ?q=<search>          substring match (LIKE) on name + bio
     &tag=<tag>           filter by tag (repeatable: &tag=gaming&tag=en)
     &language=<bcp47>    filter by language
     &sort=recent|members|online   default recent; a hub with no count
                          sorts after every hub that has one
     &page=<n>            pagination (default 1)

→ { hubs: HubListing[], total: number }

GET  /api/hubs/:pubkey
→ HubListing | 404

POST /api/hubs
     body: { hub_url, tags, language, bio, invite_code?,
             canonical_payload, hub_pubkey, signature }
→ 201 { ok: true } | 400 | 403   (upserts; no 409)

PUT  /api/hubs/:pubkey
     body: same as POST
→ 200 HubListing | 400 | 403 | 404

DELETE /api/hubs/:pubkey
     body: { hub_pubkey, signature }
     signature over "wavvon-directory/delete/v1:hub:<pubkey>:<listed_at>"
→ 204 | 403
```

`HubListing` shape (TypeScript reference):
```typescript
interface HubListing {
  hub_pubkey: string;      // hex Ed25519 public key — stable ID
  hub_url: string;
  name: string;
  description: string;
  icon: string | null;     // base64 data URL
  invite_only: boolean;
  min_security_level: number;
  invite_code: string | null;
  bio: string;
  tags: string[];
  language: string;
  listed_at: string;       // ISO-8601
  last_verified_at: string;
  member_count: number | null;  // read at each verification from the
  online_count: number | null;  // hub's public invite preview, GET /join/{invite_code};
  counts_at: string | null;     // null when there is no invite or no answer
}
```

### Client Discover tab

A new top-level view in the desktop client alongside DMs and hubs. It
fetches from the directory API (URL configurable in client settings,
defaults to the official instance). Shows:

- Search bar + tag/language filter chips
- Grid of hub cards (icon, name, tags, language, short description)
- Clicking a card → hub preview modal (same component as Layer 1 join
  flow) → Join button

The configured directory URL defaults to the official Wavvon instance
but can be pointed at any self-hosted directory.

---

## Layer 3 — Social hub profiles

### What it is

Each user can publish a **signed list of hubs** they want others to see.
Stored on their home hub, signed by the user's identity key. Anyone who
knows a user's public key can fetch it.

### Hub endpoint

```
GET /profile/:pubkey
→ {
    pubkey: string,
    display_name: string,
    avatar: string | null,
    public_hubs: PublicHubEntry[],
    signature: string        // signs canonical(pubkey + public_hubs + issued_at)
  }

interface PublicHubEntry {
  hub_url: string;
  hub_name: string;          // cached at signing time
  joined_at: string;
}
```

The endpoint is publicly readable without auth. The signature lets any
client verify the list was produced by the user, not the hub operator.

### Client integration

- User settings → Account → **Public hub profile** toggle + hub
  checklist (which of your hubs you want to make visible).
- On another user's profile card (DM list, member list), a **Hubs in
  common** or **Their hubs** section shows their public list with "Join"
  buttons.
- The directory website (`/user/:pubkey`) can display a user's public
  hubs as a shareable page.

### Deferred design questions

- Cross-hub profile lookup: if you meet someone on Hub A but their
  profile is signed on Hub B, how does Hub A's client find Hub B's
  `/profile` endpoint? One answer: the profile includes a
  `home_hub_url`; the client fetches from there. Needs more thought.
- Profile update propagation: when a user changes their public hub list,
  old cached copies on other hubs are stale. Probably fine to treat as
  eventually consistent given federation latency is already unbounded.

---

## Implementation order

1. **Layer 1: deep links + address entry + hub preview card** — pure
   client work, no new service. Adds `wavvon://` registration, reworks
   the "Add hub" dialog, adds the Share button to hub admin.
2. **Layer 2: directory API + website** — in the `Wavvon-discovery`
   repo. Parallel work: hub-side signing endpoint + Tauri command +
   "Submit to directory" UI.
3. **Layer 2: client Discover tab** — wires the directory API into the
   desktop client once the API is live.
4. **Layer 3: public profiles** — new hub endpoint + client UI. Design
   cross-hub lookup before starting.

---

## Open questions

- **Official directory URL** — `discovery.wavvon.io`? Needs a domain.
- ~~PoW level for submissions~~ / ~~scrape frequency~~ / ~~delisting by
  scrape~~ — moot: no PoW, and the directory never probes hubs (see
  Anti-spam). A hub delists itself with a signed delete.
- **Tech stack for `Wavvon-discovery`** — Next.js (TypeScript, SSR,
  easy Vercel deploy) is what the repo ships with, a natural fit given
  the desktop client is already TypeScript/React.
