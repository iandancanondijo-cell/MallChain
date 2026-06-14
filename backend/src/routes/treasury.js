const router = require('express').Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');
const { BurnPolicy, DynamicBurnThreshold } = require('../models/BurnPolicy');
const TreasuryLedger = require('../models/TreasuryLedger');

// List all configured burn policies
router.get('/policies', apiKeyAuth, async (_req, res) => {
  try {
    const policies = await BurnPolicy.find({}).lean();
    return res.json({ ok: true, policies });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Create or update a burn policy
router.post('/policies', apiKeyAuth, async (req, res) => {
  try {
    const { activity, burnPercentage, description, enabled } = req.body;
    if (!activity || typeof burnPercentage !== 'number') {
      return res.status(400).json({ error: 'activity and burnPercentage are required' });
    }

    const policy = await BurnPolicy.findOneAndUpdate(
      { activity },
      {
        burnPercentage,
        description: description || '',
        enabled: typeof enabled === 'boolean' ? enabled : true,
        updatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ ok: true, policy });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete a burn policy by activity
router.delete('/policies/:activity', apiKeyAuth, async (req, res) => {
  try {
    const { activity } = req.params;
    const result = await BurnPolicy.deleteOne({ activity });
    return res.json({ ok: true, deleted: result.deletedCount === 1 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// List all dynamic burn thresholds
router.get('/dynamic-thresholds', apiKeyAuth, async (_req, res) => {
  try {
    const thresholds = await DynamicBurnThreshold.find({})
      .sort({ activity: 1, supplyThreshold: -1, order: 1 })
      .lean();
    return res.json({ ok: true, thresholds });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Create or update a dynamic burn threshold
router.post('/dynamic-thresholds', apiKeyAuth, async (req, res) => {
  try {
    const { activity, supplyThreshold, burnPercentage, order, enabled } = req.body;
    if (!activity || typeof supplyThreshold !== 'number' || typeof burnPercentage !== 'number') {
      return res.status(400).json({ error: 'activity, supplyThreshold, and burnPercentage are required' });
    }

    const threshold = await DynamicBurnThreshold.findOneAndUpdate(
      { activity, supplyThreshold },
      {
        burnPercentage,
        order: typeof order === 'number' ? order : 0,
        enabled: typeof enabled === 'boolean' ? enabled : true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ ok: true, threshold });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete a dynamic burn threshold by id
router.delete('/dynamic-thresholds/:id', apiKeyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await DynamicBurnThreshold.deleteOne({ _id: id });
    return res.json({ ok: true, deleted: result.deletedCount === 1 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Query treasury ledger entries
router.get('/ledger', apiKeyAuth, async (req, res) => {
  try {
    const { activity, direction, relatedSaleId, limit = 100 } = req.query;
    const query = {};

    if (activity) query.activity = activity;
    if (direction) query.direction = direction;
    if (relatedSaleId) query.relatedSaleId = relatedSaleId;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const entries = await TreasuryLedger.find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();

    return res.json({ ok: true, entries });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Aggregated treasury metrics for quick inspection
router.get('/metrics', apiKeyAuth, async (_req, res) => {
  try {
    const totals = await TreasuryLedger.aggregate([
      {
        $group: {
          _id: { activity: '$activity', direction: '$direction' },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          activity: '$_id.activity',
          direction: '$_id.direction',
          totalAmount: 1,
          count: 1,
          _id: 0,
        },
      },
    ]);

    return res.json({ ok: true, totals });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
