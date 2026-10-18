# Profile & Settings Section - Analysis & Expansion Plan

**Date**: October 5, 2026  
**Analysis Status**: ✅ COMPLETE  
**Expansion Plan**: Ready for Development

---

## 📋 Current Capabilities Analysis

### Existing Features (858 lines)

#### 1. **Verification Status Checklist**
- Identity (KYC) status
- Two-factor authentication status
- Wallet connection status
- Mallchain badge status

#### 2. **Profile Editing**
- Username management
- Phone number input
- Avatar display (generated from initials)
- Display name (from KYC)
- Email display

#### 3. **Account Information**
- KYC level display (1-2)
- Wallet address display
- Account status (active/frozen)
- Mallpoints balance

#### 4. **Security Settings**
- 2FA setup/disable (TOTP with backup codes)
- Password change
- Backup code management

#### 5. **Preferences**
- Theme accent (gold, cyan, purple, emerald)
- Currency selection (multiple options)
- Language selection (EN, FR, ES, SW)

#### 6. **Privacy Controls**
- Show balance to others (toggle)
- Show activity (toggle)
- Allow direct messages (toggle)

#### 7. **Identity Verification (KYC)**
- Personal info display (name, DOB, nationality)
- Address information
- Identity document details
- Financial information
- Document viewer

#### 8. **Notifications**
- Email notifications (5 categories)
- Push notifications (5 categories)
- SMS notifications (5 categories)
- WhatsApp notifications (5 categories)
- Phone verification flow
- WhatsApp opt-in/opt-out

#### 9. **Badge Purchase**
- M-Pesa payment integration
- Badge reservation
- On-chain issuance
- Payment status polling

#### 10. **App Settings**
- Network display
- Local storage reset

---

## 🔍 Current Limitations

### Missing Features That Should Be Added

1. **Account Management**
   - ❌ No email change/verification
   - ❌ No account deletion/deactivation option
   - ❌ No login activity/session management
   - ❌ No connected devices/sessions view
   - ❌ No API key management for developers

2. **Profile Enhancement**
   - ❌ No profile picture upload (only generated avatar)
   - ❌ No bio/about section
   - ❌ No social media links
   - ❌ No public profile view option
   - ❌ No display name customization (uses KYC)

3. **Security Enhancements**
   - ❌ No password reset email
   - ❌ No login alerts
   - ❌ No IP whitelisting
   - ❌ No device trust management
   - ❌ No activity log/audit trail

4. **Notification Improvements**
   - ❌ No notification history/archive
   - ❌ No notification frequency control (digest options)
   - ❌ No do-not-disturb hours
   - ❌ No per-contact notification settings

5. **Privacy & Data**
   - ❌ No data export option (GDPR)
   - ❌ No data deletion request
   - ❌ No cookie/tracking preferences
   - ❌ No third-party app permissions
   - ❌ No activity tracking transparency

6. **Accessibility**
   - ❌ No accessibility settings
   - ❌ No font size adjustment
   - ❌ No high contrast mode
   - ❌ No screen reader preferences

7. **Advanced Features**
   - ❌ No two-device 2FA
   - ❌ No passwordless login
   - ❌ No security keys (U2F/WebAuthn)
   - ❌ No activity insights
   - ❌ No preference history/undo

8. **Developer Tools**
   - ❌ No webhooks configuration
   - ❌ No API documentation access
   - ❌ No rate limit info
   - ❌ No API usage stats

---

## 🚀 Expansion Plan - Priority Tiers

### **TIER 1: High Impact, Low Complexity** ⭐ START HERE

These should be implemented first:

1. **Session Management**
   - View active sessions
   - Last login information
   - Device info (browser, OS)
   - Logout all other devices

2. **Login Activity**
   - Recent login attempts (successful & failed)
   - IP addresses & locations
   - Device types
   - Timestamps

3. **Email Management**
   - Email change with verification
   - Backup email option
   - Email verification status
   - Email recovery options

