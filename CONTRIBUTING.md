# Contributing to Wavvon

This document describes the branching model, development workflow, and
release process used across all Wavvon repositories.

---

## Branching model

```
main        production-only — every commit here is a versioned release
              ↑
develop     integration branch — unstable, used for local testing and beta builds
              ↑
feat/xyz    short-lived feature or bug branch, branched off develop
```

**`main`** is protected. No direct pushes. The only way code reaches `main`
is via a pull request from `develop`, reviewed and merged on GitHub.

**`develop`** is where all work accumulates. It is intentionally unstable —
features may be half-integrated, and it may be broken at any given commit.
It is the right branch for local testing and beta distributions.

**Feature/bug branches** are short-lived. Create one for each piece of work,
merge it back into `develop` when done, and delete it.

---

## Day-to-day workflow

### Starting a new feature or bug fix

```bash
git checkout develop
git pull origin develop
git checkout -b feat/my-feature   # or fix/some-bug, chore/update-deps
```

Branch naming:

| Prefix | Use for |
|--------|---------|
| `feat/` | new functionality |
| `fix/`  | bug fixes |
| `chore/` | dependency updates, tooling, CI changes |
| `docs/`  | documentation only |

### Finishing the work

Push the branch and open a **pull request targeting `develop`** on GitHub.
CI runs the build and type checks on the PR. Once it passes and you are
satisfied, merge it. Delete the branch after merging.

```bash
git push origin feat/my-feature
# open PR on GitHub: feat/my-feature → develop
```

---

## Releasing

When `develop` is in a state worth shipping, run the release script to bump
the version and update the changelog, then open a PR to `main`.

```bash
# on the develop branch:
bash scripts/release.sh 0.3.0          # stable release
bash scripts/release.sh 0.3.0-beta.1   # beta / pre-release

git push origin develop
# open PR on GitHub: develop → main
```

After the PR is merged to `main`:

1. **`auto-tag.yml`** reads the version from the config file, creates and
   pushes the tag `v0.3.0` (skips if the tag already exists).
2. **`release.yml`** fires on the new tag, generates the changelog with
   `git-cliff`, builds all packages, and publishes the GitHub Release.
   Versions containing `-` (e.g. `v0.3.0-beta.1`) are automatically marked
   as pre-releases.

You do not need to create tags manually.

### Versioning

Wavvon uses **semantic versioning** (`MAJOR.MINOR.PATCH`):

| Change | Bump |
|--------|------|
| Breaking change to the hub–client protocol or identity format | MAJOR |
| New feature, new endpoint, new client capability | MINOR |
| Bug fix, performance improvement, no API change | PATCH |

Pre-releases use the `-beta.N` or `-rc.N` suffix (e.g. `0.3.0-beta.1`).
The exact versioning policy will be decided before the first `1.0.0` release.

---

## Hotfixes

There is no dedicated hotfix branch. If a critical bug is found after a
release, fix it on `develop`, bump the patch version, and fast-track the
`develop → main` PR as you normally would. The short release cycle makes a
separate hotfix branch unnecessary overhead.

---

## CI overview

| Trigger | Workflow | What it does |
|---------|----------|--------------|
| Push to `develop` or `main`; PR to either | `build.yml` | Typecheck, tests, cargo check |
| Push to `main` | `auto-tag.yml` | Tags `v{version}` if the version is new |
| New `v*` tag | `release.yml` | Builds packages, creates GitHub Release |

---

## Setting up locally

Install the pre-push hook so CI failures are caught before you push:

```bash
# bash (Linux / macOS / Git Bash on Windows)
bash scripts/install-hooks.sh

# PowerShell (Windows)
.\scripts\install-hooks.ps1
```

The hook runs the same checks as `build.yml`: typecheck, unit tests, and
`cargo check`. Set `SKIP_TESTS=1` before `git push` to bypass the test run
when iterating quickly.
