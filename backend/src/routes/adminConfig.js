/**
 * Admin Configuration API
 * GET /api/admin/config - Fetch admin roles, permissions, and settings
 * Replaces hardcoded data from console.ts with live database config
 */
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * Admin role definitions with permissions
 * In production, these should come from a database collection
 */
const ADMIN_ROLES = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    permissions: '*', // All permissions
    requiresSignature: true,
  },
  {
    id: 'blockchain-admin',
    name: 'Blockchain Admin',
    permissions: ['chain', 'contracts', 'bridge', 'upgrades', 'testnet'],
    requiresSignature: true,
  },
  {
    id: 'validator-admin',
    name: 'Validator Admin',
    permissions: ['validators'],
    requiresSignature: false,
  },
  {
    id: 'treasury-admin',
    name: 'Treasury Admin',
    permissions: ['treasury', 'money', 'tokens', 'mlpts'],
    requiresSignature: true,
  },
  {
    id: 'security-admin',
    name: 'Security Admin',
    permissions: ['security', 'fraud', 'keys', 'emergency', 'lock', 'broadcast'],
    requiresSignature: true,
  },
  {
    id: 'marketplace-admin',
    name: 'Marketplace Admin',
    permissions: ['market', 'creators', 'agents', 'disputes', 'jobs'],
    requiresSignature: false,
  },
  {
    id: 'mining-admin',
    name: 'Mining Admin',
    permissions: ['mining', 'badges', 'referrals', 'broadcast'],
    requiresSignature: false,
  },
  {
    id: 'user-admin',
    name: 'User Admin',
    permissions: ['users', 'kyc', 'edu'],
    requiresSignature: false,
  },
  {
    id: 'governance-admin',
    name: 'Governance Admin',
    permissions: ['gov', 'config'],
    requiresSignature: true,
  },
  {
    id: 'developer-admin',
    name: 'Developer Admin',
    permissions: ['devs', 'contracts', 'testnet'],
    requiresSignature: false,
  },
  {
    id: 'devops-admin',
    name: 'DevOps Admin',
    permissions: ['infra', 'backup', 'chain'],
    requiresSignature: false,
  },
  {
    id: 'support-admin',
    name: 'Support Admin',
    permissions: ['users', 'disputes', 'notify', 'broadcast'],
    requiresSignature: false,
  },
  {
    id: 'auditor',
    name: 'Auditor',
    permissions: ['reports'],
    requiresSignature: false,
  },
];

/**
 * Status color mapping for UI display
 */
const STATUS_COLORS = {
  available: 'g',
  assigned: 'g',
  online: 'g',
  idle: 'y',
  're-enrol': 'y',
  healthy: 'g',
  running: 'g',
  valid: 'g',
  verified: 'g',
  approved: 'g',
  active: 'g',
  live: 'g',
  on: 'g',
  executed: 'g',
  passed: 'g',
  completed: 'g',
  success: 'g',
  refunded: 'g',
  reconciled: 'g',
  resolved: 'g',
  featured: 'g',
  normal: 'g',
  open: 'g',
  finalized: 'g',
  sent: 'g',
  fixed: 'g',
  immutable: 'g',
  cleared: 'g',
  reviewed: 'g',
  pending: 'y',
  syncing: 'y',
  degraded: 'y',
  paused: 'y',
  draft: 'y',
  proposed: 'y',
  held: 'y',
  flagged: 'y',
  investigating: 'y',
  disputed: 'y',
  'info requested': 'y',
  're-review': 'y',
  unverified: 'y',
  expiring: 'y',
  'rotation due': 'y',
  'rotation scheduled': 'y',
  suspended: 'y',
  locked: 'y',
  applied: 'y',
  new: 'y',
  escalated: 'y',
  reported: 'y',
  suspicious: 'y',
  failed: 'r',
  rejected: 'r',
  removed: 'r',
  stopped: 'r',
  down: 'r',
  blocked: 'r',
  revoked: 'r',
  cancelled: 'r',
  frozen: 'r',
  duplicate: 'r',
  jailed: 'r',
  restricted: 'r',
  expired: 'r',
  fraud: 'r',
  critical: 'r',
  warning: 'y',
  info: '',
  retired: '',
};

/**
 * Governance stages for proposal workflow
 */
const GOVERNANCE_STAGES = [
  'proposed',
  'code review',
  'security review',
  'testnet',
  'validators coordinated',
  'approved',
];

/**
 * Governance categories
 */
const GOVERNANCE_CATEGORIES = [
  'Protocol upgrade',
  'Parameter change',
  'Economic change',
  'Validator policy',
  'Treasury allocation',
  'Marketplace policy',
  'Mining policy',
  'Network upgrade',
];

/**
 * GET /api/admin/config
 * Fetch all admin configuration (roles, permissions, settings)
 * Requires admin authentication
 */
router.get('/config', requireAuth, requireAdmin, async (req, res) => {
  try {
    // In production, consider caching this config in Redis
    // to avoid repeated database queries

    const config = {
      roles: ADMIN_ROLES,
      statusColorMap: STATUS_COLORS,
      governanceStages: GOVERNANCE_STAGES,
      governanceCategories: GOVERNANCE_CATEGORIES,
      requiresSignatureRoles: ADMIN_ROLES.filter(r => r.requiresSignature).map(r => r.name),
      minMultiplier: 0.5,
      maxMultiplier: 2.0,
    };

    logger.info('admin', 'Admin config fetched', {
      userId: req.user._id,
      adminRole: req.user.role,
      adminCategory: req.user.adminCategory,
    });

    return res.json({
      ok: true,
      data: config,
    });
  } catch (error) {
    logger.error('admin', 'Failed to fetch admin config', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to fetch configuration',
    });
  }
});

/**
 * GET /api/admin/roles
 * List all available admin roles
 * Requires admin authentication
 */
router.get('/roles', requireAuth, requireAdmin, async (req, res) => {
  try {
    return res.json({
      ok: true,
      roles: ADMIN_ROLES,
    });
  } catch (error) {
    logger.error('admin', 'Failed to fetch admin roles', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to fetch roles',
    });
  }
});

/**
 * GET /api/admin/permissions
 * Get permission definitions for authorization
 */
router.get('/permissions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const permissionsMap = {};
    
    ADMIN_ROLES.forEach(role => {
      if (role.permissions === '*') {
        permissionsMap[role.id] = '*'; // All permissions
      } else {
        permissionsMap[role.id] = role.permissions;
      }
    });

    return res.json({
      ok: true,
      permissions: permissionsMap,
    });
  } catch (error) {
    logger.error('admin', 'Failed to fetch permissions', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to fetch permissions',
    });
  }
});

module.exports = router;
