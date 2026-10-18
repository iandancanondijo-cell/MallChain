# Session Manager - Quick Testing Guide

**Status**: Implementation Complete ✅  
**Test Date**: October 5, 2026

---

## 🚀 Quick Start

### Prerequisites
- Backend running on localhost:3001
- Frontend running on localhost:3000
- User logged in with valid JWT token

### Files to Test

**Backend**:
- `backend/src/models/session.js` ✅ Created
- `backend/src/routes/sessions.js` ✅ Created
- `backend/src/index.js` ✅ Updated (route registered)

**Frontend**:
- `mallchain-os-v14/src/services/sessionApi.ts` ✅ Created
- `mallchain-os-v14/src/features/settings/components/SessionManager.tsx` ✅ Created
- `mallchain-os-v14/src/features/settings/Settings.tsx` ✅ Updated (import + component added)

---

## 🧪 Testing Steps

### Step 1: Verify Backend Compilation
```bash
cd backend
npm run build  # or your build command
# Should complete without errors
```

### Step 2: Verify Frontend Compilation
```bash
cd mallchain-os-v14
npm run build  # or your build command
# Should complete without errors related to SessionManager or sessionApi
```

### Step 3: Start Backend & Frontend
```bash
# Terminal 1: Backend
cd backend
npm start
# Should show: "Server listening on port 3001"

# Terminal 2: Frontend
cd mallchain-os-v14
npm start
# Should show: "Local: http://localhost:3000"
```

### Step 4: Test Frontend UI

1. **Navigate to Settings**
   - Go to `http://localhost:3000`
   - Authenticate if needed
   - Click on user menu → Settings
   - Should see new "Active Sessions" section below the "Security" section

2. **Verify Component Display**
   - ✅ Should see "Active Sessions" heading
   - ✅ Should see a tip about 24-hour auto-expiration
   - ✅ Should see "Current Session" section with green badge
   - ✅ Should see current device info (browser, OS, location)

3. **Check Mobile Responsive**
   - Open DevTools (F12)
   - Toggle device toolbar (Ctrl+Shift+M)
   - Check that layout adapts to phone/tablet sizes
   - Buttons should be touch-friendly

---

## 🔧 API Testing (Postman/curl)

### Get Your JWT Token
```bash
# Get token from browser console:
# localStorage.getItem('token')
# Or copy from Authorization header in Network tab
```

### Test 1: List Sessions
```bash
curl -X GET "http://localhost:3001/api/sessions" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Expected response:
# {
#   "sessions": [
#     {
#       "_id": "...",
#       "device": "desktop",
#       "browser": "Chrome 130.0",
#       "os": "MacOS",
#       "country": "Unknown",
#       "city": "Unknown",
#       "lastActivityAt": "2026-10-05T10:30:00Z",
#       "createdAt": "2026-10-05T08:00:00Z",
#       "isCurrent": true
#     }
#   ]
# }
```

### Test 2: Create Second Session (for testing logout)
1. Open another browser (Firefox if Chrome was primary)
2. Login with same account
3. Get new JWT token from that browser
4. Go back to first browser's Settings page
5. Refresh page - should see 2 sessions now

### Test 3: Logout Specific Session
```bash
# Get SESSION_ID from previous list response
curl -X POST "http://localhost:3001/api/sessions/SESSION_ID/logout" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# { "success": true }

# Verify on frontend: refresh Settings, session should be gone
```

### Test 4: Logout All Others
```bash
curl -X POST "http://localhost:3001/api/sessions/logout-all-others" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# { "success": true, "loggedOut": 1 }

# Verify: Only current session remains
```

### Test 5: Verify Session Activity
```bash
curl -X POST "http://localhost:3001/api/sessions/SESSION_ID/verify" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# { "success": true }

# Verify: lastActivityAt should be recent timestamp
```

---

## 🎯 UI Interaction Testing

### Test Current Session Display
- [ ] Green "Active" badge visible
- [ ] Text says "This is your current session"
- [ ] Device emoji present (🖥️)
- [ ] Browser name shown (e.g., "Chrome 130.0")
- [ ] OS shown (e.g., "MacOS")
- [ ] Location shown (e.g., "Unknown, Unknown")
- [ ] Last active time shown in relative format

### Test Other Sessions (if available)
- [ ] Listed separately from current session
- [ ] No green badge
- [ ] Logout button visible for each
- [ ] "Logout All Others" button visible
- [ ] Device info accurate

### Test Logout Actions
1. **Logout Single Session**
   - Click logout button on any session
   - Wait for spinner
   - Session should disappear
   - Toast message appears: "Session terminated"

