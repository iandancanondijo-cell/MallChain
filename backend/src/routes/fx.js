const express = require('express');
const router = express.Router();
const { getFxRate, getRatesMap } = require('../services/fxService');

const CODE_PATTERN = /^[A-Z]{3}$/;

// GET /api/fx/rate?base=USD&quote=KES
router.get('/rate', async (req, res) => {
  const base = String(req.query.base || 'USD').toUpperCase();
  const quote = String(req.query.quote || 'USD').toUpperCase();
  if (!CODE_PATTERN.test(base) || !CODE_PATTERN.test(quote)) {
    return res.status(400).json({ error: 'base and quote must be 3-letter currency codes' });
  }
  if (base === quote) {
    return res.json({ base, quote, rate: 1, date: null, fetchedAt: Date.now() });
  }
  try {
    const result = await getFxRate(base, quote);
    return res.json(result);
  } catch (err) {
    return res.status(503).json({ error: 'FX rate unavailable', details: err.message });
  }
});

// GET /api/fx/currencies — every currency code the provider actually supports.
router.get('/currencies', async (_req, res) => {
  try {
    const map = await getRatesMap('USD');
    return res.json({ base: map.base, currencies: Object.keys(map.rates).sort() });
  } catch (err) {
    return res.status(503).json({ error: 'FX rate unavailable', details: err.message });
  }
});

module.exports = router;
