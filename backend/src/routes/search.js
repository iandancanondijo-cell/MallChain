const express = require('express');
const router = express.Router();
const axios = require('axios');
const Campaign = require('../models/Campaign');
const explorer = require('../services/explorerService');
const { config } = require('../config');
const { preventNoSQLInjection } = require('../middleware/inputValidation');

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/search?q=... — federated lookup across blocks, txs, validators, campaigns.
// Query shape decides which lookups even run: a bare integer only tries a block
// height, a 64-hex string only tries a tx hash, everything else is treated as a
// free-text match against validator monikers and campaign title/description/platform.
router.get('/', preventNoSQLInjection, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.json({ ok: true, query: q, blocks: [], txs: [], validators: [], campaigns: [] });
  }

  const results = { blocks: [], txs: [], validators: [], campaigns: [] };
  const tasks = [];

  if (/^\d+$/.test(q)) {
    tasks.push(
      explorer
        .getBlock(q)
        .then((data) => {
          if (data) results.blocks.push(data);
        })
        .catch(() => {})
    );
  }

  if (/^[0-9A-Fa-f]{64}$/.test(q)) {
    tasks.push(
      explorer
        .getTransaction(q)
        .then((data) => {
          if (data) results.txs.push(data);
        })
        .catch(() => {})
    );
  }

  tasks.push(
    axios
      .get(
        `${config.chain.rest.replace(/\/$/, '')}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100`,
        { timeout: 5000 }
      )
      .then((response) => {
        const validators = response.data?.validators || [];
        const lowerQ = q.toLowerCase();
        for (const v of validators) {
          const moniker = v.description?.moniker || '';
          if (v.operator_address === q || moniker.toLowerCase().includes(lowerQ)) {
            results.validators.push({
              operatorAddress: v.operator_address,
              name: moniker || v.operator_address,
              commission: Math.round(parseFloat(v.commission?.commission_rates?.rate || '0') * 10000) / 100,
              status: v.status,
            });
          }
        }
      })
      .catch(() => {})
  );

  tasks.push(
    Campaign.find({
      status: 'active',
      $or: [
        { title: { $regex: escapeRegex(q), $options: 'i' } },
        { description: { $regex: escapeRegex(q), $options: 'i' } },
        { platform: { $regex: escapeRegex(q), $options: 'i' } },
      ],
    })
      .limit(20)
      .lean()
      .then((campaigns) => {
        results.campaigns = campaigns.map((c) => ({
          id: c._id,
          title: c.title,
          description: c.description,
          platform: c.platform,
          rate_per_task: c.rate_per_task,
          budget_remaining: c.budget_remaining,
        }));
      })
      .catch(() => {})
  );

  await Promise.all(tasks);
  return res.json({ ok: true, query: q, ...results });
});

module.exports = router;
