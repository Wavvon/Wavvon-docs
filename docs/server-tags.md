# Server Tags

**Status**: Parts 1–3 SHIPPED (self-tags, badge issue/accept/decline/
revoke, cross-hub revocation polling). Part 4 (user-configurable trust
roots) shipped 2026-08-30.

Two related-but-distinct things hide under "server tags." This doc
separates them on purpose:

1. **Self-tags** — free-form labels a hub operator puts on their own
   hub (`gaming`, `18+`, `english`, `music`). Cheap, self-asserted,
   discovery-facing. Anyone can claim any self-tag.
2. **Badges** — *portable, signed attestations one hub grants to
   another* (`certified by hub.example.com`). Cryptographically
   verifiable, not self-asserted, trust-bearing.

The shared word is "tag," but the trust models are opposites: a
self-tag asserts *nothing* (the operator says so), a badge asserts
*something* (a third hub vouches, with a signature). Conflating them
would let a spam hub mint itself a "verified" label, so they are kept
strictly separate below.

> Connects to [future-features.md](future-features.md) "hub
> certification (reputation)" — that section certifies **users**; badges
> here certify **hubs**. Same signing primitive, different subject.
> Connects to [hub-discovery.md](hub-discovery.md), which already
> carries operator-supplied `tags` on directory listings — self-tags
> here promote that field to a signed, hub-authoritative source.

---

## Part 1 — Self-tags

### What a self-tag is

A short free-form string. **Not a controlled taxonomy** — no central
authority decides which tags exist (that would need global
coordination we reject, see [decisions.md](decisions.md) "Federated,
not centralized"). The taxonomy emerges from use, exactly like the
existing directory `tags` field does today.

Normalisation rules (enforced where tags are set, hub-side):

- Lowercased, trimmed, ASCII-folded for matching; original casing kept
  for display.
- `1`–`32` chars, `[a-z0-9-]` after normalisation. No spaces (use `-`).
- Max **12** tags per hub. Caps the listing-stuffing attack.

The directory MAY publish a **suggested-tags** list (popular tags by
frequency) so clients can offer autocomplete. That list is a
convenience, never a gate — a hub can set a tag the directory has never
seen.

### Where self-tags live (hub-authoritative)

Today the directory stores `tags` as an operator-supplied field
([hub-discovery.md](hub-discovery.md) listing schema), separate from
the scraped `/info` fields. This design moves the **source of truth to
the hub** and makes it part of the signed listing:

- New `hub_settings` rows (single-row config table,
  `hub/src/db/migrations.rs` in **Wavvon-server**): `self_tags` (JSON
  array of normalised strings) and `nsfw` (boolean, surfaced as the
  reserved `18+` tag — kept as its own column because clients filter on
  it before rendering, see Part 3).
- The hub's existing `GET /info` (`hub/src/routes/health.rs` in
  **Wavvon-server**) gains a `self_tags: string[]` field and an
  `nsfw: boolean` field, alongside the `name`/`description`/`icon` it
  already returns.
- The directory's existing signed-listing payload
  ([hub-discovery.md](hub-discovery.md)) already includes `tags`; it now
  **scrapes** `self_tags` from `/info` rather than taking them as a
  free operator field on `POST /api/hubs`. The signature already proves
  hub identity, so the tags inherit that proof for free.

This is the two-axis model ([decisions.md](decisions.md)
"Personal state lives on a home hub list"): self-tags are
**community-axis** state — they describe the community and live on the
community hub. Nothing here touches a user's home hub.

### How self-tags are discovered

Both, with one source of truth:

- **`/info`** is authoritative. Any client (or the directory scraper)
  fetching `/info` gets the current tags directly from the hub.
- **The directory** caches them on its periodic `/info` re-scrape
  (already scheduled, every ~24 h per hub-discovery.md) and exposes
  them through the existing `GET /api/hubs?tag=<tag>` filter. No new
  directory endpoint needed — the `tag` query param already exists.

