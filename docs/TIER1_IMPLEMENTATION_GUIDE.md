# Tier 1 Implementation Guide: Session & Activity Management

**Priority Level**: ⭐ HIGH IMPACT  
**Complexity**: Low-Medium  
**Estimated Time**: ~40 hours total  
**Status**: Ready to Start

---

## Overview

This guide covers implementing the highest-priority Tier 1 features to expand the Profile & Settings section:

1. **Session Management** - View & terminate active sessions
2. **Login Activity** - Track login attempts with details
3. **Email Management** - Change email with verification
4. **Notification Enhancements** - Better notification controls
5. **API Keys** - Developer API management

---

## Phase 1: Session Management (Hours 1-8)

### What Users Get

```
Settings → Security → Active Sessions
├── Current Session
│   ├── Device: Chrome on MacOS
│   ├── Location: Nairobi, Kenya
│   ├── Last Active: 2 minutes ago
│   └── [This is your current session]
├── Other Sessions
│   ├── iPhone Safari (New York)
│   │   └── [Logout]
│   ├── Windows Desktop (London)
│   │   └── [Logout]
│   └── [Logout All Others]
└── Auto-logout after 120 minutes of inactivity
```

### Backend Implementation

#### 1.1 Create Session Model

**File**: `backend/src/models/session.js`

```javascript
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Token reference (hashed, not stored in plain)
  tokenHash: { type: String, required: true, unique: true },
  
  // Device & Browser info (parsed from User-Agent)
  device: String, // 'desktop', 'mobile', 'tablet'
  browser: String, // 'Chrome', 'Safari', etc.
  browserVersion: String,
  os: String, // 'MacOS', 'Windows', 'iOS', etc.
  
  // Network info
  ipAddress: { type: String, required: true },
  country: String, // From IP geolocation
  city: String,
  
  // Activity tracking
  createdAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
  
  // Lifecycle
  isActive: { type: Boolean, default: true, index: true },
  expiresAt: { type: Date, index: true }, // Auto-delete after expiration
  
  // Session metadata
  ipChangeCount: { type: Number, default: 0 }, // Suspicious activity detector
  userAgent: String, // Full user agent for debugging
});

// Indexes
SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ userId: 1, createdAt: -1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

module.exports = mongoose.models.Session || mongoose.model('Session', SessionSchema);
```

#### 1.2 Create API Endpoints

**File**: `backend/src/routes/sessions.js`

```javascript
const express = require('express');
const router = express.Router();
const { requireJWT } = require('../middleware/auth');
const Session = require('../models/session');
const logger = require('../utils/logger');

/**
 * GET /api/sessions
 * List all active sessions for the user
 */
router.get('/', requireJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentToken = req.headers.authorization?.split(' ')[1];

    const sessions = await Session.find({
      userId,
      isActive: true,
    }).sort('-lastActivityAt');

    // Mark which one is current
    const sessionsWithCurrent = sessions.map((s) => ({
      _id: s._id,
      device: s.device,
      browser: `${s.browser} ${s.browserVersion}`,
      os: s.os,
      country: s.country,
      city: s.city,
      lastActivityAt: s.lastActivityAt,
      createdAt: s.createdAt,
      isCurrent: s.tokenHash === hashToken(currentToken),
    }));

    res.json({ sessions: sessionsWithCurrent });
  } catch (error) {
    logger.error('sessions', 'Failed to get sessions', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * POST /api/sessions/{id}/logout
 * Terminate a specific session
 */
router.post('/:id/logout', requireJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = req.params.id;

    const session = await Session.findOneAndUpdate(
      { _id: sessionId, userId },
      { isActive: false },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.info('sessions', 'Session terminated', {
      userId,
      sessionId,
      device: session.device,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('sessions', 'Failed to logout session', error);
    res.status(500).json({ error: 'Failed to logout session' });
  }
});

/**
 * POST /api/sessions/logout-all-others
 * Terminate all sessions except current
 */
router.post('/logout-all-others', requireJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentToken = req.headers.authorization?.split(' ')[1];
    const currentTokenHash = hashToken(currentToken);

    const result = await Session.updateMany(
      {
        userId,
        isActive: true,
        tokenHash: { $ne: currentTokenHash },
      },
      { isActive: false }
    );

    logger.info('sessions', 'All other sessions terminated', {
      userId,
      count: result.modifiedCount,
    });

    res.json({ success: true, loggedOut: result.modifiedCount });
  } catch (error) {
    logger.error('sessions', 'Failed to logout all sessions', error);
    res.status(500).json({ error: 'Failed to logout sessions' });
  }
});

/**
 * POST /api/sessions/{id}/verify
 * Verify session activity (update lastActivityAt)
 */
router.post('/:id/verify', requireJWT, async (req, res) => {
  try {
    const sessionId = req.params.id;
    await Session.findByIdAndUpdate(sessionId, {
      lastActivityAt: new Date(),
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('sessions', 'Failed to verify session', error);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

// Helper: Hash token for comparison
function hashToken(token) {
  return require('crypto').createHash('sha256').update(token).digest('hex');
}

module.exports = router;
```