4. **Account Preferences**
   - Account visibility (public/private)
   - Profile visibility (show/hide certain fields)
   - Activity visibility

5. **Notification Enhancements**
   - Notification frequency (immediate/digest/weekly)
   - Do-not-disturb schedule
   - Notification priorities
   - Notification archives

### **TIER 2: Medium Impact, Medium Complexity**

1. **Profile Picture Upload**
   - Image upload functionality
   - Crop/resize
   - Preview
   - CDN storage

2. **Rich Profile**
   - Bio/about section (250 chars)
   - Social media links
   - Website URL
   - Public profile view

3. **Security Keys**
   - WebAuthn/U2F support
   - Multiple security keys
   - Key management

4. **Data Export (GDPR)**
   - Download all data
   - Multiple formats (JSON, CSV)
   - Scheduled exports

5. **API Keys**
   - Generate/revoke API keys
   - Key permissions
   - Usage tracking

### **TIER 3: Advanced Features**

1. **Activity Insights**
   - Login frequency analytics
   - Feature usage stats
   - Time zone detection
   - Behavior patterns

2. **Webhooks**
   - Event-based webhooks
   - Webhook management
   - Retry logic
   - Testing endpoint

3. **Advanced 2FA**
   - FIDO2 keys
   - Biometric 2FA
   - Device trust

4. **Preferences History**
   - Undo recent changes
   - Preference versioning
   - Default settings

---

## 📐 Proposed Component Structure

### New Components to Create

```
src/features/settings/
├── Settings.tsx (main page - keep existing)
├── components/
│   ├── SessionManager.tsx (Tier 1)
│   ├── LoginActivity.tsx (Tier 1)
│   ├── EmailManagement.tsx (Tier 1)
│   ├── NotificationManager.tsx (enhanced - Tier 1)
│   ├── ProfilePictureUpload.tsx (Tier 2)
│   ├── RichProfile.tsx (Tier 2)
│   ├── SecurityKeys.tsx (Tier 2)
│   ├── DataExport.tsx (Tier 2)
│   ├── ApiKeys.tsx (Tier 2)
│   ├── ActivityInsights.tsx (Tier 3)
│   ├── Webhooks.tsx (Tier 3)
│   └── PreferencesHistory.tsx (Tier 3)
├── hooks/
│   ├── useSessionManagement.ts
│   ├── useLoginActivity.ts
│   ├── useEmailManagement.ts
│   └── useActivityInsights.ts
└── services/
    ├── sessionApi.ts
    ├── loginActivityApi.ts
    ├── emailApi.ts
    ├── dataExportApi.ts
    └── apiKeysApi.ts
```

---

## 🔌 Required Backend APIs

### New Endpoints to Implement

```
# Session Management
GET    /api/settings/sessions         - List active sessions
POST   /api/settings/sessions/{id}/logout - End specific session
POST   /api/settings/logout-all       - End all other sessions

# Login Activity
GET    /api/settings/login-activity   - Recent logins
GET    /api/settings/failed-logins    - Failed attempts

# Email Management
POST   /api/settings/email/change     - Request email change
POST   /api/settings/email/verify     - Verify new email
GET    /api/settings/email/status     - Email verification status

# Data Export
POST   /api/settings/export/request   - Request data export
GET    /api/settings/export/status    - Export status
GET    /api/settings/export/download  - Download export

# API Keys
GET    /api/settings/api-keys         - List API keys
POST   /api/settings/api-keys         - Create new API key
DELETE /api/settings/api-keys/{id}    - Revoke API key
GET    /api/settings/api-keys/{id}/usage - Key usage stats

# Security Keys (WebAuthn)
POST   /api/settings/security-keys/register - Register key
DELETE /api/settings/security-keys/{id}     - Remove key
GET    /api/settings/security-keys          - List keys
```

---

## 🎯 Development Steps

### Phase 1: Foundation (Week 1)
- [ ] Backend models for sessions, login activity, email verification
- [ ] API endpoints for session management
- [ ] API endpoints for login activity
- [ ] SessionManager component UI
- [ ] LoginActivity component UI

