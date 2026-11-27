# Certified admission: certificate types and a fast lane

**Status**: design (2026-11-27), not built. Reworks the admission gate of
[hub-certifications.md](hub-certifications.md#6--hub-requirements--how-an-admin-configures-require-a-cert)
and draws the line between certificates and the badges of
[achievement-badges.md](achievement-badges.md).

## Certificates and badges are different things

Both are signed certs today, and a badge is a cert with a `label`. The
admission check (Wavvon-server: `verify_certification` in
`crates/hub/src/routes/certs.rs`) never looks at the label, so a badge such as
"Raid Leader" from a trusted hub admits its holder exactly as a standing
certificate does. With badges about to be awarded by rules and by programs,
that turns decoration into a key.

| | Certificate | Badge |
|---|---|---|
| Says | "this person is in good standing here", of a named type | "this person did or reached this" |
| Issued by | the hub only: an admin, or the hub's own automatic issuance | admins, the hub's rules, programs |
| Opens another hub's door | yes, if that hub trusts it | **never** |

The admission check rejects any cert carrying a `label`. That needs no wire
change, since the label already tells the two apart, and it closes the hole
that exists today.

## Certificate types

A certificate gains a **type**: "Verified identity", "Long-standing member",
"Trusted organiser". Each hub keeps a catalogue of the types it issues,
managed by admins and its own rules, never by programs, and publishes it so
another hub can pick from it by name.

The type travels inside the signed payload as a new optional field, appended
the way `label` was, so certificates already issued keep verifying. The
payload is JSON signed by the issuing hub, not an envelope of the `identity`
crate, and clients only display certificates, so nothing else moves with it.
A certificate issued without a type is the plain standing certificate it is
today.

The property rule of today (`cert_require`, "any cert that says member for 90
days") is retired: a hub that wants to vouch for long-standing members creates
that type, and a hub that trusts it picks it.

## The admission tab

Two lists, and the newcomer qualifies by matching any row of either:

- **Any certificate from these hubs**: the whole hub is trusted.
- **Specific certificates**: hub and type pairs, such as *the official hub →
  Verified identity*. Adding a row picks the hub, then a type from its
  published catalogue.

A newcomer who qualifies takes the **fast lane**: no lobby, no approval
queue, no anti-spam challenge. For everyone else the admin chooses:

- **They come in the usual way**: the lobby and whatever else Joining sets.
  Nobody is turned away for lacking a certificate.
- **They do not come in**: a strict hub that admits only certified people.

And one more switch, off by default: **a trusted certificate replaces an
invite**. An invite-only hub stays closed unless the admin turns it on; a
public community can then let certified people in without minting invites.

With both lists empty there is no fast lane, and admission is what Joining
alone sets, as on a hub that never touched certificates.

## A ban revokes what the hub vouched for

Banning a member revokes every certificate and every badge this hub issued
to them, through the existing revocation path, so a hub that trusts this one
learns it on its next revocation poll and the fast lane closes behind them.
Today the certificate worker only stops issuing to a banned member
(Wavvon-server: `crates/hub/src/cert_worker.rs`); what it issued before the
ban stays valid until it expires.

A temporary ban revokes too. When it lifts, automatic issuance and rule
badges give back what the member qualifies for on the next tick; certificates
and badges granted by hand do not come back by themselves. A kick revokes
nothing: it is not a judgement on standing.

## Settings, replacing `cert_mode`

`cert_mode` (`none` / `any` / `trusted`) and `cert_require` give way to:

- `cert_trusted_issuers` (kept): hubs whose every certificate counts;
- `cert_trusted_types`: issuer and type pairs;
- `cert_others`: `lobby` (default) or `refuse`;
- `cert_replaces_invite`: boolean, default false.

Alpha state, so the old settings are dropped rather than migrated.