#### 1.3 Register Routes

**File**: `backend/src/index.js` (add to route registration section)

```javascript
const sessionRoutes = require('./routes/sessions');
app.use('/api/sessions', sessionRoutes);
```

### Frontend Implementation

#### 1.4 Create Session Manager Service

**File**: `mallchain-os-v14/src/services/sessionApi.ts`

```typescript
import { api } from './api';

export interface Session {
  _id: string;
  device: string;
  browser: string;
  os: string;
  country: string;
  city: string;
  lastActivityAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export const sessionApi = {
  async listSessions() {
    return api.get<{ sessions: Session[] }>('/api/sessions');
  },

  async logoutSession(sessionId: string) {
    return api.post(`/api/sessions/${sessionId}/logout`);
  },

  async logoutAllOthers() {
    return api.post('/api/sessions/logout-all-others');
  },

  async verifySession(sessionId: string) {
    return api.post(`/api/sessions/${sessionId}/verify`);
  },
};
```

#### 1.5 Create Session Manager Component

**File**: `mallchain-os-v14/src/features/settings/components/SessionManager.tsx`

```typescript
import { useEffect, useState, useCallback } from 'react';
import { sessionApi, type Session } from '../../../services/sessionApi';
import { useStoreVersion, toast } from '../../../components/ui';

export function SessionManager() {
  useStoreVersion();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [terminating, setTerminating] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const res = await sessionApi.listSessions();
    if (res.ok && res.data?.sessions) {
      setSessions(res.data.sessions);
    } else {
      toast(res.error || 'Failed to load sessions', false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const logoutSession = async (sessionId: string) => {
    setTerminating(sessionId);
    const res = await sessionApi.logoutSession(sessionId);
    setTerminating(null);
    
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s._id !== sessionId));
      toast('Session terminated');
    } else {
      toast(res.error || 'Failed to terminate session', false);
    }
  };

  const logoutAllOthers = async () => {
    if (!window.confirm('Logout all other sessions?')) return;
    
    setTerminating('all');
    const res = await sessionApi.logoutAllOthers();
    setTerminating(null);

    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      toast('All other sessions terminated');
    } else {
      toast(res.error || 'Failed to logout sessions', false);
    }
  };

  if (loading) {
    return <div className="tiny">Loading sessions…</div>;
  }

  const currentSession = sessions.find((s) => s.isCurrent);
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <div className="card mb">
      <div className="sec-title"><h2>Active Sessions</h2></div>

      {currentSession && (
        <div className="session-item current">
          <div className="session-header">
            <div className="session-icon">🖥️</div>
            <div className="session-info">
              <div className="session-title">
                {currentSession.browser} on {currentSession.os}
              </div>
              <div className="session-details">
                📍 {currentSession.city}, {currentSession.country}
              </div>
              <div className="session-time">
                Current session · Last active {formatTime(currentSession.lastActivityAt)}
              </div>
            </div>
            <div className="badge">Current</div>
          </div>
        </div>
      )}

      {otherSessions.length > 0 && (
        <>
          <div style={{ marginTop: 16, marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--txt-3)' }}>
            OTHER SESSIONS
          </div>
          {otherSessions.map((session) => (
            <div key={session._id} className="session-item">
              <div className="session-header">
                <div className="session-icon">📱</div>
                <div className="session-info">
                  <div className="session-title">
                    {session.browser} on {session.os}
                  </div>
                  <div className="session-details">
                    📍 {session.city}, {session.country}
                  </div>
                  <div className="session-time">
                    Active {formatTime(session.lastActivityAt)}
                  </div>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => logoutSession(session._id)}
                  disabled={terminating !== null}
                >
                  {terminating === session._id ? 'Logging out…' : 'Logout'}
                </button>
              </div>
            </div>
          ))}

          {otherSessions.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={logoutAllOthers}
              style={{ marginTop: 12 }}
              disabled={terminating !== null}
            >
              Logout all other sessions
            </button>
          )}
        </>
      )}

      {sessions.length === 0 && (
        <div className="tiny" style={{ color: 'var(--txt-3)' }}>
          No active sessions found
        </div>
      )}
    </div>
  );
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
```

