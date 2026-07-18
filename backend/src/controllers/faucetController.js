const { creditMlcns, getFaucetStatus, fundGas } = require('../services/faucetService');

exports.status = async (_req, res) => {
  try {
    const status = await getFaucetStatus();
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.requestMlcns = async (req, res) => {
  try {
    const { address, amountMlcns } = req.body || {};
    if (!address) {
      return res.status(400).json({ error: 'address is required' });
    }
    const result = await creditMlcns(address, amountMlcns);
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message,
      log: err.rawLog,
    });
  }
};

exports.fundGas = async (req, res) => {
  try {
    const { address } = req.body || {};
    if (!address) {
      return res.status(400).json({ error: 'address is required' });
    }
    const result = await fundGas(address);
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
};
