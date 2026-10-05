# Forensic Commands Executed (Verification Reference)

All commands below are read-only and can be run again to verify findings.

---

## Repository Structure

### What's in Git HEAD

```bash
$ git ls-tree HEAD | grep -E '^'
```

**Result**: 
- ✓ `app/` (Go backend)
- ✓ `backend/` (Node backend)
- ✓ `mallchain-os-v14/` (documented frontend)
- ✓ `marketplace/`
- ✗ `mallchain-app/` — NOT PRESENT

### What's on Disk

```bash
$ ls -la | grep mallchain
```

**Result**:
- ✓ `mallchain-app/` (exists on disk)
- ✓ `mallchain-os-v14/` (exists on disk)

---

## Git History Verification

### Check if mallchain-app ever existed in any branch

```bash
$ git log --all --oneline -- mallchain-app/
```

**Result**: (no output) — Never existed

### Check if DashboardPage ever existed

```bash
$ git log --all --oneline -- 'mallchain-app/src/pages/DashboardPage.tsx'
```

**Result**: (no output) — Never existed

### Check entire pages directory

```bash
$ git log --all -- 'mallchain-app/src/pages'
```

**Result**: (no output) — Never existed

---

## Remote Verification

### Check if in origin/main

```bash
$ git show origin/main:mallchain-app/src/App.tsx 2>&1
```

**Result**: `fatal: path 'mallchain-app/src/App.tsx' does not exist in 'origin/main'`

### List what's ahead in origin/main

```bash
$ git log --oneline HEAD..origin/main
```

**Result**:
```
f9a181e (origin/main, origin/HEAD) Merge pull request #29 from iandancanondijo-cell/dependabot/npm_and_yarn/root-dependencies-635accce97
6f03595 chore(deps): bump the root-dependencies group across 1 directory with 47 updates
```

**Analysis**: Neither commit contains mallchain-app

---

## Current Status

### Git status for mallchain-app

```bash
$ git status --short mallchain-app/
```

**Result**:
```
?? mallchain-app/
```

**Meaning**: Completely untracked

### Git status for pages directory

```bash
$ git status --short mallchain-app/src/pages
```

**Result**:
```
?? mallchain-app/src/pages/
```

**Meaning**: Pages directory is completely untracked

### Tracked files in mallchain-app

```bash
$ git ls-files mallchain-app/
```

**Result**: (no output) — No tracked files

---

## Configuration Checks

### Sparse checkout enabled?

```bash
$ git config --show-origin --get core.sparseCheckout
```

**Result**: (no output) — Not configured

### Is mallchain-app in .gitignore?

```bash
$ git check-ignore -v mallchain-app/
```

**Result**: (no output) — Not in .gitignore

### Check entire .gitignore

```bash
$ grep -i mallchain .gitignore
```

**Result**: (no output) — Not mentioned

---

## File Analysis

### File timestamps

```bash
$ stat mallchain-app/src/App.tsx | grep -E "Modify|Change|Access"
```

**Result**:
```
Access: 2026-09-18 07:02:38.497816480 +0300
Modify: 2026-09-16 17:13:02.000000000 +0300
Change: 2026-09-17 05:44:58.584231063 +0300
```

**Analysis**: All files modified at Sep 16, 17:13 (identical timestamps = batch extraction)

### Artifacts present

```bash
$ ls -la mallchain-app/ | grep -E '\.deb|metadata'
```

**Result**:
```
-rw-rw-r--   1 elle_bryson elle_bryson 323528 Sep 16 17:13 mallchain-app_1.0.0_amd64.deb
-rw-rw-r--   1 elle_bryson elle_bryson 323528 Sep 16 17:13 Mallchain-App_1.0.0_amd64.deb
-rw-rw-r--   1 elle_bryson elle_bryson    327 Sep 16 17:13 metadata.json
```

**Analysis**: `.deb` files and metadata.json indicate packaged/released artifact

---

## Worktree Check

### All worktrees

```bash
$ git worktree list
```

**Result**:
```
/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain                                            b3c8356 [main]
/home/elle_bryson/.local/share/opencode/worktree/0c8a37a7b2042c740517a0f722f221ae8afdec69/misty-moon   b7662aa [opencode/misty-moon]
/home/elle_bryson/.local/share/opencode/worktree/0c8a37a7b2042c740517a0f722f221ae8afdec69/quiet-tiger  df57981 [opencode/quiet-tiger]
/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees/equal-frost                f9a181e (detached HEAD)
/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees/spot-wolfsbane             f9a181e (detached HEAD)
/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/.kilo/worktrees/zealous-element            c578223 [zealous-element]
```

**Analysis**: No mallchain-app in any worktree

### Submodule check

```bash
$ git submodule status
```

**Result**: (no output) — No submodules

---

## Documentation Verification

### What does README.md say?

```bash
$ grep -i mallchain readme.md
```

**Result**:
```
Frontend UI: `mallchain-os-v14/` (Mallchain OS — see `mallchain-os-v14/README.md`)
```

**Analysis**: Only `mallchain-os-v14/` is documented, not `mallchain-app/`

### Repository root overview

```bash
$ git ls-tree HEAD | head -50
```

**Key findings**:
- `app/` — tracked ✓
- `backend/` — tracked ✓
- `marketplace/` — tracked ✓
- `mallchain-os-v14/` — tracked ✓
- `mallwallet/` — tracked ✓
- `mallchain-app/` — NOT FOUND ✗

---

## Summary of All Checks

| Check | Command | Result | Interpretation |
|-------|---------|--------|-----------------|
| In HEAD | `git ls-tree HEAD \| grep mallchain-app` | NOT FOUND | Not in repository |
| In origin/main | `git show origin/main:mallchain-app/...` | fatal | Never in remote |
| In history | `git log --all -- mallchain-app/` | (empty) | Never committed |
| Currently tracked | `git ls-files mallchain-app/` | (empty) | Untracked directory |
| In .gitignore | `git check-ignore -v mallchain-app/` | (empty) | Not ignored |
| Sparse-checkout | `git config core.sparseCheckout` | (empty) | Not excluded |
| On disk | `ls -la \| grep mallchain-app` | FOUND | Exists on disk |
| File age | `stat mallchain-app/src/App.tsx` | 2026-09-16 17:13 | Sep 16 (all identical) |
| Has artifacts | `ls -la mallchain-app/ \| .deb` | FOUND | `.deb` files present |
| In documentation | `grep mallchain-os-v14 readme.md` | FOUND | Documented frontend |
| In documentation | `grep mallchain-app readme.md` | NOT FOUND | Not documented |

---

## Conclusion from Commands

**All commands confirm**:
1. `mallchain-app/` is completely untracked
2. It never existed in git history
3. It does not exist in `origin/main` or any branch
4. It contains artifact files (.deb, metadata.json)
5. All files have identical timestamps (Sep 16, 17:13)
6. It is not explicitly in `.gitignore`
7. No sparse-checkout or worktree configuration excludes it
8. Only `mallchain-os-v14/` is documented in README
9. It appears to be extracted from a package, not cloned from git

**These findings are reproducible** — user can run any of these commands to verify.
