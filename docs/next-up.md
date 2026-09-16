# Next up

**What we are working on and about to work on**, plus the open bugs.

Most of it no longer lives in this file. Anything a stranger could act on —
designed work in flight, 🚧 Blocked, ⚠️ Known issues — moved to the issue
trackers on 2026-09-16, because that is where a stranger can find it and where
a fix can close it.

| Where | What is there |
|---|---|
| [Wavvon-server issues](https://github.com/Wavvon/Wavvon-server/issues) | the hub — permissions, bots, invites, alliances, events, voice gating |
| [Wavvon-clients issues](https://github.com/Wavvon/Wavvon-clients/issues) | web and desktop — parity ports, data export, packaging, hosting |
| [`help wanted` across the org](https://github.com/search?q=org%3AWavvon+label%3A%22help+wanted%22+state%3Aopen&type=issues) | picked out for someone who is not us |
| [Ideas discussions](https://github.com/Wavvon/Wavvon-docs/discussions/categories/ideas) | the wishlist — things we might do and have not decided to |

**How the two halves fit.** An issue is one piece of work, and it closes when
that work merges to `develop` — a PR body saying `Fixes #N` does it
automatically. A **milestone** is the version the work is *released* in, and
it closes when the tag leaves `main`. So "fixed" and "you can have it" are
two different answers, and now both are public.

The wiki keeps what an issue is bad at: the *why*. Rationale stays in
[decisions.md](decisions.md), the model behind a change stays in its design
doc, and an issue links to both rather than restating them.

Work that is on the list but **not yet designed** lives in
[future-features.md](future-features.md). Shipped work moves to
[shipped-log.md](shipped-log.md).

---

## What stays here

Two items, because neither is issue-shaped: one is a sequence of our own steps
rather than a piece of work someone could pick up, and the other is a settled
scope decision rather than a bug.

### 🔨 First external operator pilot

A hub is live on an external operator's own server, **wiped and rebuilt on
v0.5.0 (2026-08-21)** after an in-place 0.3.2 → 0.5.0 upgrade proved the
migration path; the old install held two accounts and zero messages, so
nothing was worth keeping. The hub boots blank and its first-boot owner invite
is **unredeemed**.

Remaining: redeem it, operator onboarding and ownership transfer, hub naming
and channel setup, whether the docs were enough to get there, and the
two-operator federation test. First real operator feedback arrived 2026-08-21
— four UI items fixed the same day, the rest are now issues.

**Waiting on the next release** (decided 2026-09-14): the pilot runs v0.5.0
and everything since is unreleased, so onboarding it now would onboard it onto
a build we are about to replace. Cutting the release is what unblocks this.

Host details and per-deployment steps stay out of this repo.

### ⚠️ Bot deferred scope

Bot DMs have no timeline, and since 2026-09-14 they are **refused at the hub**
rather than merely unbuilt ([bots.md](bots.md)). Listed here rather than as an
issue because it is a scope decision, not a defect — an open issue would read
as a promise to build it.

Voice/video injection and bot-launched game modals shipped 2026-07-19 as
capability-layer Phases 1–2.