The directory is a cache and search index over hub-authoritative data,
not an authority itself. A self-hosted directory or a fork's default
directory sees the same `/info` and indexes identically.

### Abuse — anyone can claim any self-tag, and that's fine

Self-tags are *self-asserted by definition*. A scam hub can tag itself
`safe` `family-friendly` `verified`. The defences are:

- **Self-tags carry no authority.** The UI must never render a self-tag
  as a trust signal (see Part 3 — self-tags and badges are visually
  distinct). A self-tag is a search keyword, nothing more.
- **The 12-tag cap + normalisation** stop listing-stuffing.
- **The directory's existing abuse-report + manual-hide flow**
  ([hub-discovery.md](hub-discovery.md) anti-spam) covers a hub that
  mis-tags itself to game search. The directory operator can hide a
  listing; it cannot force the hub to change its `/info` (sovereignty —
  no hub controls another's labels).
- **Reserved tags**: the literal strings `verified`, `certified`,
  `official`, `partner` are **rejected as self-tags** at the hub-side
  setter. Those words imply third-party attestation, which is exactly
  what badges (Part 2) provide cryptographically. Refusing them as
  self-tags prevents the obvious confusion attack.

---

## Part 2 — Badges (federated portable attestations)

### What "portable" means

A badge is a **signed statement by Hub A about Hub B** that Hub B
carries with it and can present to anyone. "Portable" = the attestation
travels with the subject (Hub B serves it from its own `/info`) and is
verifiable offline by any third party holding Hub A's public key — no
call back to Hub A, no central registry.

This is the same shape as the hub-certifies-user primitive sketched in
[future-features.md](future-features.md), and the same shape as farm
session tokens ([decisions.md](decisions.md) "signed self-describing
tokens"): an Ed25519 signature over a canonical payload, verified
locally against a published public key.

### The badge payload

Hub A (issuer) signs, with its hub identity key (`hub_identity.json`,
the same key that signs directory listings and federation payloads):

```json
{
  "issuer_pubkey": "<hex Ed25519 of Hub A>",
  "issuer_url": "https://hub-a.example.com",
  "subject_pubkey": "<hex Ed25519 of Hub B>",
  "label": "raid-alliance-certified",
  "issued_at": "<ISO-8601>",
  "expires_at": "<ISO-8601 | null>"
}
```

The signature is over the canonical (deterministic) serialisation of
that payload, same convention as the directory listing signature in
[hub-discovery.md](hub-discovery.md). `subject_pubkey` binds the badge
to Hub B's identity, not its URL — a badge survives Hub B changing
domains, and cannot be lifted onto a different hub.

### Trust model — who can grant, who decides to show

- **Any hub can issue a badge to any other hub.** Issuance is just
  signing a statement; it needs no permission from the subject. (You can
  say "I vouch for them" about anyone.)
- **The subject hub decides whether to *display* it.** A badge only
  appears on Hub B's `/info` if Hub B's operator accepts it into its
  badge set. This is the sovereignty pillar
  ([decisions.md](decisions.md)): no hub can force a label onto
  another. Hub A signing a badge does not put anything on Hub B until
  Hub B opts in — exactly mirroring the alliance push-invite
  accept/decline flow ([decisions.md](decisions.md) "Alliance push
  invites").
- **The viewer decides whether to *trust* the issuer.** A badge is only
  meaningful if the viewer recognises `issuer_pubkey`. The client ships
  with **no built-in trust roots** — there is no Wavvon-blessed "verified
  by us" badge, because that would be a central authority. Trust is
  expressed by the viewer:
  - the viewer is a member of / trusts the issuer hub, or
  - the issuer is in the viewer's home-hub list, or
  - the issuer is a hub in an alliance the viewer's hub belongs to.

  Absent any of those, a badge renders as "vouched by `<issuer name>`
  (unknown issuer)" — informational, not a trust mark.

### Delivery (push-to-subject, pull-by-anyone)

Mirrors the alliance push-invite mechanics already decided:

- **Grant**: Hub A admin enters Hub B's URL and a label, Hub A POSTs the
  signed badge to Hub B's `POST /federation/badge-offer`
  (unauthenticated endpoint, validates payload shape + signature,
  inserts a pending row). Same trust placement as
  `/federation/alliance-invite` — the signature is the only authority
  that matters, so the transport needn't be separately authed.
- **Accept/Decline**: Hub B admin sees pending badge offers in
  Settings → Badges, accepts (moves to the active badge set, now served
  on `/info`) or declines.
- **Present**: Hub B's `/info` includes its accepted badges as an array
  of `{payload, signature}` pairs. Anyone — a client, the directory
  scraper, another hub — fetches `/info`, verifies each signature
  against `issuer_pubkey`, and checks `subject_pubkey` matches the hub
  it just fetched from.
- **Revoke**: two independent paths, both honoured:
  1. Hub B removes a badge from its own set (stops serving it). Always
     available — sovereignty cuts both ways.
  2. Hub A wants to *retract* a badge it issued. Since badges are
     pull-verified from Hub B, Hub A cannot un-serve it. Retraction
     uses **expiry** (`expires_at`) as the primary tool, plus an
     optional `GET /federation/badge-revocations` on the issuer that
     lists revoked `(subject_pubkey, label, issued_at)` triples a
     careful verifier MAY poll — same opt-in revoke-check shape as the
     farm token design ([decisions.md](decisions.md)). v1 relies on
     expiry; the revoke-check endpoint is deferred (see below).

### Relationship to user certifications and alliances

- **User certifications** ([future-features.md](future-features.md)):
  same primitive, `subject_pubkey` is a user instead of a hub. The two
  can share one canonical-payload signer in `hub/src/federation/`
  (Wavvon-server) with a `subject_kind: "hub" | "user"` discriminant.
  Designing badges first establishes that signer.
- **Alliances** ([alliances.md](alliances.md)): a badge is *not* an
  alliance. Alliances are mutual, create shared channels, and federate
  traffic. A badge is a one-way vouch with zero runtime coupling — Hub A
  can badge Hub B without either joining the other's alliance. They
  compose: an alliance might issue a "member of <alliance>" badge to
  each member hub, but that's a convention, not a mechanism.

---

## Part 3 — Client UI

Self-tags and badges are rendered **distinctly** so a self-asserted
keyword is never mistaken for a third-party attestation.

- **Hub preview card** (the shared component from
  [hub-discovery.md](hub-discovery.md), reused in deep-link join,
  Discover grid, and directory web pages):
  - Self-tags render as plain, low-emphasis chips (search keywords).
  - Badges render as a separate row with the issuer name and a
    trust-state affordance (trusted issuer → solid; unknown issuer →
    muted with an "(unknown issuer)" qualifier). Clicking a badge shows
    issuer pubkey + URL so the user can judge.
  - An `18+` / NSFW hub shows the reserved indicator and is
    filtered/blurred per the client's content setting before the card
    renders.
- **Discover tab** (`Wavvon-desktop`, mirrored in `Wavvon-web` /
  `Wavvon-android`): the existing tag/language filter chips now read
  the hub-authoritative self-tags via the directory's `?tag=` filter.
  Add a "trusted-badge" filter only if/when trust roots are
  user-configurable (deferred). NSFW filter toggle (default: hide).
- **Hub Settings → Discovery** (admin): edit self-tags (chip input with
  directory-suggested autocomplete), NSFW toggle. This is the same
  panel that already hosts "Submit to directory."
- **Hub Settings → Badges** (admin): two sections — *Badges we hold*
  (accepted, with decline-now/remove) and *Pending offers*
  (accept/decline). A *Grant a badge* form (target hub URL + label)
  lives here too, for issuing badges to others.

No UI surfaces a Wavvon-official verified mark anywhere — there is no
such authority.

---

## Data model & route changes (all in Wavvon-server unless noted)

**Hub DB** (`hub/src/db/migrations.rs`):
- `hub_settings`: new rows `self_tags` (JSON text array), `nsfw`
  (boolean).
- New table `hub_badges` (badges this hub holds and serves):
  `subject_pubkey`, `issuer_pubkey`, `issuer_url`, `label`, `issued_at`,
  `expires_at`, `signature`, `accepted_at`. `subject_pubkey` is always
  this hub's own key (kept for payload completeness / verification).
- New table `pending_badge_offers` (offers awaiting accept/decline):
  same columns as a badge plus `received_at`. Mirrors
  `pending_alliance_invites`.

**Hub routes**:
- `GET /info` (`routes/health.rs`): add `self_tags`, `nsfw`, and
  `badges: { payload, signature }[]` (accepted, non-expired only).
- `routes/discovery.rs` (or extend the existing directory-sign route):
  `PATCH /admin/discovery` to set `self_tags` + `nsfw` (admin-only,
  enforces normalisation + the 12-cap + reserved-word rejection).
- `routes/badges.rs` (new): `POST /admin/badges/grant` (admin issues a
  badge to a target URL → POSTs to target's `/federation/badge-offer`),
  `GET /admin/badges/pending`, `POST /admin/badges/pending/:id/accept`,
  `POST /admin/badges/pending/:id/decline`, `GET /admin/badges`,
  `DELETE /admin/badges/:id`.
- `federation/handlers.rs`: `POST /federation/badge-offer`
  (unauthenticated, validates payload shape + Ed25519 signature +
  `subject_pubkey == this hub`, inserts pending row).

**Directory** (`Wavvon-discovery`):
- Listing scraper reads `self_tags` and `nsfw` from `/info` instead of
  taking `tags` as a free operator field on submit. Existing `?tag=`
  filter and `HubListing.tags` shape are unchanged on the wire.
- Optional later: surface `badges` and an `nsfw` filter. Not required
  for v1.

**Client** (`Wavvon-desktop`, mirrored on `Wavvon-web` /
`Wavvon-android`):
- Hub preview card: distinct self-tag vs badge rendering + NSFW gate.
- Hub Settings: Discovery panel tag editor + NSFW toggle; new Badges
  tab.
- Tauri commands: `set_discovery_tags`, `grant_badge`,
  `list_pending_badges`, `accept_badge`, `decline_badge`,
  `list_badges`, `remove_badge` (`Wavvon-desktop` `src-tauri`).

---

## What's deferred

- **Issuer revoke-check endpoint** (`/federation/badge-revocations`
  polling). v1 leans on `expires_at`; build the poll only if retraction
  before expiry becomes a real need — same posture as farm token
  revoke-check.
- **User-configurable trust roots** — designed in Part 4 below.
- **User certifications** reusing this signer (subject = user). Lands
  with the [future-features.md](future-features.md) anti-spam Layer 2;
  this doc only establishes the hub-subject case and the shared signer.
- **Badge transitivity / web-of-trust** ("Hub C trusts whoever Hub A
  trusts"). **Won't do** — see [ROADMAP.md](../ROADMAP.md) 💤. It
  reintroduces global trust reasoning we don't want, and
  [hub-certifications.md](hub-certifications.md) §10 reaches the same
  verdict independently for user certs. Trust stays one hop,
  viewer-decided.
- **Directory-side badge search / "browse certified hubs" view.**
  Discovery filter on badges waits until trust roots exist; otherwise
  it would rank by an authority we don't have.
- **Controlled tag taxonomy / localisation of tags.** Tags stay
  free-form ASCII; if localisation is ever wanted it layers on as a
  display mapping, not a change to the stored keyword.
- **Realtime push of new badge offers** to logged-in admins (poll on
  Settings mount for v1, same as alliance pending invites).

---

## Part 4 — User-configurable trust roots

**Status**: **shipped 2026-08-30**. Web client only in the end — the hub
side turned out to be nothing at all, because the `settings` map already
carries arbitrary keys, so the trust roots ride in it with no hub change
whatever.

Two notes on what the build differed from the plan below:

- **The badge popover this planned to hang "Trust this issuer" on does not
  exist**, so the affordance lives where a viewer actually meets an issuer
  today: on each badge row in the certifications panel. Settings → Privacy is
  the fixed home for reviewing and removing, exactly as designed.
- **The "fourth source" framing overstated what was there.** There was no
  trust-state resolver to extend: badges rendered identically whoever signed
  them. `packages/ui/src/utils/trustRoots.ts` is that resolver now, and it
  answers from two sources — an explicit root, and a hub the viewer is a
  member of. Home-hub list and alliance can join it the day something needs
  them.

Today a badge or a cert from an issuer the viewer has no relationship
with renders "(unknown issuer)" and there is nothing the viewer can do
about it. Part 4 gives them a knob.

### Decision — trust roots are personal-axis prefs, not a client-local list

A trust root is `{ pubkey, label }`. The set lives in the **encrypted
prefs blob on the user's home hub** — the same blob that carries theme,
language, ignored users and (since 2026-08-21) the generic `settings`
map ([decisions.md](decisions.md) "Settings follow the identity"). It
therefore follows the identity across devices and survives a
`.wavvon-backup` restore, with no new endpoint, no new table, and no
wire-format change.

Concretely: one allowlisted key in
`clients/apps/web/src/utils/syncedSettings.ts`, value a JSON array of
`{pubkey, label}`. Under that file's own stated rule — "a choice about
yourself travels, a fact about this machine does not" — whom you trust
is unambiguously a choice about yourself.

### Alternatives considered

- **`localStorage` only** — rejected: it is exactly the class of gap the
  prefs-blob work was done to close, and a trust list that vanishes when
  you open the app in another browser is worse than none, because the
  badge silently downgrades to "(unknown issuer)" with no explanation.
- **A typed field on the prefs blob** (like `blocked_users`) — rejected:
  a typed field is a wire-format change across the identity crate, the
  TS mirror, the desktop Rust mirror and the test vectors. The `settings`
  map exists precisely so a new preference costs one line.
- **Hub-side trust roots** (`hub_settings`) — rejected: that is the
  *admin's* trust decision, which already exists as
  `cert_trusted_issuers`. Part 4 is the *viewer's*, and viewer state on a
  community hub violates the two-axis rule.

### Tradeoff

Trust roots are read at render time from a blob pulled once per page
load, so adding a root on another device shows up on this one at its
next load — the propagation limit already recorded for every other synced
setting. Acceptable: a trust root is not time-critical.

### Client surface

All in `clients/packages/ui` (prop-fed) plus the web wiring.

- **Settings → Privacy** gains a "Trusted issuers" section: the list
  with label + short pubkey, a remove button, and an add form (paste a
  hub pubkey, optional label). Reuses the `settings-section` layout and
  the chip-list pattern the ignored-users list already uses. Fixed home,
  one place — no context-dependent relocation.
- **Add from context.** The badge detail popover (Part 3, "clicking a
  badge shows issuer pubkey + URL") gains **"Trust this issuer"**, which
  appends the root. This is how anyone will actually add one; the
  Settings list is for review and removal.
- **Rendering.** The existing trust-state resolution — membership,
  home-hub list, alliance — gains the trust-root set as a fourth
  source. A badge from a trust root renders solid, same as a badge from
  a hub you are a member of. `MyCertificationsSection` and the hub
  preview card both read the same resolver; put it in
  `clients/packages/ui/src/utils/` so there is one.

### Out of scope, deliberately

- **No effect on admission.** A user's trust roots change *rendering*
  only. They never satisfy a hub's `cert_mode` gate — that is the
  admin's `cert_trusted_issuers`, and letting a viewer's preference
  clear an admin's bar would be the "pass factory" failure
  [hub-certifications.md](hub-certifications.md) §11 rejects.
- **No shipped defaults.** The set starts empty. There is no
  Wavvon-blessed root, because there is no such authority.
- **No transitivity.** A trust root vouches for what it signed, not for
  what it trusts. See Won't do.
- **No directory badge filter.** "Browse certified hubs" waits for
  demand, not for this — ranking by trust roots would rank by one
  user's opinion.
