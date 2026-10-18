# SDKs

**Proposal, not yet built.** Libraries that let a third party write a program
that talks to a hub, in six languages: TypeScript, Rust, Python, C#, Java, Go.
The rationale is in [decisions.md](decisions.md), "SDKs: one repo per
language, generated REST, one shared conformance suite"; this document is the
shape and the boundaries.

An SDK adds no concept the hub does not have. A program is a client
([apps.md](apps.md)): a keypair, the same challenge, the same session, the
same permissions. There is no bot account to model and no flag to set.

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

## 2. Tier 1: programs (bots and apps)

Everything [apps.md](apps.md) describes, and nothing beyond it:

- **Auth.** `POST /auth/challenge`, sign, `POST /auth/verify`, with an invite
  code on an `invite_only` hub. When the challenge response names
  `scheme: "tagged-v1"`, sign `b"wavvon/auth-challenge/v1\0" || challenge`
  (vector `auth_challenge_vector` in Wavvon-server:
  `crates/identity/tests/wire_vectors.rs`). With no `scheme` field (an older
  hub), sign the raw challenge, and **only** if it is exactly 32 bytes — the
  rule the federation client follows (`AUTH_CHALLENGE_LEN` in Wavvon-server:
  `crates/hub/src/auth/handlers.rs`); anything else is refused, so an SDK can
  never be used as a signing oracle for arbitrary bytes. An unknown `scheme`
  value is an error, not a fallback to raw.
- **REST** — the generated client, plus a pager that walks the keyset
  `cursor` to exhaustion (one page is not the list; see the server
  `CLAUDE.md` on pagination).
- **WebSocket events** — typed `hub_event` envelopes ([ws-protocol.md](ws-protocol.md)),
  tracking the last `seq` and sending `resume` with `since_seq` on reconnect;
  `replay_unavailable` is surfaced to the program, not swallowed. HTTP polling
  (`GET`/`DELETE /me/events`) for programs that hold no socket.
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

This tier needs only Ed25519, SHA-256, HMAC-SHA256 and HKDF. Every one of the
six languages has these in its standard library or one ubiquitous package
(Go and Java ship Ed25519 in the stdlib; Python needs `cryptography`; .NET
needs a library such as NSec, since the BCL has no Ed25519). That is why all
six can ship tier 1 before any of the heavy crypto exists.

**Two webhook signatures.** Slash and component dispatch is Ed25519 by the
hub key (Wavvon-server: `crates/hub/src/apps/dispatch.rs`); outgoing webhooks
are HMAC. Both now also send `X-Wavvon-Signature-V1` over
`tag || timestamp || body`, which is what an SDK verifier checks, with the
300-second window (§10, question 6). The older body-only signature is for
receivers written before it.

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
- **What it holds for tier 1.** The auth-challenge vector exists today. The
  slash-dispatch Ed25519 verification and the webhook HKDF+HMAC derivation are
  hub-side code with no vectors yet — they are added to the suite first,
  because they are exactly what a third party implements.
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
- **Mix the two axes.** Tier 1 is community-axis only; personal-axis state
  belongs to tier 2 and the home hub.

## 7. Versioning and release

Each SDK has its own semver, independent of the hub's version and of the
other SDKs — a hub release does not imply an SDK release, and a Python bug fix
does not bump Go. A minor version adds support for a capability; a hub that
lacks it is handled at runtime by §5, not by the version number. Pre-1.0 while
the hub is pre-1.0. The README of each SDK lists which capabilities each
feature needs and which conformance-suite version it is pinned to.

## 8. Tier 2: a full client (later)

E2E DMs (X25519 from the Ed25519 seed, AES-256-GCM, signed envelopes, group
sender keys — [e2e-encryption.md](e2e-encryption.md)), multi-device subkey
certs and pairing ([multi-device.md](multi-device.md)), the home hub list and
prefs blob ([home-hub.md](home-hub.md)), and voice over WebTransport with Opus
and voice E2E ([voice-transport-v2.md](voice-transport-v2.md)).

Why it waits: it is most of `wire-format.md` reimplemented byte for byte six
times; X25519 conversion and AEAD vary far more across ecosystems than
Ed25519; voice needs QUIC/WebTransport and native Opus, immature in several of
these languages. Tier 1 already makes a program a full participant in
cleartext, as apps.md describes for any client with no DH key.

## 9. Rollout

0. **Wavvon-server and Wavvon-docs first**: the vector JSON export, the
   missing tier-1 vectors, and an `operationId` on every operation in
   `openapi.yaml` (§3).
1. **TypeScript and Rust together.** TypeScript because
   Wavvon-clients: `packages/core` (`identity/wire.ts`, `apps.ts`, `hubWire.ts`)
   already implements most of tier 1; Rust because `wavvon-identity` already is
   the authority, so the Rust SDK depends on it rather than copying it.
2. **Python and C#** — Python as the most common language for small
   programs, C# because it has a reviewer in-house (§10, question 5).
3. **Go and Java**, community / experimental.

## 10. Questions settled before building

All answered on 2026-10-18.

1. **Package names**: npm `@wavvon/sdk`, crates.io `wavvon-sdk`, PyPI
   `wavvon-sdk`, NuGet `Wavvon.Sdk`, Maven `org.wavvon:wavvon-sdk` (falls back
   to `io.github.wavvon` if Maven Central cannot verify the `wavvon.org`
   domain), Go `github.com/Wavvon/Wavvon-sdk-go`. Reserve them before
   announcing.
2. **Licence: Apache-2.0**, not the hub's AGPL-3.0, so a closed-source program
   can link the SDK. Apache rather than MIT for its patent grant.
3. **`packages/core` is wrapped, not extracted**: `Wavvon-sdk-js` depends on a
   published `packages/core`. Two public surfaces, but a client release never
   waits on an SDK release. Extraction stays open if the two drift.
4. **`wavvon-identity` is published to crates.io** so the Rust SDK depends on
   it rather than copying it. Its API becomes public; `0.x` keeps it free to
   break while the hub is pre-1.0.
5. **Maintainers**: TypeScript, Rust, Python and C# are maintained in-house
   (C# has a reviewer). Java and Go ship marked **community / experimental**
   in their README until someone outside volunteers to maintain them; they
   still run the conformance suite.
6. **Replay protection for app webhooks** — *resolved*: every delivery now
   carries `X-Wavvon-Signature-V1` over `tag || timestamp || body`
   (wire-format.md, "Webhook delivery"; capability `webhooks.signedtimestamp`;
   [Wavvon-server#160](https://github.com/Wavvon/Wavvon-server/issues/160)).
   SDK verifiers check that header and the 300 s window; the body-only
   signature is for receivers written before it.
