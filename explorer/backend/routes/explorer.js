const express = require('express');
const router = express.Router();
const db = require('../db');

// Get latest blocks
router.get('/blocks', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(
      `
      SELECT * FROM blocks
      ORDER BY height DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('Error fetching blocks:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single block by height
router.get('/blocks/:height', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM blocks WHERE height = $1',
      [req.params.height]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Block not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error fetching block:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get transactions for a block
router.get('/blocks/:height/transactions', async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT * FROM transactions
      WHERE block_height = $1
      ORDER BY created_at ASC
      `,
      [req.params.height]
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get transaction by hash
router.get('/tx/:hash', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM transactions WHERE hash = $1',
      [req.params.hash]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error fetching transaction:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all validators
router.get('/validators', async (req, res) => {
  try {
    const allowedOrderBy = ['voting_power', 'address', 'moniker', 'uptime', 'commission'];
    const orderBy = allowedOrderBy.includes(req.query.orderBy) ? req.query.orderBy : 'voting_power';
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

    const result = await db.query(
      `
      SELECT * FROM validators
      ORDER BY ${orderBy} ${order}
      `
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('Error fetching validators:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single validator
router.get('/validators/:address', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM validators WHERE address = $1',
      [req.params.address]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Validator not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error fetching validator:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get validator metrics
router.get('/validators/:address/metrics', async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT * FROM validator_metrics
      WHERE address = $1
      ORDER BY timestamp DESC
      LIMIT 100
      `,
      [req.params.address]
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('Error fetching validator metrics:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get chain statistics
router.get('/stats', async (req, res) => {
  try {
    const results = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM blocks'),
      db.query('SELECT COUNT(*) as count FROM transactions'),
      db.query('SELECT COUNT(*) as count FROM validators'),
      db.query('SELECT MAX(height) as height FROM blocks'),
      db.query('SELECT SUM(voting_power) as total_voting_power FROM validators'),
      db.query('SELECT AVG(uptime) as avg_uptime FROM validators')
    ]);

    res.json({
      success: true,
      data: {
        total_blocks: results[0].rows[0].count,
        total_transactions: results[1].rows[0].count,
        total_validators: results[2].rows[0].count,
        latest_block_height: results[3].rows[0].height,
        total_voting_power: results[4].rows[0].total_voting_power,
        average_uptime: results[5].rows[0].avg_uptime
      }
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search endpoint
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const results = {
      blocks: [],
      transactions: [],
      validators: []
    };

    // Search blocks by height
    if (!isNaN(query)) {
      const blockResult = await db.query(
        'SELECT * FROM blocks WHERE height = $1 LIMIT 5',
        [parseInt(query)]
      );
      results.blocks = blockResult.rows;
    }

    // Search transactions by hash
    const txResult = await db.query(
      'SELECT * FROM transactions WHERE hash ILIKE $1 LIMIT 5',
      [`%${query}%`]
    );
    results.transactions = txResult.rows;

    // Search validators by address or moniker
    const valResult = await db.query(
      `
      SELECT * FROM validators
      WHERE address ILIKE $1 OR moniker ILIKE $1
      LIMIT 5
      `,
      [`%${query}%`]
    );
    results.validators = valResult.rows;

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error searching:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get treasury snapshots
router.get('/treasury/snapshots', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);

    const result = await db.query(
      `
      SELECT * FROM treasury_snapshots
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('Error fetching treasury snapshots:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get staking events
router.get('/staking/events', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(
      `
      SELECT * FROM staking_events
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('Error fetching staking events:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
