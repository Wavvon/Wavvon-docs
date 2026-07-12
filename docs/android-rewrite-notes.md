# Android client — rewrite notes

The `apps/android` client was **removed from the monorepo on 2026-07-12**.
It had fallen far behind the web client (independent UI copy, frozen at an
old state) and is not a delivery target for ~2–3 years. The decision was to
delete it now and **rewrite it clean-slate** when mobile becomes a priority,
rather than converge or drip-port it — by then the shared packages, feature
set, and mobile-Tauri landscape will all have moved. See
[decisions.md](decisions.md).

The old UI code has ~zero reference value for the rewrite. This doc preserves
the parts that *do* — the build/native knowledge that was expensive to earn —
so the rewrite doesn't re-discover it. The code itself remains in
`Wavvon-clients` git history if ever needed.

## Build blocker that was never solved (the important one)

No Android APK ever shipped. The blocker: `audiopus_sys` (pulled in by the
shared `crates/voice` Opus pipeline) builds `libopus.so` for the **host**
architecture, so the `aarch64`-Android link fails with
`incompatible with aarch64linux`. The Android NDK toolchain was not reaching
the crate's C build in CI.

The fix a rewrite must handle up front: wire the NDK cross-compile toolchain
for the native C deps — e.g. `cargo-ndk`, or the right `CC_*` / `CMAKE_*` /
`AR_*` per-target env for the `aarch64-linux-android` / `armv7-linux-androideabi`
targets — **before** expecting `tauri android build` to link. Prove the voice
crate cross-compiles for Android in isolation first; it was the long pole.

## Old architecture (for orientation, not reuse)

- Two Tauri 2 wrappers under `apps/android/src-tauri` — one around the desktop
  UI, one around the web UI — sharing the Rust `voice` crate from the repo
  root. JS deps + `@wavvon/*` packages resolved via the pnpm workspace.
- Build recipe (Node 20+, pnpm 11+, Rust, Tauri prereqs incl. Android SDK+NDK):
  from repo root `pnpm install`; then `cd apps/android`,
  `npx tauri android init`, `npx tauri android dev`. Release:
  `npx tauri android build --target aarch64 --target armv7` → APK under
  `src-tauri/gen/android/app/build/outputs/apk/`.
- Signing was via a `SIGNING.md` keystore config; CI signed when
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, and
  `ANDROID_KEY_PASSWORD` repo secrets were set. Distribution was direct APK
  (no Play Store) — end users allow "unknown sources" + dismiss Play Protect.

## Strategy for the rewrite

Mobile is not "web in a small window." The convergence plan for desktop
(thin shell over shared `packages/ui`) applies to Android's *core*, but the
mobile UI/interaction layer should be designed for touch/small-screen from
scratch. Reuse: the `platform` adapter contract, the shared `core`/`i18n`
packages, and the `voice` crate — plus the NDK build knowledge above. Do not
reuse the old React component copies.
