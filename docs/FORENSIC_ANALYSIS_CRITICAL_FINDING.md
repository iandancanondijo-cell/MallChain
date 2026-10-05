# CRITICAL REPOSITORY FINDING: mallchain-app/ Is Not Version Controlled

**Date**: Sep 18, 2026, 09:07 AM  
**Status**: FORENSIC ANALYSIS COMPLETE  
**Severity**: CRITICAL — Repository integrity issue

---

## Executive Summary

The `mallchain-app/` directory **DOES NOT EXIST in Git history**. It is physically present on disk but completely untracked. This is NOT a sparse-checkout, .gitignore, or missing commit issue. The directory appears to be an extracted build artifact or external installation.

---

## Key Findings

### 1. Git Repository State

| Item | Status | Evidence |
|------|--------|----------|
| `mallchain-app/` in HEAD | ❌ NOT PRESENT | `git ls-tree HEAD` produces no `mallchain-app/` entry |
| `mallchain-app/` in origin/main | ❌ NOT PRESENT | `git show origin/main:mallchain-app/` → "fatal: path does not exist" |
| `mallchain-app/src/pages/DashboardPage.tsx` ever in history | ❌ NEVER EXISTED | `git log --all --oneline -- mallchain-app/src/pages/DashboardPage.tsx` → no results |
| Entire `mallchain-app/` ever in history | ❌ NEVER EXISTED | `git log --all -- mallchain-app/` → no results |
| `.gitignore` excludes `mallchain-app/` | ❌ NO | Pattern not found in `.gitignore` |
| sparse-checkout configured | ❌ NO | `git config core.sparseCheckout` → not set |
| mallchain-app is nested repo | ❌ NO | No `.git/` directory under `mallchain-app/` |
| mallchain-app is submodule | ❌ NO | `git submodule status` → empty |

### 2. Tracked Directories in HEAD

```
app/                          ← Go backend (tracked)
backend/                      ← Node backend (tracked)
marketplace/                  ← Marketplace (tracked)
mallchain-os-v14/             ← Mission Control V14 (tracked)
mallwallet/                   ← Wallet (tracked)
✗ mallchain-app/              ← UNTRACKED (only on disk)
```

### 3. On-Disk vs. Git State

**On Disk**: `mallchain-app/` exists with complete source tree
```
mallchain-app/
├── src/
│   ├── App.tsx
│   ├── blockchain/
│   ├── components/
│   ├── pages/
│   ├── ...
├── dist/
├── .deb files (Debian packages)
├── metadata.json
└── bun.lock
```

**In Git HEAD**: `mallchain-app/` does not exist at all

**Git Status**: 
```
?? mallchain-app/            ← Completely untracked
?? mallchain-app/src/        ← All subdirectories untracked
?? mallchain-app/src/pages/  ← DashboardPage.tsx etc. untracked
```

### 4. File Timestamps (Critical Evidence)

```
mallchain-app/metadata.json        Modified: 2026-09-16 17:13:02
mallchain-app/bun.lock             Modified: 2026-09-16 17:13:02
mallchain-app/*.deb files          Modified: 2026-09-16 17:13:02
mallchain-app/src/App.tsx          Modified: 2026-09-16 17:13:02
```

**All files have identical timestamps (Sep 16, 17:13)** — consistent with:
- Extraction from a tarball/zip
- Installation of a packaged release
- Batch download/clone operation
- NOT typical git checkout behavior

### 5. Presence of .deb and metadata.json

The directory contains:
- `mallchain-app_1.0.0_amd64.deb` — Debian package file
- `Mallchain-App_1.0.0_amd64.deb` — Duplicate with capitalized name
- `metadata.json` — Non-standard application metadata (NOT source control artifact)

**Interpretation**: This directory appears to be the result of:
1. Downloading/extracting a pre-built application release
2. NOT cloning from this Git repository
3. Possibly installed via package manager or release artifact

### 6. Remote Status

**Local branch**: 2 commits behind `origin/main`  
**Two missing commits**:
1. `f9a181e` — Merge pull request #29 (dependency updates)
2. `6f03595` — chore(deps): bump dependencies

