const express = require('express');
const router = express.Router();
const os = require('os');
const logger = require('../utils/logger');
const User = require('../models/user');
const KYC = require('../models/kyc');
const Campaign = require('../models/Campaign');
const TaskSubmission = require('../models/TaskSubmission');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const ValidatorApplication = require('../models/ValidatorApplication');
const BadgePurchase = require('../models/BadgePurchase');
const BadgeIssuance = require('../models/BadgeIssuance');
const TreasuryLedger = require('../models/TreasuryLedger');
const AuditLog = require('../models/AuditLog');
const MaintenanceMode = require('../models/MaintenanceMode');
const { requireSuperAdmin } = require('../middleware/adminAuth');
const { blindIndex, decryptField } = require('../utils/fieldEncryption');

const BACKEND_RPC = process.env.MALLCHAIN_RPC || 'http://localhost:26657';
const BACKEND_REST = process.env.MALLCHAIN_REST || 'http://localhost:1317';

// consoleData is consumed by the Specialised Admin console, which is a
// superadmin-only view. Locking every route to superadmin is intentional —
// category admins get their data through adminPanel.js endpoints that are
// scoped by category, not through this aggregated feed.
router.use(requireSuperAdmin);

// Helper to fetch chain data
async function getChainData() {
  try {
    const [statusRes, blockRes] = await Promise.all([
      fetch(`${BACKEND_RPC}/status`).then(r => r.json()).catch(() => null),
      fetch(`${BACKEND_REST}/cosmos/base/tendermint/v1beta1/blocks/latest`).then(r => r.json()).catch(() => null)
    ]);
    return { status: statusRes, block: blockRes };
  } catch (err) {
    logger.error('consoleData', { error: err.message });
    return { status: null, block: null };
  }
}

