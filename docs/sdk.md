# SDKs

**Tier 1 built and published to every registry (2026-11-13).** Thin libraries
for anyone writing a program that talks to a hub, whether that program is a
bot or a brand-new third-party client, in six languages:
[TypeScript](https://github.com/Wavvon/Wavvon-sdk-js),
[Rust](https://github.com/Wavvon/Wavvon-sdk-rust),
[Python](https://github.com/Wavvon/Wavvon-sdk-python),
[C#](https://github.com/Wavvon/Wavvon-sdk-dotnet),
[Go](https://github.com/Wavvon/Wavvon-sdk-go) and
[Java](https://github.com/Wavvon/Wavvon-sdk-java) (the last two community /
experimental). Each passes the conformance vectors and a smoke test against a
real hub binary: authenticate, post, register a command, receive and answer a
signed invocation.
The rationale is in [decisions.md](decisions.md), "SDKs: one repo per
language, generated REST, one shared conformance suite"; this document is the
shape and the boundaries.

An SDK adds no concept the hub does not have. A program is a client
([apps.md](apps.md)): a keypair, the same challenge, the same session, the
same permissions. There is no bot account to model and no flag to set.

**Mechanism, never policy.** An SDK exposes what the hub offers (the API,
chat, DMs including E2E, voice, mini-app frames, admin, integrations,
webhooks, events) and decides nothing a program might want to decide
differently: when to answer, whom to trust beyond the protocol, what to
persist, how to react to a moderator. Where a choice exists, the SDK raises
an event or takes a hook with a plain default, and the program sets it.

---

## 1. Repos and what is in each

One repo per language under the Wavvon organization: `Wavvon-sdk-js` (npm),
`-rust` (crates.io), `-python` (PyPI), `-dotnet` (NuGet), `-java` (Maven
Central), `-go` (the repo is the module). Each repo carries three layers, and only the middle one is hand-written:

1. **Generated REST client** from `openapi.yaml` (§3).
2. **Hand-written core**: auth, session lifecycle, retry (§5), the WebSocket
   event loop, webhook verification, capability checks, paging helpers.
3. **The conformance suite**, pulled in CI, never copied (§4).

Why not a monorepo: each ecosystem's release tooling (npm provenance, crates.io
publish, PyPI trusted publishing, NuGet, Maven Central staging, Go module tags)
assumes one package root per repository, and a contributor who writes Python
should not need six toolchains to open a PR. The price is that a cross-SDK
change is six PRs. The conformance suite is what makes that price bearable:
drift fails CI in the repo that drifted, instead of relying on someone
remembering the other five.

## 2. Tier 1: the community axis, in cleartext

Everything [apps.md](apps.md) describes, and nothing beyond it:

- **Auth.** `POST /auth/challenge`, sign, `POST /auth/verify`, with an invite
  code on an `invite_only` hub. A current hub names `tagged-v2`: sign the v2
  answer bound to the hub's public key as its `/info` presents it (vector
  `bound_auth_challenge`, layout in [wire-format.md](wire-format.md)); an older
  hub names `tagged-v1`: sign `b"wavvon/auth-challenge/v1\0" ||
  challenge` (vector `auth_challenge` in Wavvon-server:
  `crates/identity/wire-vectors.json`). Either way only over a challenge of exactly
  `AUTH_CHALLENGE_LEN` (32) bytes. The hub verifies the tagged form only
  (`verify_auth_challenge` in `crates/identity/src/wire.rs`); the raw-challenge
  fallback for hubs without a `scheme` field is gone, and the federation
  client likewise refuses a challenge that does not name the scheme. So a
  missing or unknown `scheme` is an error, never a fallback, and an SDK can
  never be used as a signing oracle for arbitrary bytes.
- **REST** — the generated client, plus a pager that walks the keyset
  `cursor` to exhaustion (one page is not the list; see the server
  `CLAUDE.md` on pagination).
- **WebSocket events** — typed `hub_event` envelopes ([ws-protocol.md](ws-protocol.md)),
  tracking the last `seq` and sending `resume` with `since_seq` on reconnect;
  `replay_unavailable` is surfaced to the program, not swallowed. HTTP polling
  (`GET /me/events?cursor=<seq>`) for programs that hold no socket: the same
  envelopes from the same audit log, a 410 for `replay_unavailable`.
- **App registration** — `PUT /me/app/profile`, `/commands`, `/subscriptions`,
  gated on the `apps.register` capability and the program's own role.
- **Slash commands and component interactions** — a webhook handler that
  verifies the hub's signature, decodes the invocation, and returns the reply
  shape (ephemeral, embeds, components, game launch card).
- **Outgoing webhooks** — a verifier for the HMAC-SHA256 deliveries in
  [outgoing-webhooks.md](outgoing-webhooks.md) §4 (`HKDF-SHA256` of the
  secret, then HMAC over the body).
- **Mini-apps** — the host side of [mini-apps.md](mini-apps.md): answering
  `app_join` and relaying `mini_app_message`. The in-webview game SDK in
  [gaming.md](gaming.md) is a separate, browser-only surface and stays where
  it is.
- **Invite-directory listing** — publish and remove the program's own signed
  `wavvon.identity` listing ([invite-directory.md](invite-directory.md) §6a):
  same bytes as the clients' builder, `pubkey` from the program's key, one
  `contact` route checked before sending, signed delete over the held
  `listed_at`. Built in JS (`publishListing`, `npx @wavvon/sdk publish`) and
  Rust (`publish_listing`).

This tier needs only Ed25519, SHA-256, HMAC-SHA256 and HKDF. Every one of the
six languages has these in its standard library or one ubiquitous package
(Go and Java ship Ed25519 in the stdlib; Python needs `cryptography`; .NET
needs a library such as NSec, since the BCL has no Ed25519). That is why all
six can ship tier 1 before any of the heavy crypto exists.

**Two webhook signatures.** Slash and component dispatch is Ed25519 by the
hub key (Wavvon-server: `crates/hub/src/apps/dispatch.rs`); outgoing webhooks
are HMAC. Both send only `X-Wavvon-Signature-V1` over
`tag || timestamp || body` (with `X-Wavvon-Timestamp`), which is what an SDK
verifier checks, with the 300-second window (§10, question 6). The older
body-only `X-Wavvon-Signature` is no longer sent.

## 3. REST clients generated from the spec

`openapi.yaml` is generation input, not documentation. That is viable only
because `scripts/check-openapi-coverage.mjs` fails CI when the hub's routes
and the spec disagree; a spec nobody checks would generate a client for an API
that does not exist.

Proposed generators: TypeScript `openapi-typescript` + `openapi-fetch` (types,
no runtime model classes); Rust `progenitor`; Python `openapi-python-client`;
C# Kiota; Java `openapi-generator` with the native `HttpClient` library; Go
`oapi-codegen`. Generated code is committed, regenerated by a script pinned to a docs commit,
and the SDK records which spec commit it was built from.

Generators name methods after `operationId`. The spec has none today, so
every generator would derive names from the path (`getChannelsChannelIdMessages`),
and a renamed path would rename a public method. Phase 0 adds a stable,
unique `operationId` to every operation, and the coverage script fails on one
that lacks it. The WebSocket
protocol has no machine-readable spec; its event types are hand-written from
[ws-protocol.md](ws-protocol.md) and checked against recorded frames in the
conformance suite. An AsyncAPI spec would let them be generated too — deferred
until two SDKs exist to justify it.

## 4. One conformance suite

Six more implementations of every signing rule, each with its own copy of the
test vectors, guarantees copy drift. So the vectors become **data**, with one
authority:

- **Where.** Wavvon-server: `crates/identity` owns a JSON file of vectors
  (name, inputs, expected bytes as hex, expected signature as hex).
  `wire_vectors.rs` asserts *from that file* instead of from hex literals, so
  the authority cannot drift from its own export.
- **How it ships.** Attached to each Wavvon-server release as an asset, and
  readable at a pinned commit. Each SDK's CI fetches a pinned version and
  asserts every vector its tier implements; bumping the pin is the PR that
  shows what changed.
- **What it holds for tier 1.** `auth_challenge`, `bound_auth_challenge`,
  and the two webhook signatures (`webhook_delivery_hub` for Ed25519
  dispatch, `webhook_delivery_outgoing` for the HKDF+HMAC deliveries).
- **The existing mirrors join it.** The clients' TypeScript and desktop Rust
  mirrors move from copied vectors to the same file, so the discipline in
  [wire-format.md](wire-format.md) has one source rather than three.

Vectors check bytes, not behaviour. Each SDK's CI also runs a smoke test
against the real hub binary (the published ghcr image): authenticate, post,
register a command, receive and answer an invocation. In-process tests have
missed every cross-process bug this project has had.

## 5. Behaviour every SDK must implement

- **Capabilities, never versions.** Read `GET /info` `capabilities`; a feature
  that needs a string the hub lacks raises a typed "unsupported by this hub"
  error. Never a silent no-op, never a version comparison.
- **429 is "not now", never "no".** The auth limiter is per IP and one login
  costs two requests, so a program on shared hosting meets it in normal use.
  The hub sends no `Retry-After`, so retry with capped exponential backoff and
  jitter. A transient failure (429, 5xx, timeout, socket drop) must never be
  returned as a definitive answer — not "not a member", not "no key", not
  "empty list". This is the bug class in the clients `CLAUDE.md` ("silent
  fallthroughs"), including the demo program that exited on a 429 while
  waiting to be invited.
- **Unknown is loud.** An unknown WebSocket event type or enum value reaches
  the program as an "unknown" variant with the raw payload, never `Other => {}`.
- **Re-auth on its own.** A session that dies is re-established with the
  retry above, and the reconnecting state is visible to the program.

## 6. What an SDK must never do

- **Hold anything a hub could reconstitute you from.** The seed stays where
  the operator put it (a file or an environment variable the program reads);
  no SDK call sends a seed, phrase or private key anywhere. A hub holds what
  you signed or encrypted, never what can reconstitute you
  ([identity-vault.md](identity-vault.md) is the rejected alternative).
- **Invent a wire format.** Every signed byte sequence comes from
  [wire-format.md](wire-format.md) and the conformance suite. An SDK that needs
  a new one opens a server-side change first.
- **Model a bot as a kind of account**, or send `is_bot`. That path was
  deleted ([apps.md](apps.md) §1).
- **Mix the two axes.** Tier 1 is community-axis only. E2E DMs
  ([sdk-dm.md](sdk-dm.md)) are personal-axis and keep their state (ratchet
  sessions, pins) in the program's store, never in a community hub's tables;
  the rest of the personal axis (home hub list, prefs, devices) is tier 2.

## 7. Versioning and release

Each SDK has its own semver, independent of the hub's version and of the
other SDKs — a hub release does not imply an SDK release, and a Python bug fix
does not bump Go. A minor version adds support for a capability; a hub that
lacks it is handled at runtime by §5, not by the version number. Pre-1.0 while
the hub is pre-1.0. The README of each SDK lists which capabilities each
feature needs and which conformance-suite version it is pinned to.

## 8. Tier 2: voice and E2E DMs first, the rest of a full client after

Tier 2 is what a full client holds beyond tier 1: voice over a WebRTC data channel
with Opus and voice E2E ([voice-transport-v3.md](voice-transport-v3.md)), E2E DMs
([e2e-encryption.md](e2e-encryption.md)), multi-device subkey certs and
pairing ([multi-device.md](multi-device.md)), and the home hub list and prefs
blob ([home-hub.md](home-hub.md)).

**Voice and E2E DMs come first**, together, because one published DH key
enables both and a program holding it gets both from the clients anyway
(decisions.md, "SDK voice and E2E DMs: the SDK offers the mechanism, the
program sets the policy"). Specs: [sdk-voice.md](sdk-voice.md) and
[sdk-dm.md](sdk-dm.md). Per language:

| SDK | Voice | E2E DMs | Tracking |
|---|---|---|---|
| Rust | built (`str0m`); settled the API | built | [Wavvon-sdk-rust#19](https://github.com/Wavvon/Wavvon-sdk-rust/issues/19) |
| Go | built (`pion/webrtc`) | built | [Wavvon-sdk-go#15](https://github.com/Wavvon/Wavvon-sdk-go/issues/15) |
| Python | built (`aiortc`) | built | [Wavvon-sdk-python#14](https://github.com/Wavvon/Wavvon-sdk-python/issues/14) |
| TypeScript | built (`werift`, Opus only) | not yet (`@noble/curves` has X25519) | [Wavvon-sdk-js#24](https://github.com/Wavvon/Wavvon-sdk-js/pull/24) |
| C# | built (SIPSorcery, Opus only) | not yet (X25519, HKDF, AES-GCM via the BCL or NSec) | [Wavvon-sdk-dotnet#12](https://github.com/Wavvon/Wavvon-sdk-dotnet/pull/12) |
| Java | built (`webrtc-java`, Opus only) | not yet (JDK 11+ has X25519, AES-GCM) | [Wavvon-sdk-java#12](https://github.com/Wavvon/Wavvon-sdk-java/pull/12) |

E2E DMs need no transport beyond REST and the WebSocket every SDK already
holds, so voice is never what holds them back.

The rest of tier 2 (devices, pairing, home hub list, prefs) waits: it is most
of the remaining `wire-format.md` reimplemented per language, and nothing in
tier 1, voice or DMs depends on it. Tier 1 already makes a program a full participant in
cleartext, as apps.md describes for any client with no DH key.

## 9. Rollout

0. **Wavvon-server and Wavvon-docs first**: the vector JSON export, the
   missing tier-1 vectors, and an `operationId` on every operation in
   `openapi.yaml` (§3).
1. **TypeScript and Rust together.** TypeScript because it is what the
   clients are written in; Rust because it is what the hub is written in, so
   its conformance failures are the easiest to read against the authority.
2. **Python and C#** — Python as the most common language for small
   programs, C# because it has a reviewer in-house (§10, question 5).
3. **Go and Java**, community / experimental.

All six shipped tier 1 by 2026-11-13. Tier 2 starts with voice and E2E DMs
in the order of the §8 table: Rust, then Go, then Python. Moving voice to
WebRTC (2026-11-21) brought voice to TypeScript, C# and Java; their E2E DMs
can follow whenever someone takes them up.

## 10. Questions settled before building

All answered on 2026-10-18.

1. **Package names**: npm `@wavvon/sdk`, crates.io `wavvon-sdk`, PyPI
   `wavvon-sdk`, NuGet `Wavvon.Sdk`, Maven `org.wavvon:wavvon-sdk` (falls back
   to `io.github.wavvon` if Maven Central cannot verify the `wavvon.org`
   domain; it did fall back: published as `io.github.wavvon:wavvon-sdk`), Go `github.com/Wavvon/Wavvon-sdk-go`. Reserve them before
   announcing.
2. **Licence: Apache-2.0**, not the hub's AGPL-3.0, so a closed-source program
   can link the SDK. Apache rather than MIT for its patent grant.
3. **`packages/core` is neither wrapped nor extracted**: `Wavvon-sdk-js`
   depends only on `@noble/curves` and `@noble/hashes`. First answered
   "wrapped"; reversed the same day on reading the package — of tier 1 it
   holds only the challenge signing and `parseGameLaunchCard`, and it is
   private, unbuilt and peer-depends on React, so wrapping it meant
   publishing it and making every bot install React. The conformance suite
   (§4) is what keeps the two implementations from drifting.
4. **`wavvon-identity` is Apache-2.0 and the Rust SDK depends on it.** The
   crate was AGPL-3.0 with the rest of Wavvon-server, and an Apache-2.0 SDK
   linking it would have handed every program the AGPL, undoing question 2;
   for a few hours the Rust SDK carried its own copy of the primitives. The
   crate was relicensed the same day (decisions.md, "The wire-format crate
   is Apache-2.0"); the hub stays AGPL. It is published on crates.io:
   `release.yml` in Wavvon-server publishes it with each hub release whose
   crate version is new.
5. **Maintainers**: TypeScript, Rust, Python and C# are maintained in-house
   (C# has a reviewer). Java and Go ship marked **community / experimental**
   in their README until someone outside volunteers to maintain them; they
   still run the conformance suite.
6. **Replay protection for app webhooks** — *resolved*: every delivery now
   carries `X-Wavvon-Signature-V1` over `tag || timestamp || body`
   (wire-format.md, "Webhook delivery"; capability `webhooks.signedtimestamp`;
   [Wavvon-server#160](https://github.com/Wavvon/Wavvon-server/issues/160)).
   SDK verifiers check that header and the 300 s window; the body-only
   signature has since been dropped.
