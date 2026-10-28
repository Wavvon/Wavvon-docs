# Threat Model

A guide for design decisions: when a feature moves something below from
"defended" to "weakened" (or back), this file changes in the same commit.
Rewritten 2026-10-27 against the code; the 2026-07 first pass predated E2E
DMs, voice transport v2 and device revocation, and said so wrongly.

## Identity & trust roots

- **Identity** is a BIP39 **master** key (24 words) plus one Ed25519
  **subkey per device**, each carrying a master-signed cert
  ([multi-device.md](multi-device.md)). A device's private key never leaves
  it; a paired device never holds the master seed.
- **Hub identity** is the same shape: a long-lived Ed25519 keypair in
  `hub_identity.json`, rotatable with an endorsement signed by the old key
  (`wavvon-hub rotate-key`, served as `/info`'s `rotation`). Clients follow a
  rotation rather than treating the hub as new.
- **No central authority.** No PKI, no email, no username. Trust comes from
  an invite, a pubkey-bound invite, or a hub's published certifications
  ([hub-certifications.md](hub-certifications.md)).
- **Recovery** has three paths ([identity-recovery.md](identity-recovery.md)):
  the phrase (canonical), a `.wavvon-backup` file (Argon2id + AES-256-GCM),
  and per-hub recovery contacts who vouch for a new key while an admin
  decides ([recovery-attestation.md](recovery-attestation.md)).

## What we defend against

| Threat | Defense |
| --- | --- |
| Credential stuffing, reused passwords | There are no passwords. Auth is an Ed25519 challenge/response; the token is opaque, server-stored, and expires. |
| Login flooding, write spam | Per-IP token buckets on `/auth/*` and on writes, separately tunable (`WAVVON_AUTH_RATE_*`). |
| Strangers joining | Invite-only by default for a fresh hub; admission challenges; join approval. |
| Members reaching channels they should not | Role permissions, channel overrides, channel bans, hub bans. |
| Unwanted voice | Hub-wide voice mute, per-channel minimum talk power, channel ban. |
| Hub operator reading DMs | **E2E**: 1:1 DMs use a Double Ratchet; group DMs use per-sender keys on desktop, and the web client refuses to send one rather than send it unencrypted ([e2e-encryption.md](e2e-encryption.md)). The hub stores and relays ciphertext. A recipient with no published DH key gets cleartext only after the sender is asked. |
| Hub operator listening to voice | **E2E** since voice transport v2: per-sender AES-256-GCM keys wrapped with X25519; the relay forwards headers only ([voice-transport-v2.md](voice-transport-v2.md)). |
| Lost or stolen device | The master revokes that device's subkey; hubs refuse it at auth ([multi-device.md](multi-device.md), Revocation). |
| Harassment from a member | Block, mute and ignore, held on your home hub, applied by your client ([block-mute-ignore.md](block-mute-ignore.md)). Notification modes per hub and channel. |
| A hostile hub's markup reaching the client | Hub-supplied SVG (admission challenges, icons) and emoji URLs are sanitized before rendering (Wavvon-clients#66–#68). |
| Oversized uploads | Per-hub caps on attachment and upload size, bounded by a floor and a ceiling. |
| A stranger reading an alliance | Alliance routes check that the caller is a member of that alliance (the `alliancesplit` finding, 2026-10). |
| SSRF through app webhooks | Webhook URLs resolving to private addresses are refused unless the operator opts in (`WAVVON_ALLOW_PRIVATE_WEBHOOKS`). |

## What we don't defend against (yet)

Known gaps, each shaping a future decision.

- **Hub admin over their own hub.** Channel messages, forum posts, rosters
  and files are stored in the clear, and an admin reads all of it and can ban
  anyone. Only DMs and voice are E2E. Trust the hub or leave it.
- **Hostile peer hubs.** Federation auth proves which hub is talking, not
  that what it relays is true. Federated messages carry no author signature
  (`federated_messages` stores `sender` and `content` as the peer sent them),
  so a peer can alter, drop or fabricate a message attributed to its own
  members. **Mitigation: messages signed by the author's key, verified on
  arrival. Not designed yet**; it is the main federation item before 1.0.
- **Hostile alliance members.** An alliance partner's admin reads every
  channel you share with the alliance. Treat shared channels as semi-public.
- **Hub key compromise.** Whoever holds `hub_identity.json` impersonates the
  hub in federation until it rotates. Rotation exists; detecting the theft
  does not.
- **Master key compromise.** Device subkeys revoke; the master does not. A
  leaked phrase is the whole identity. The way out is a new identity, carried
  over per hub through recovery contacts and an admin's decision.
- **Your own DMs on another device.** A device cannot decrypt DMs you sent
  from a different device, and says so instead of guessing. See
  [e2e-encryption.md](e2e-encryption.md).
- **Metadata.** Even with E2E bodies, hubs see who talks to whom, when, and
  how much. Hiding it needs mix networks or cover traffic; not pursued.
- **App abuse.** An app holds roles like a member does, so a leaked app key
  posts wherever its roles allow, within the same rate limits.

## Decisions this should drive

- **Federated content:** anything a peer hub relays and a client shows as
  authored by someone needs that someone's signature, or the UI must not
  present it as authored. Reactions and friend assertions are the same case.
- **Alliance sharing:** the UI should warn before a non-public channel is
  shared with an alliance. It does not today.
- **Apps:** roles, not scoped tokens; token rotation is owner-gated.

## Out of scope (probably forever)

- **Anonymity from the hub operator.** A hub knows your pubkey, your IP and
  when you connect. Run your own hub if that matters.
- **Legal compulsion.** An operator served with process hands over what they
  hold. E2E protects DM and voice content; nothing protects what the operator
  chooses to log.
