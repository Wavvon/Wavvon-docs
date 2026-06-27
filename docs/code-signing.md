# Windows Code Signing (Authenticode)

How the Wavvon desktop app (Wavvon-desktop) will eventually earn Windows'
trust so users stop seeing SmartScreen's "Windows protected your PC" on
first run. Today the NSIS `.exe` installer is unsigned; the documented
workaround is "More info → Run anyway" (see Wavvon-desktop's README).

The **updater payload signature** (`TAURI_SIGNING_PRIVATE_KEY`, Ed25519,
documented in `packaging.md` section 3) is a separate concern and is fully
in place — it proves an update came from us. Authenticode proves the
installer did, to the OS.

---

## Status: BLOCKED until the project has meaningful popularity

The free open-source signing route we pursued in 2026 was refused because
the project did not yet have enough adoption to qualify. Rather than pay
for commercial signing before the project has users, the decision is to
**ship unsigned for now** and revisit once the project has real traction
(stars, downloads, community). The README documents the SmartScreen
workaround honestly in the meantime.

## Decision 1 — EV certificate, not OV (still valid)

**Decision**: when signing happens, use an **Extended Validation (EV)**
code-signing certificate, not an Organisation Validation (OV) one.

**Alternative considered — OV**: cheaper (~$100–250/yr) and easier to
obtain. The fatal problem is SmartScreen reputation: an OV-signed binary
still shows the warning until the certificate accumulates enough install
reputation — typically 6–12 months and thousands of clean installs. For a
low-volume open-source project that threshold may never be reached, so the
warning could be effectively permanent.

**Why EV won**: EV certificates are trusted by SmartScreen **immediately**
— no reputation accumulation. The friction disappears on day one of the
first signed release. The cost (~$300–600/yr) is higher, but it buys a
deterministic outcome instead of an open-ended wait.

**Tradeoff**: EV mandates key storage on an HSM (hardware or cloud), which
constrains how CI signs — any future provider must offer CI-friendly cloud
signing (submit-hash or submit-artifact model), not a physical USB token.

## Options when the block lifts

In rough order of preference:

1. **Azure Trusted Signing** (~$10/month) — CI-friendly cloud signing with
   SmartScreen trust; the cheapest paid path and well-integrated with
   GitHub Actions.
2. **Re-apply to a free OSS signing program** once the popularity bar is
   met — same outcome at no cost, but eligibility depends on adoption.
3. **Commercial EV via DigiCert/Sectigo cloud HSM offerings**
   (KeyLocker / KeyVault) — most expensive; only if the other routes fail.

## Current CI state

The release workflow builds and uploads **unsigned** Windows installers.
No signing steps or signing-service secrets remain in CI; when a provider
is chosen, the signing step slots in between the Tauri build and the
release-asset upload, signing the NSIS installer (and ideally deep-signing
the inner `wavvon.exe`). The Ed25519 updater signing
(`TAURI_SIGNING_PRIVATE_KEY`) is independent and remains active.
