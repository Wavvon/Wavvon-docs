# LAN / Offline Mode

Run a hub on a local network with no internet, no public DNS, and no
CA-issued certificate — and have clients on that network find it and
connect. "Works at a LAN party" is something centralized platforms
structurally cannot do; it's a launch-post headline and a real use case
(events, classrooms, air-gapped teams).

**Status: designed, not implemented.** ROADMAP wishlist item. Ships
**server-first**; native-client consumption lags (see §5 — the browser
is the hard part, and web is the current delivery target, so this is
partly future-facing).

---

## 1. The two problems

A hub today assumes an internet deployment: a public DNS name, a
CA-issued TLS cert (`WAVVON_TLS_CERT`/`WAVVON_TLS_KEY`, else plaintext
HTTP with a loud warning — `main.rs:559`), and clients that reach it by
typed URL or invite link. On a LAN, two things break:

1. **Discovery** — no DNS, so "what's the hub's address" has no answer.
2. **Trust bootstrap** — no public CA can issue a cert for
   `192.168.1.50`, and browsers reject self-signed certs and block
   mixed content.

LAN mode solves both without a central component (federated pillar
intact).

## 2. Discovery — mDNS / DNS-SD

The hub optionally advertises itself via multicast DNS (the
`_wavvon._tcp.local` service type) when LAN mode is on. TXT records
carry: `name` (hub display name), `fp` (the cert/pubkey fingerprint,
§3), `port`, `tls` (`self` | `none`), `v` (protocol version). Clients
on the same L2 segment browse the service type and present a "hubs on
your network" list.

- New optional hub component behind the LAN-mode flag; a small mDNS
  responder (e.g. an `mdns-sd`-class crate) — no dependency added to
  the default build path if feature-gated.
- **Native clients (desktop/Android)** can browse mDNS directly.
- **Browsers cannot do mDNS.** The web client can't auto-discover; a
  LAN hub still reaches web users via a typed `http://192.168.…:port`
  URL or a QR code the operator displays. Documented limitation, not a
  bug (§5).

## 3. Trust bootstrap — three tiers, safety-gated

| Tier | Mechanism | Who can use it |
|---|---|---|
| **CA cert** (today) | `WAVVON_TLS_CERT`/`_KEY` from a real CA | Everyone; unchanged. The only option for public hubs. |
| **Self-signed + fingerprint pinning** | Hub generates a self-signed cert on first run; its SHA-256 fingerprint goes in the mDNS `fp` TXT record and the invite/QR. Native clients pin it TOFU-style, verified against the out-of-band fingerprint. | Native clients only (browsers reject self-signed). |
| **Plaintext HTTP** | No TLS; the existing plaintext path, but gated to private networks | Native clients, and web **only if the web client is itself served over plain `http` from the LAN** (http page → http hub = no mixed-content block). |

The self-signed cert is generated once and persisted (e.g.
`~/.wavvon/lan-cert.{pem,key}`); its fingerprint is stable so the
invite/QR stays valid across restarts.

## 4. The safety invariant (threat model)

**The no-CA paths must be impossible to enable accidentally on a
public hub.** [threat-model.md](threat-model.md). Enforcement:

- LAN mode is an **explicit opt-in** — `WAVVON_LAN_MODE=1` (or a config
  key). Never inferred, never default.
- When LAN mode is on, the hub **refuses to serve on a non-private
  address**: it checks its bind/advertised address is loopback,
  RFC 1918 (`10/8`, `172.16/12`, `192.168/16`), or link-local
  (`169.254/16`, `fe80::/10`), and **exits with an error** if asked to
  bind a public/routable address. So a self-signed or plaintext hub
  physically cannot be exposed to the internet through this flag.
- Conversely, the self-signed and plaintext-on-private paths are
  **only** reachable with `WAVVON_LAN_MODE=1` — a normal (public) hub
  with no TLS still just gets today's plaintext-with-warning behavior,
  unchanged, and never advertises over mDNS.
- Loud startup banner: `LAN MODE — serving <scheme> on <private addr>;
  NOT reachable from the internet; trust bootstrapped via <fingerprint
  | plaintext>`.
- `doctor` (the pre-flight check, `main.rs`) gains a LAN-mode section:
  confirms the bind address is private, prints the fingerprint and the
  join URL/QR payload.

## 5. Client reality and delivery-target tension

Web is the current delivery target ([decisions.md]), but the browser
is exactly where LAN mode is weakest: no mDNS, self-signed certs
rejected, mixed-content blocked. So:

- **Server side ships now and stands alone**: mDNS advertisement,
  self-signed cert generation + fingerprint, the private-address guard,
  the `doctor` support. A LAN hub is fully functional and safe the day
  the server lands.
- **Web client on a LAN** works today already in the plaintext tier if
  the web bundle is served over `http` from the same LAN (many
  self-host setups do exactly this) — no code change needed beyond the
  server guard. The self-signed tier does **not** help browsers.
- **Full LAN UX** (in-app "hubs on your network" list, fingerprint
  pinning, QR scan) is **native-client work** — lands when desktop/
  Android are back in scope. Tracked as the client half.

This split is deliberate: the valuable, safety-critical part (a hub
that runs correctly and un-exposably on a LAN) is server-only and
ship-able now; the native discovery UX is a later client pass.

## 6. Deferred

- **LAN federation** — two hubs on the same LAN federating via
  mDNS-discovered addresses. v1 is single-hub-on-a-LAN + clients.
- **Native discovery UI** — desktop/Android "nearby hubs" browser and
  QR/fingerprint pinning; client-era.
- **Sync-on-reconnect** — a LAN hub that later gains internet and wants
  to federate its accumulated state; out of scope.
- **Captive-portal / hotspot hub** — the hub device also being the
  Wi-Fi AP; an ops recipe, not a feature.

---

## Decisions

- **mDNS for discovery, no central registry.** DNS-SD is the standard
  zero-config LAN discovery mechanism and needs no server component —
  consistent with the no-central-authority pillar. The seed registry
  ([discovery-v2.md]) is for internet hubs and is untouched.
- **Explicit `WAVVON_LAN_MODE` flag with a hard private-address guard.**
  The one thing that must never happen is a self-signed or plaintext
  hub silently exposed to the internet. Making LAN mode explicit AND
  refusing to bind a public address under it makes accidental exposure
  structurally impossible, not merely discouraged.
- **Self-signed + out-of-band fingerprint pinning, not a local CA.**
  Fingerprint-in-the-invite is TOFU with an out-of-band check — simple,
  no PKI to run. Rejected: shipping a mini-CA or ACME-on-LAN (heavy,
  and browsers still wouldn't trust it without importing a root).
- **Server-first, native-client-later split.** The browser can't do
  mDNS or self-signed trust, and web is the delivery target — so rather
  than block the whole feature, ship the safe server half now (a hub
  that runs un-exposably on a LAN, reachable by typed URL / plaintext
  web today) and defer the native discovery UX. Avoids coupling a
  shippable server capability to client work that's out of scope.
- **Reuse the existing plaintext-HTTP path, gated.** No new insecure
  transport is introduced — LAN mode just makes the *already-existing*
  plaintext/self-signed behavior discoverable and safe, by adding the
  private-address guard the plaintext path never had.
