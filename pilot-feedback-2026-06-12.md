# Pilot feedback — first real-world session (2026-06-12)

Source: first multi-user session on the live pilot hub
(`wavvon.videogamezone.eu`, hub v0.2.1) using the packaged desktop client
(v0.2.1 build). Reported by the owner after testing with two friends.
Label convention as in [code-audit-2026-06-11.md](code-audit-2026-06-11.md):
letter = component (D = desktop client), number = sequence, not severity.

## Voice (already tracked)

Audio relay confirmed broken across the internet exactly as the audit
predicted: signaling works (roster, speaking indicators via WS), but the
UDP relay registers every client as 127.0.0.1, so audio packets relay to
localhost and both sides hear silence. Fix = **Networked voice Phase 1**
(ROADMAP, next up; design in
[voice-networking-design.md](docs/voice-networking-design.md)). The pilot
hub is the test bed once implemented.

## Desktop client findings

### Bugs / broken UI

- **D1 — Whisper menu overflows** behind the hub list (z-order/positioning);
  menu is clipped and partially unusable.
- **D2 — Camera selection missing**: "Turn on camera" never asks which
  device, and there is no camera picker in Settings (audio has profiles;
  video has nothing).
- **D4 — Screen-share device list broken**: checkmarks misaligned; with
  multiple monitors/windows there is no scrollbar, so devices beyond the
  fold are unreachable.
- **D5a — Composer buttons misaligned**: attachment / emoji / poll buttons
  are misaligned and oddly shaped.
- **D8 — Banner spacers immutable**: the banner/spacer images in the channel
  list cannot be changed, moved, or deleted by the owner.

### Design decisions wanted (owner proposals included)

- **D3 — Leave-voice button is a bare red square**; needs a proper
  icon/affordance.
- **D5b — Composer layout proposal (decided 2026-06-12)**: place the action
  buttons **inside the text input box, right-aligned** (Discord-style) so
  they read as part of the composer: a single **"+"** menu collapsing
  attachment + poll, and emoji kept as its own in-box button (high-frequency
  action). Send stays outside/adjacent.
- **D6 — Voice channel switching**: joining another voice channel while
  connected should implicitly leave the current one (no explicit
  "leave voice" press first). Today it requires manual leave.
- **D7 — Role assignment paths missing**: roles can't be granted from the
  member context menu (right-click in user list), from the Members panel, or
  from the Roles panel (selecting a role should list and let you edit its
  members). Today there is no discoverable path at all for the owner.
- **D9 — Call-control button sprawl**: mic / camera / screen-share / etc.
  are too many loose buttons; needs a consolidated, cleaner control bar.

### Feature gaps

- **D10 — No "Activity" view exists** in any client (checked desktop + web
  sources). Users coming from comparable apps expect one (recent
  mentions/replies/reactions feed). Never built — wishlist candidate, needs
  design.
