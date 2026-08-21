# Wishlist

**Things we might introduce, and have not decided to.** Not a queue — nothing
here is committed, and an entry earning its place moves to
[future-features.md](future-features.md) (intent settled, design pending) and
from there to [next-up.md](next-up.md) (designed, being built).

The distinction that matters: future-features is *"we will, once we know
how"*; this file is *"we're not sure we should"*. An entry that has been here
a long time is not overdue — it is doing its job.

Deliberate refusals are not wishes and are not here: see **Won't do** in the
[roadmap index](../ROADMAP.md), with the reasoning in
[decisions.md](decisions.md).

---

## Hosted web client

Undesigned, deliberately. Would decouple the client version from any single
hub and be the canonical entry point for public hubs; alongside the discovery
site is the obvious home, though they are different artifacts (Next.js vs a
static Vite SPA). Already enabled by CORS defaulting to `*` on a bearer-token
API, so it could talk to arbitrary hubs with no per-hub setup.

**It can never be the only channel**, which is the reason this is a wish and
not a plan: an HTTPS page cannot call an `http://` hub, ruling out LAN mode,
self-signed hubs, and trying Wavvon before buying a domain — so the
hub-served copy stays regardless. That constraint is settled in
[decisions.md](decisions.md#hub-capabilities-are-advertised-not-inferred-from-a-version-number);
the hosted client itself is not.

## Live captions in voice

Client-side speech-to-text (whisper.cpp-class local models) rendering live
captions — an accessibility differentiator that keeps the no-telemetry stance,
since audio never leaves the client. Too heavy for the web client, which is
the current delivery target, so this is desktop-era at the earliest. See
[accessibility.md](accessibility.md).

## Birthday announcement message

Demand-gated tail of the birthday badge: a hub-configured channel plus a daily
worker posting at hub-midnight, which needs `chrono-tz`. Only if a community
actually asks — the badge alone may well be enough.