2. **Logout All Others**
   - Click "Logout All X Other Sessions"
   - Confirmation dialog appears
   - After confirming, other sessions disappear
   - Toast shows count: "All other sessions terminated (X sessions)"

### Test Time Formatting
- Sessions just created: "Just now"
- After 5 minutes: "5m ago"
- After 1 hour: "1h ago"
- After 1 day: "1d ago"
- After 7+ days: Shows date like "10/5/2026"

---

## 🔍 Browser DevTools Checks

### Network Tab
1. Go to Settings page
2. Open DevTools → Network tab
3. Look for request to `/api/sessions`
4. Should show:
   - Status: 200
   - Type: xhr/fetch
   - Response time: < 500ms
   - Response size: varies with number of sessions

### Console Tab
1. Should be clean (no red errors)
2. No "undefined" warnings for sessionApi
3. No TypeScript compilation errors

### Application Tab
1. localStorage should have `token` key
2. No errors in storage operations

---

## ⚠️ Common Issues & Fixes

### Issue: "Cannot find module 'ua-parser-js'"
**Fix**: Already fixed! Backend uses simple regex-based UA parsing instead.

### Issue: SessionManager not showing in Settings
**Fix**: 
1. Clear browser cache
2. Restart frontend dev server
3. Check that component import is in Settings.tsx

### Issue: Sessions list shows as "Loading sessions…" forever
**Fix**:
1. Check backend is running
2. Check JWT token is valid (hasn't expired)
3. Check browser console for API errors
4. Verify `/api/sessions` endpoint is registered

### Issue: Logout button doesn't work
**Fix**:
1. Check session ID is valid
2. Check JWT token is still valid
3. Look at backend logs for errors
4. Verify session exists and is active

### Issue: "Current session" badge missing
**Fix**:
1. Verify current token hash matches database
2. Check that Authorization header is being sent
3. Verify token hasn't been modified

---

## 📊 Expected Test Results

### Performance
- **API Response**: < 200ms for list
- **Component Render**: < 100ms
- **Logout Action**: < 300ms
- **Page Load**: < 1s (including API call)

### Reliability
- **No Errors**: Settings page loads cleanly
- **Clean Console**: No TypeScript errors
- **API Success**: All endpoints return 200 status
- **Data Accuracy**: Device info matches actual device

### UX
- **Clear Indicator**: Current session is obvious
- **Easy Actions**: Logout buttons are easy to find
- **Feedback**: Toast messages confirm actions
- **Responsive**: Works on mobile and desktop

---

## 📋 Sign-Off Checklist

### Backend
- [ ] Models compile without errors
- [ ] Routes compile without errors
- [ ] Routes registered in index.js
- [ ] API endpoints respond with correct format
- [ ] Error handling works properly
- [ ] Logging appears in backend console

### Frontend
- [ ] TypeScript compiles cleanly
- [ ] No import errors
- [ ] Component appears in Settings page
- [ ] API service works with backend
- [ ] UI renders correctly
- [ ] Buttons are functional

### Integration
- [ ] Frontend successfully calls backend APIs
- [ ] Data flows correctly end-to-end
- [ ] Toast notifications work
- [ ] Loading states appear/disappear
- [ ] Error messages display on failures

### Performance
- [ ] API response times acceptable
- [ ] Component renders smoothly
- [ ] No memory leaks
- [ ] Responsive on mobile

### Security
- [ ] Requires valid JWT token
- [ ] User can only see their own sessions
- [ ] Tokens stored as hashes (not plain text)
- [ ] No sensitive data in logs

---

## 🎓 What to Test Next

After Session Manager works:

1. **Login Activity** (Phase 1B)
   - Track login attempts with timestamps
   - Show failed login history
   - IP reputation checking

2. **Email Management** (Phase 1C)
   - Change email address
   - Email verification flow
   - Backup email for recovery

3. **API Keys** (Phase 1E)
   - Generate developer API keys
   - Manage key permissions
   - View usage statistics

---

## 📞 Debugging Commands

### View Backend Logs
```bash
# Sessions route logs
grep -n "sessions" backend/logs/*.log

# Or follow logs in real-time
tail -f backend/logs/app.log | grep "sessions"
```

### Check Database
```bash
# Connect to MongoDB
mongosh

# List all sessions
use mallchain
db.sessions.find().pretty()

# Count sessions
db.sessions.countDocuments()

# Find sessions for specific user
db.sessions.find({ userId: ObjectId("...") }).pretty()

# Check indexes
db.sessions.getIndexes()
```

### Clear Test Data
```bash
# Delete all sessions
db.sessions.deleteMany({})

# Or delete sessions for specific user
db.sessions.deleteMany({ userId: ObjectId("USER_ID") })
```

---

**Ready to test? Start with Step 1 above! 🚀**

