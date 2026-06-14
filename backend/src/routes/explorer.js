const router = require('express').Router();
const explorer = require('../services/explorerService');

router.get('/latest', async (_req, res) => {
  try {
    const data = await explorer.getLatest();
    res.json(data);
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
});

router.get('/block/:height', async (req, res) => {
  try {
    const data = await explorer.getBlock(req.params.height);
    res.json(data);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      error: error.message,
      details: error.details,
    });
  }
});

router.get('/tx/:hash', async (req, res) => {
  try {
    const data = await explorer.getTransaction(req.params.hash);
    res.json(data);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      error: error.message,
      details: error.details,
    });
  }
});

module.exports = router;