### Phase 2: Email & Notifications (Week 2)
- [ ] Email verification flow
- [ ] Email management API endpoints
- [ ] EmailManagement component
- [ ] Enhanced notification settings
- [ ] Do-not-disturb schedule component

### Phase 3: Data & API (Week 3)
- [ ] Data export backend logic
- [ ] DataExport component
- [ ] API keys management
- [ ] ApiKeys component

### Phase 4: Advanced Features (Week 4+)
- [ ] Profile picture upload
- [ ] RichProfile component
- [ ] Security keys (WebAuthn)
- [ ] Activity insights

---

## 💾 Database Schema Extensions

### New Collections/Tables Needed

```javascript
// Sessions
{
  _id: ObjectId,
  userId: ObjectId,
  token: String (hashed),
  ipAddress: String,
  userAgent: String,
  device: String,
  browser: String,
  os: String,
  createdAt: Date,
  lastActivityAt: Date,
  expiresAt: Date,
  isActive: Boolean
}

// LoginActivity
{
  _id: ObjectId,
  userId: ObjectId,
  ipAddress: String,
  userAgent: String,
  success: Boolean,
  reason: String (if failed),
  device: String,
  browser: String,
  country: String,
  city: String,
  timestamp: Date
}

// EmailVerification
{
  _id: ObjectId,
  userId: ObjectId,
  newEmail: String,
  token: String,
  verified: Boolean,
  createdAt: Date,
  expiresAt: Date
}

// ApiKey
{
  _id: ObjectId,
  userId: ObjectId,
  name: String,
  key: String (hashed),
  permissions: [String],
  lastUsedAt: Date,
  createdAt: Date,
  expiresAt: Date,
  active: Boolean
}

// DataExport
{
  _id: ObjectId,
  userId: ObjectId,
  format: String ('json' | 'csv'),
  status: String ('pending' | 'processing' | 'ready' | 'expired'),
  downloadUrl: String,
  createdAt: Date,
  expiresAt: Date,
  size: Number
}
```

---

## 📊 UI/UX Considerations

### Layout & Navigation

- Tab-based interface within Settings
- Left sidebar with sections
- Mobile-responsive tabs/accordion
- Progress indicators for multi-step flows
- Real-time status updates

### Key Interactions

- Session termination with confirmation
- Email verification via link (email)
- API key generation with copy-to-clipboard
- Data export with progress bar
- Activity charts/graphs

### Accessibility

- ARIA labels for all interactive elements
- Keyboard navigation support
- Color-blind friendly indicators
- Screen reader friendly
- Focus management

---

## ✅ Testing Requirements

### Unit Tests
- Email validation logic
- API key generation
- Session expiration
- Data export formatting

### Integration Tests
- Session management flow
- Email change flow
- API key creation & revocation
- Data export request

### E2E Tests
- Complete settings update flow
- Security settings change
- Session logout
- Email verification

---

## 🎓 Implementation Priority

**RECOMMENDED START POINT** (Tier 1 features):

1. **Session Management** - Most valuable for security
2. **Login Activity** - Transparency + security
3. **Email Management** - Account recovery critical
4. **Notification Enhancements** - Better UX
5. **API Keys** - Developer enablement

**ESTIMATED EFFORT**:
- Session Management: 8 hours
- Login Activity: 6 hours
- Email Management: 10 hours
- Notification Enhancements: 6 hours
- API Keys: 12 hours
- **Total Tier 1: ~40 hours (~1 week)**

---

## 📝 Notes

- All features should maintain design consistency with existing Settings
- Mobile-first approach for responsiveness
- Consider security implications (IP logging, data retention)
- GDPR compliance for data export/deletion
- Rate limiting for sensitive operations
- Audit logging for all changes

---

**Status**: Analysis Complete - Ready for Development  
**Next Step**: Implement Tier 1 features (start with Session Management)

