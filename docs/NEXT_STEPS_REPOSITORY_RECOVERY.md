# Next Steps: Repository Recovery & Clarification

**Current Blocker**: `mallchain-app/` is untracked and its source is unknown.

---

## Investigation Questions (For User to Answer)

### 1. Origin of mallchain-app/
- Where did the `mallchain-app/` directory come from?
  - Cloned from a different Git repository?
  - Downloaded as a release/package?
  - Extracted from CI/CD build artifact?
  - Restored from backup?
  - Something else?

### 2. Intended Architecture
- Is `mallchain-app/` supposed to be part of this repository?
- Or is it an external component that should be referenced but not committed?
- Is there documentation about where the authoritative source lives?

### 3. Version Control Intent
- Should `mallchain-app/` be committed to this repository?
- Or should it be added to `.gitignore` with a note about external installation?

---

## Recovery Paths (Options A, B, C)

### Option A: mallchain-app is a separate repository
**If**: The frontend is maintained in a different Git repository

**Actions**:
1. Identify the correct remote repository URL
2. Add as a Git submodule: `git submodule add <url> mallchain-app`
3. Add `.gitmodules` to version control
4. Document in README.md

**Result**: Proper version control, shared upstream updates

---

### Option B: mallchain-app is an external package/release
**If**: The frontend is downloaded/installed from package manager, GitHub releases, etc.

**Actions**:
1. Document installation location in README.md
2. Remove `mallchain-app/` from working directory
3. Add to `.gitignore`: `mallchain-app/`
4. Document how to re-install (e.g., `npm install` in parent, download from releases, etc.)
5. Commit `.gitignore` change

**Result**: Clean separation of concerns, explicit dependency management

---

### Option C: mallchain-app should be committed to this repo
**If**: The frontend is supposed to live in this repository alongside backend/blockchain code

**Actions**:
1. Confirm this is the intended architecture
2. `git add mallchain-app/` (only after confirming source)
3. `git commit -m "Add mallchain-app frontend source"`
4. Force push to remote if needed
5. Ensure DashboardPage.tsx is the correct version

**Result**: Single repository for all components

---

## Decision Tree

```
Is mallchain-app/ supposed to be here?
│
├─ YES, it's a separate repo submodule
│  └─→ Set up Git submodule (Option A)
│
├─ YES, it's external; should not be committed
│  └─→ Add to .gitignore, document source (Option B)
│
├─ YES, it should be committed here
│  └─→ Verify source first, then commit (Option C)
│
└─ UNSURE / Needs investigation
   └─→ Check project README, architecture docs, team comms
```

---

## Commands to Investigate Further

```bash
# Check if this is referenced as a submodule elsewhere
git config -l | grep submodule

# Check if there's any CI/CD config that mentions mallchain-app
grep -r "mallchain-app" .github/workflows/

# Check project documentation
cat README.md | grep -i "frontend\|mallchain-app"

# Check if there's a Dockerfile that builds mallchain-app
grep -r "mallchain-app" Dockerfile*

# Look for any build scripts that reference it
find . -name "*.sh" -type f ! -path "./.git/*" -exec grep -l "mallchain-app" {} \;
```

---

## Status of Current Code

**If user answers "I don't know where it came from"**:
- Safe assumption: It's an external component
- Recommendation: Add to `.gitignore`, document, proceed with browser testing using current copy
- Note: Browser test results will be "unversioned" until source is clarified

**If user answers "It's from a different repo"**:
- Set up submodule or document external location
- Restore authoritative version
- Verify DashboardPage.tsx is correct version

**If user answers "It should be here"**:
- Verify with team that this is current, correct version
- Commit once source is confirmed
- Move forward with testing

---

## Current Blocking Decision

**Cannot proceed with**: Browser connection testing using mallchain-app  
**Reason**: Source is unversioned; test results won't be reliable

**Can proceed with** (independent of this issue):
- Mission Control V14 browser testing (it IS version controlled)
- Backend iconv-lite issue investigation
- Other infrastructure testing

---

## After Clarification

Once the mallchain-app source is clarified:

1. **Repository fixed** → Proceed with browser connection test
2. **DashboardPage.tsx verified** → Ensure it's the correct version, not minimal replacement
3. **Run app on localhost:3000** → Test blockchain RPC/REST connectivity
4. **DevTools verification** → Confirm network requests to 127.0.0.1:26657