**Neither commit contains mallchain-app/** (confirmed via git history)

---

## Three Possible Explanations

### Hypothesis A: External Installation (Most Likely)
- `mallchain-app/` was downloaded as a pre-built release or package
- Extracted into the repository directory
- Never committed to Git
- Should be in `.gitignore` if intentionally excluded

**Evidence**:
- `.deb` files present (installation artifacts)
- `metadata.json` (application descriptor, not source artifact)
- Identical timestamps (batch extraction)
- Not in `.gitignore` (suggests not intentionally excluded)

### Hypothesis B: Build Artifact (Unlikely)
- Vite build output or transpilation
- Created at dev/build time

**Against this**:
- Contains `.deb` and metadata.json (not build artifacts)
- Source `.tsx` files are identical to on-disk files
- No build configuration generates these

### Hypothesis C: Different Repository/Branch (Investigated, Ruled Out)
- Could exist in another branch or repository

**Evidence against**:
- Checked `git log --all --oneline` for mallchain-app → no results
- Checked `origin/main` → no entry
- Checked 2 commits ahead → no entry
- Checked all branches via git worktree → not found

---

## What This Means for the Current Issue

### The DashboardPage.tsx "Missing" Problem

**Previous conclusion**: "DashboardPage.tsx was never in Git"

**Correct interpretation**: 
- DashboardPage.tsx is currently untracked (like all other `mallchain-app/` files)
- It was never committed to this repository
- Therefore, it cannot be "recovered" from Git history
- The minimal replacement created earlier is **NOT** a workaround for a lost file
- The minimal replacement is **not the original implementation** of DashboardPage

**Critical implication**: 
- The `mallchain-app/` source code currently on disk is NOT the authoritative version stored in this repository
- It may be a cached copy, downloaded release, or partial clone from a different source
- Building/running from this directory means testing against **unversioned code**

### What Should NOT Be Done

❌ **Do not** continue modifying `mallchain-app/src/` and test against it  
❌ **Do not** commit `mallchain-app/` files to this repository yet  
❌ **Do not** accept the minimal DashboardPage.tsx replacement as "the real version"  
❌ **Do not** assume the current source tree is authoritative  

### What Should Be Done First

✅ **Determine the source**: Where did the `mallchain-app/` directory come from?
- Another repository?
- A release tarball?
- A download?
- A backup restore?

✅ **Check for alternative versions**: Is there a correct, authoritative copy elsewhere?
- Different git repository?
- Different branch?
- GitHub release?
- Build artifact from CI/CD?

✅ **Decide on inclusion**: Should `mallchain-app/` be version controlled here?
- If YES: add to `.gitignore` → pull correct version from source → commit
- If NO: document where authoritative source is located

---

## Git Commands Summary (Read-Only Verification)

```bash
# Verified: mallchain-app/ not in HEAD
git ls-tree HEAD | grep mallchain-app
# Result: (no output)

# Verified: not in origin/main
git show origin/main:mallchain-app/src/App.tsx
# Result: fatal: path does not exist

# Verified: never in any branch
git log --all --oneline -- mallchain-app/
# Result: (no output)

# Verified: currently untracked
git status --short mallchain-app/
# Result: ?? mallchain-app/

# Verified: no .gitignore exclusion
git check-ignore -v mallchain-app/
# Result: (no output)

# Verified: sparse-checkout not involved
git sparse-checkout list
# Result: sparse-checkout not enabled
```

---

## Recommendations

### Immediate Action Required

**BEFORE running browser tests or modifying code:**

1. **Identify the source**
   - Check if mallchain-app is a git submodule pointing elsewhere
   - Check if there's a separate repository
   - Check if there's a CI/CD build artifact
   - Check project documentation for frontend architecture

2. **Validate the current copy**
   - Is the current `mallchain-app/src/App.tsx` the intended version?
   - Does it match what's in origin/main or a different repository?
   - Compare with any documented release version

3. **Decision point**
   - If mallchain-app should be here: restore from authoritative source, add to git, commit
   - If mallchain-app is external: document the source, add directory to .gitignore
   - If in different repo: update project documentation and .gitignore

### Why This Matters

The original investigation goal was:
> "Verify that mallchain-app can connect to the blockchain"

But the foundation is uncertain:
- The current `mallchain-app/` is **not version controlled**
- Its source cannot be verified from Git history
- Testing against it means **testing against unversioned code**
- Any fixes or changes will not be preserved by git

This should be resolved before proceeding with browser connection tests.

---

## Files Consulted

- `.gitignore` — checked for exclusion patterns
- `git ls-tree HEAD` — verified mallchain-app not in repository
- `git show origin/main:mallchain-app/` — verified not in remote
- `git log --all -- mallchain-app/` — verified never in history
- `git status --short` — verified currently untracked
- `/mallchain-app/metadata.json` — examined artifact origin indicators
- File timestamps via `stat` — all Sep 16, 17:13 (batch extraction)

---

## CRUCIAL DOCUMENTATION FINDING

**README.md explicitly states:**
```
Frontend UI: `mallchain-os-v14/` (Mallchain OS — see `mallchain-os-v14/README.md`)
```

**mallchain-app is NOT mentioned in official documentation.**

**Verification:**
- `mallchain-os-v14/` IS in `git ls-tree HEAD` ✅
- `mallchain-app/` is NOT in `git ls-tree HEAD` ❌
- Project documentation identifies `mallchain-os-v14/` as the authoritative frontend ✅
- `mallchain-app/` has no equivalent mention ❌

### Implication

The `mallchain-app/` directory is **NOT part of the documented project architecture**. It appears to be:
- A separate, external application
- Possibly a different frontend for the same blockchain
- Or a cached/downloaded copy of something outside this repository
- Or a misplaced build artifact

The authoritative frontend for this project is `mallchain-os-v14/` (port 5173), which IS version controlled and documented.

---

## Status

✅ Investigation complete (read-only)  
✅ Documentation consulted and finding confirmed  
✅ Root cause identified: `mallchain-app/` is not part of this project's documented architecture  
⏸️ Awaiting user confirmation before proceeding  
🔴 **BLOCKER**: `mallchain-app/` should not be used for testing until source is clarified