// GET /api/admin/console/users - Real user data
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).limit(100).sort({ createdAt: -1 });
    const rows = users.map(u => {
      const email = decryptField(u.email) || u.email || '';
      const wallet = u.walletAddress ? (decryptField(u.walletAddress) || '-') : '-';
      const badge = u.badgeType || '-';
      const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-';
      const status = u.banned ? 'suspended' : u.role === 'admin' || u.role === 'superadmin' ? 'active' : 'active';
      return [email.split('@')[0], wallet, badge, joined, status];
    });
    res.json({ rows });
  } catch (err) {
    logger.error('consoleUsers', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/console/kyc - Real KYC submissions
router.get('/kyc', async (req, res) => {
  try {
    const submissions = await KYC.find({}).limit(50).sort({ submittedAt: -1 }).populate('userId', 'email username');
    const rows = submissions.map(s => {
      const user = s.userId;
      const name = user ? (user.username || (decryptField(user.email) || user.email || 'Unknown')) : 'Unknown';
      const level = s.idType === 'passport' ? 'Level 2' : 'Level 1';
      const docs = s.idDocumentUrl ? 'ID document uploaded' : 'No documents';
      return [name, level, docs, s.status];
    });
    res.json({ rows });
  } catch (err) {
    logger.error('consoleKyc', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch KYC submissions' });
  }
});

// GET /api/admin/console/mining - Real mining campaigns
router.get('/mining', async (req, res) => {
  try {
    const campaigns = await Campaign.find({}).limit(50).sort({ created_at: -1 });
    const rows = campaigns.map(c => {
      const platform = c.platform || 'TikTok';
      const action = c.action || 'Post video';
      const reward = c.rate_per_task || 0;
      const budget = c.budget_remaining || 0;
      const duration = c.duration_days || 0;
      return [c.title, platform, action, reward, budget, `${duration} days`, c.status];
    });
    res.json({ rows });
  } catch (err) {
    logger.error('consoleMining', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch mining campaigns' });
  }
});

// GET /api/admin/console/validators - Real validator data from chain
router.get('/validators', async (req, res) => {
  try {
    const validatorsRes = await fetch(`${BACKEND_REST}/cosmos/staking/v1beta1/validators?pagination.limit=100`).then(r => r.json());
    const validators = validatorsRes.validators || [];

    let signingInfo = {};
    try {
      const signingRes = await fetch(`${BACKEND_REST}/cosmos/slashing/v1beta1/signing_infos?pagination.limit=100`).then(r => r.json());
      if (signingRes.info) {
        signingRes.info.forEach(si => {
          signingInfo[si.address] = {
            missedBlocks: si.missed_blocks_counter || 0,
            jailedUntil: si.jailed_until
          };
        });
      }
    } catch { /* signing info unavailable */ }

    const rows = validators.map(v => {
      const moniker = v.description?.moniker || 'Unknown';
      const stake = Math.round(parseFloat(v.tokens) / 1e6);
      const info = signingInfo[v.operator_address] || {};
      const missed = info.missedBlocks != null ? String(info.missedBlocks) : '-';
      const uptime = info.missedBlocks != null ? `${Math.max(0, 100 - (info.missedBlocks / 100)).toFixed(1)}%` : '-';
      const status = v.jailed ? 'jailed' : v.status === 'BOND_STATUS_BONDED' ? 'active' : 'pending';
      return [moniker, stake, uptime, missed, status];
    });
    res.json({ rows });
  } catch (err) {
    logger.error('consoleValidators', { error: err.message });
    res.json({ rows: [] });
  }
});

// GET /api/admin/console/chain - Real chain status and blocks
router.get('/chain', async (req, res) => {
  try {
    const { status, block } = await getChainData();
    if (!status || !block) {
      return res.json({ rows: [], kpis: {} });
    }

    const height = status.result?.sync_info?.latest_block_height || 0;
    const blockTime = status.result?.sync_info?.latest_block_time;

    let peerCount = 0;
    try {
      const netRes = await fetch(`${BACKEND_RPC}/net_info`).then(r => r.json());
      peerCount = netRes?.n_peers || 0;
    } catch { /* net_info unavailable */ }

    let avgBlockTime = '-';
    let throughput = '-';
    let failedTxs = 0;
    const blocks = [];

    if (block?.block?.header) {
      const latestHeight = parseInt(block.block.header.height, 10);
      const latestTime = new Date(block.block.header.time);

      try {
        const prevBlockRes = await fetch(`${BACKEND_REST}/cosmos/base/tendermint/v1beta1/blocks/${latestHeight - 1}`).then(r => r.json());
        if (prevBlockRes?.block?.header?.time) {
          const prevTime = new Date(prevBlockRes.block.header.time);
          const diffSec = (latestTime - prevTime) / 1000;
          avgBlockTime = `${diffSec.toFixed(1)} s`;
          throughput = diffSec > 0 ? `${Math.round(1 / diffSec)} TPS` : '-';
        }
      } catch { /* previous block unavailable */ }

      try {
        const txRes = await fetch(`${BACKEND_REST}/cosmos/tx/v1beta1/txs?events=tx.height=${latestHeight}&pagination.limit=100`).then(r => r.json());
        const txs = txRes?.tx_responses || [];
        failedTxs = txs.filter(tx => tx.code !== 0).length;
      } catch { /* tx query unavailable */ }

      for (let i = 0; i < 4; i++) {
        const bh = latestHeight - i;
        let proposer = '-';
        let timeAgo = '-';
        try {
          const bRes = await fetch(`${BACKEND_REST}/cosmos/base/tendermint/v1beta1/blocks/${bh}`).then(r => r.json());
          if (bRes?.block?.header) {
            proposer = bRes.block.header.proposer_address?.slice(0, 12) || '-';
            const bTime = new Date(bRes.block.header.time);
            const secsAgo = Math.round((Date.now() - bTime) / 1000);
            timeAgo = secsAgo < 60 ? `${secsAgo} s ago` : `${Math.round(secsAgo / 60)} m ago`;
          }
        } catch { /* block unavailable */ }

        let txCount = 0;
        try {
          const txRes = await fetch(`${BACKEND_REST}/cosmos/tx/v1beta1/txs?events=tx.height=${bh}&pagination.limit=100`).then(r => r.json());
          txCount = txRes?.tx_responses?.length || 0;
        } catch { /* tx query unavailable */ }

        blocks.push([bh.toLocaleString(), txCount, proposer, timeAgo, 'finalized']);
      }
    }

    const kpis = {
      blockHeight: height,
      blockTime: avgBlockTime,
      throughput,
      failedTxs,
      peers: peerCount,
      diskUsed: '-'
    };
    res.json({ rows: blocks, kpis });
  } catch (err) {
    logger.error('consoleChain', { error: err.message });
    res.json({ rows: [], kpis: {} });
  }
});

// GET /api/admin/console/withdrawals - Real withdrawal requests
router.get('/withdrawals', async (req, res) => {
  try {
    const withdrawals = await WithdrawalRequest.find({}).limit(50).sort({ createdAt: -1 });
    const rows = withdrawals.map(w => {
      const ref = w._id.toString().slice(-6);
      const user = w.walletAddress || 'Unknown';
      const amount = w.amountKes || 0;
      const reason = w.status === 'pending_review' ? 'Pending review' : '-';
      return [ref, user, amount, reason, w.status === 'pending_review' ? 'pending' : w.status];
    });
    res.json({ rows });
  } catch (err) {
    logger.error('consoleWithdrawals', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// GET /api/admin/console/treasury - Real treasury data
router.get('/treasury', async (req, res) => {
  try {
    const entries = await TreasuryLedger.find({}).limit(50).sort({ createdAt: -1 });
    const rows = entries.map(e => {
      const ref = e._id.toString().slice(-6);
      const purpose = e.description || e.activity;
      const amount = e.amount || 0;
      const proposedBy = 'System';
      const status = e.direction === 'inflow' ? 'executed' : 'executed';
      return [ref, purpose, amount, proposedBy, status];
    });
    res.json({ rows });
  } catch (err) {
    logger.error('consoleTreasury', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch treasury data' });
  }
});

// GET /api/admin/console/badges - Real badge data
router.get('/badges', async (req, res) => {
  try {
    const purchases = await BadgePurchase.find({}).limit(50).sort({ createdAt: -1 });
    const rows = purchases.map(p => {
      const badge = p.badgeType || 'Miner';
      const price = p.fiatAmount || 500;
      const status = p.status === 'issued' ? 'active' : p.status;
      return [badge, 'Purchase', price, status];
    });
    res.json({ rows });
  } catch (err) {
    logger.error('consoleBadges', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// GET /api/admin/console/audit - Real audit log
router.get('/audit', async (req, res) => {
  try {
    const logs = await AuditLog.find({}).limit(200).sort({ createdAt: -1 });
    const rows = logs.map(l => {
      const time = new Date(l.createdAt).toLocaleString();
      const role = l.actor || 'System';
      const action = l.action;
      const tier = '1';
      const auth = 'Single admin';
      return [time, role, action, tier, auth];
    });
    res.json({ rows });
  } catch (err) {
    logger.error('consoleAudit', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// GET /api/admin/console/maintenance - Real maintenance mode status
router.get('/maintenance', async (req, res) => {
  try {
    const maintenance = await MaintenanceMode.findOne({});
    const rows = [];
    const scopes = ['send', 'withdraw', 'buy', 'payment', 'marketplace', 'staking', 'vault', 'badge', 'dex'];
    scopes.forEach(scope => {
      const status = maintenance?.scopes?.[scope] ? 'paused' : 'normal';
      rows.push([scope, 'Service', status]);
    });
    res.json({ rows });
  } catch (err) {
    logger.error('consoleMaintenance', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch maintenance status' });
  }
});

// GET /api/admin/console/overview - Aggregated overview data
router.get('/overview', async (req, res) => {
  try {
    const [userCount, kycPending, campaignCount, withdrawalPending, validatorApps] = await Promise.all([
      User.countDocuments({}),
      KYC.countDocuments({ status: 'pending' }),
      Campaign.countDocuments({}),
      WithdrawalRequest.countDocuments({ status: 'pending_review' }),
      ValidatorApplication.countDocuments({ status: 'pending' })
    ]);
    const { status } = await getChainData();
    const blockHeight = status?.result?.sync_info?.latest_block_height || 0;
    res.json({
      users: userCount,
      kycPending,
      campaigns: campaignCount,
      withdrawalsPending: withdrawalPending,
      validatorApps,
      blockHeight
    });
  } catch (err) {
    logger.error('consoleOverview', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// GET /api/admin/metrics - System metrics for monitoring dashboard
router.get('/metrics', async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

    const cpus = os.cpus();
    let idleTotal = 0, totalTotal = 0;
    cpus.forEach(cpu => {
      Object.values(cpu.times).forEach(t => { totalTotal += t; });
      idleTotal += cpu.times.idle;
    });
    const cpuPercent = Math.round(((totalTotal - idleTotal) / totalTotal) * 100);

    let diskPercent = null;
    try {
      const { execSync } = require('child_process');
      const dfOutput = execSync('df / | tail -1 | awk \'{print $5}\'', { encoding: 'utf8', timeout: 2000 });
      diskPercent = parseInt(dfOutput.trim(), 10);
    } catch { /* disk usage unavailable */ }

    res.json({
      cpu: cpuPercent,
      mem: memPercent,
      disk: diskPercent,
      redis: null,
      db: null,
      failed: null,
      err: null
    });
  } catch (err) {
    logger.error('consoleMetrics', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

module.exports = router;
