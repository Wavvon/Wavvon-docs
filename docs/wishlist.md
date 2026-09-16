# Wishlist

**Things we might introduce, and have not decided to.** Not a queue — nothing
here is committed.

Since 2026-09-16 the entries live as **[Ideas
discussions](https://github.com/Wavvon/Wavvon-docs/discussions/categories/ideas)**
rather than in this file, and the reason is the point of the file rather than a
detail of tooling.

An open issue reads as an accepted request: people expect it to ship, and its
age reads as neglect. A wish is the opposite — *"we're not sure we should"* —
and an entry that has been on the list a long time is not overdue, it is doing
its job. A discussion can say that; an issue cannot. Several of these are also
explicitly demand-gated (*"only if a community actually asks"*), and a 👍 on a
discussion is exactly the measurement they are waiting for.

## Where each kind of work lives

| | |
|---|---|
| Not committed to | [Ideas discussions](https://github.com/Wavvon/Wavvon-docs/discussions/categories/ideas) |
| Intent settled, design pending | [future-features.md](future-features.md) |
| Designed, in flight, and the open bugs | the issue trackers — see [next-up.md](next-up.md) |

An idea earning its place moves left to right: out of Ideas into
[future-features.md](future-features.md) once the intent is settled, and from
there into an issue once someone could execute from the design.

Deliberate refusals are not wishes and are not there either: see **Won't do**
in the [roadmap index](../ROADMAP.md), with the reasoning in
[decisions.md](decisions.md). The idiom for one of those is a discussion or
issue **closed as not planned**, linking the decision — so the same proposal
does not come back every few months.

## What is open right now

Four, moved out of this file unchanged:

- **Hosted web client** — would decouple the client version from any single
  hub. Can never be the only channel: an HTTPS page cannot call an `http://`
  hub, so the hub-served copy stays regardless ([decisions.md](decisions.md)).
- **Live captions in voice** — client-side speech-to-text, an accessibility
  differentiator that keeps the no-telemetry stance
  ([accessibility.md](accessibility.md)). Desktop-era at the earliest.
- **Birthday announcement message** — the demand-gated tail of the birthday
  badge. Only if a community actually asks.
- **Farm across more than one machine** — the multi-node data plane is built
  except its monitor, and parked ([farm-model.md](farm-model.md)). Revisit
  when an operator asks to scale past one box.