#### 1.6 Add to Settings Component

In `mallchain-os-v14/src/features/settings/Settings.tsx`, add:

```tsx
import { SessionManager } from './components/SessionManager';

// Inside the return JSX, in the Security section:
<div className="card mb">
  <SessionManager />
</div>
```

---

## Phase 2: Login Activity (Hours 9-14)

### Similar implementation pattern:

1. **Backend Model**: `LoginActivity` (logs successful/failed attempts)
2. **API Endpoints**: GET `/api/login-activity` list attempts
3. **Frontend Service**: `loginActivityApi`
4. **Component**: `LoginActivity.tsx`

### Key Fields to Track
- Timestamp
- Success/Failure
- IP Address
- Device & Browser
- Country & City
- Failure reason (if failed)

---

## Phase 3: Email Management (Hours 15-24)

### Key Features
- Email change request with verification
- Verification link sent to new email
- Backup email option
- Email recovery flow

### Implementation Steps
1. Email verification model & API
2. Email change flow (request → verify → confirm)
3. Backup email management
4. Recovery email option

---

## Phase 4: Notification Enhancements (Hours 25-30)

### New Features
- Notification frequency (immediate/digest/weekly)
- Do-not-disturb schedule (hours)
- Notification priority levels
- Notification archive

---

## Phase 5: API Keys (Hours 31-40)

### Key Features
- Generate/revoke API keys
- Key permissions
- Usage tracking
- Rate limit info

---

## 🎯 Implementation Order

1. **Start with Session Management** - Most valuable, clear scope
2. **Then Login Activity** - Builds on same patterns
3. **Email Management** - Critical for account recovery
4. **Notification Enhancements** - Better UX
5. **API Keys** - Developer enablement

---

## ✅ Testing Checklist

### Session Management
- [ ] Load sessions endpoint works
- [ ] Logout single session works
- [ ] Logout all others works
- [ ] Current session identified correctly
- [ ] Multiple sessions display correctly
- [ ] Device/browser/OS parsed correctly
- [ ] Geolocation working

### UI Components
- [ ] Sessions render correctly
- [ ] Logout buttons functional
- [ ] Loading states show
- [ ] Error handling works
- [ ] Mobile responsive
- [ ] Accessibility (ARIA labels, keyboard nav)

---

## 📊 Database Indexes Needed

```javascript
// Sessions collection
db.sessions.createIndex({ userId: 1, isActive: 1 });
db.sessions.createIndex({ userId: 1, createdAt: -1 });
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.sessions.createIndex({ tokenHash: 1 }, { unique: true });
```

---

## 🔒 Security Considerations

1. **Token Hashing**: Never store plain JWT tokens
2. **IP Validation**: Alert on unusual IP changes
3. **Rate Limiting**: Prevent brute force session enumeration
4. **Audit Logging**: Log all session termination
5. **Session Timeout**: Auto-expire old sessions

---

## 📝 Notes

- Use responsive design for mobile
- Keep consistent with existing Settings UI
- Add loading states & error handling
- Implement proper accessibility
- Test on multiple devices/browsers
- Consider performance with many sessions

---

**Next Steps**:
1. Review this guide with team
2. Start Phase 1 (Session Management)
3. Implement backend models & APIs
4. Create frontend components
5. Test thoroughly
6. Move to Phase 2

**Questions?** Each phase has clear deliverables - start with Session Management!

