# 🚀 Quick Setup: Google OAuth for Mallchain

## 1. Create Google OAuth Credentials (5 minutes)

### Step 1: Go to Google Cloud Console
1. Navigate to https://console.cloud.google.com
2. Sign in with your Google account

### Step 2: Create a New Project
1. Click the project selector dropdown at the top
2. Click "NEW PROJECT"
3. Name it: `Mallchain` (or your preferred name)
4. Click "CREATE"

### Step 3: Enable Google+ API
1. Search for "Google+ API" in the search bar
2. Click on it from results
3. Click "ENABLE"

### Step 4: Create OAuth Credentials
1. Go to APIs & Services → Credentials
2. Click "CREATE CREDENTIALS" → OAuth client ID
3. Choose "Web application"
4. Fill in:
   - **Name:** Mallchain (or your app name)
   - **Authorized JavaScript origins:**
     - `http://localhost:5173` (development)
     - `http://localhost:4000` (backend)
   - **Authorized redirect URIs:**
     - `http://localhost:4000/api/auth/google/callback` (development)
5. Click "CREATE"

### Step 5: Copy Your Credentials
A popup will show your:
- **Client ID** (looks like: `xxx.apps.googleusercontent.com`)
- **Client Secret** (long string)

Save these!

---

## 2. Configure Mallchain Backend (2 minutes)

### Update backend/.env

Open `backend/.env` and find:
```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET_HERE
```

Replace with your actual credentials:
```bash
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcd1234efgh5678
```

### Restart Backend
```bash
cd backend
npm start
```

---

## 3. Test Google Sign-In

### In Browser
1. Go to http://localhost:5173
2. Click "Create account" or "Sign in"
3. Click "Continue with Google"
4. Complete Google OAuth flow
5. Should see KYC gate blocking dashboard

### First User Test
```
✓ Sign up with Google account
✓ See KYC gate modal
✓ Click "Start Verification Now"
✓ Complete KYC wizard
✓ Access dashboard after KYC
```

---

## 4. For Production

### Change redirect URIs in Google Console
1. Go to Google Cloud Console
2. APIs & Services → Credentials
3. Click your OAuth app
4. Update "Authorized redirect URIs" to:
   - `https://mallchain.network/api/auth/google/callback`
   - Add any other production domain variations

### Update backend/.env for production
```bash
FRONTEND_URL=https://mallchain.network
GOOGLE_CLIENT_ID=YOUR_PRODUCTION_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_PRODUCTION_CLIENT_SECRET
```

### Restart backend with new credentials
```bash
NODE_ENV=production npm start
```

---

## 5. Troubleshooting

### Error: "Google login is not configured on this server"
**Solution:** Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `.env` and backend was restarted.

### OAuth redirect mismatch error
**Solution:** Make sure redirect URI in Google Console EXACTLY matches `http://localhost:4000/api/auth/google/callback` (for dev).

### KYC gate not showing
**Solution:** Login with an unverified account (kycLevel=1). New Google signups create unverified accounts by default.

### "Invalid Client ID"
**Solution:** Copy the Client ID exactly from Google Console, no extra spaces or typos.

---

## 6. What Users See

### Sign-In Flow
```
User clicks "Continue with Google"
    ↓
Redirected to Google login
    ↓
User selects account and grants permissions
    ↓
Redirected back to Mallchain
    ↓
KYC Gate appears (blocks dashboard)
    ↓
User clicks "Start Verification Now"
    ↓
KYC wizard begins
    ↓
After verification → Full access
```

### KYC Gate Features
- ✓ Minimizable to bottom-right pill
- ✓ "Start Verification Now" button
- ✓ Shows what features unlock after KYC
- ✓ Cannot navigate away from gate (overlay)
- ✓ Beautiful dark theme UI

---

## 7. Files Involved

### Frontend
- `mallchain-os-v14/src/features/auth/authApi.ts` - OAuth integration
- `mallchain-os-v14/src/features/auth/AuthPage.tsx` - Google button (already there)
- `mallchain-os-v14/src/components/KYCGate.tsx` - KYC blocking modal
- `mallchain-os-v14/src/App.tsx` - Integration

### Backend
- `backend/src/routes/auth.js` - OAuth routes
- `backend/src/controllers/authController.js` - OAuth handler
- `backend/.env` - Configuration

---

## 8. Verification Checklist

- [ ] Google credentials created
- [ ] Credentials added to `backend/.env`
- [ ] Backend restarted
- [ ] Frontend builds successfully (run: `npm run build`)
- [ ] Google Sign-In button visible on auth page
- [ ] Can click "Continue with Google"
- [ ] Redirected to Google login
- [ ] Can select Google account
- [ ] Redirected back to Mallchain
- [ ] KYC gate appears and blocks dashboard
- [ ] Can minimize gate to pill
- [ ] Can click "Start Verification"
- [ ] Routed to KYC wizard

---

**All set! Google Sign-In is now ready to use. 🎉**
