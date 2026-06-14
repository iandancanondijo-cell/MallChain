const express = require('express');
const router = express.Router();
const Invite = require('../models/Invite');
const axios = require('axios');

// Create invite (called when QR is generated)
router.post('/create', async (req, res) => {
  const { inviteId, inviter } = req.body;
  if (!inviteId || !inviter) return res.status(400).json({ error: 'Missing inviteId or inviter' });
  let invite = await Invite.findOne({ inviteId });
  if (!invite) invite = await Invite.create({ inviteId, inviter });
  return res.json({ ok: true, invite });
});

// Get invite status (for polling)
router.get('/status/:inviteId', async (req, res) => {
  const { inviteId } = req.params;
  const invite = await Invite.findOne({ inviteId });
  if (!invite) return res.json({ expired: true });
  if (invite.expired) return res.json({ expired: true });
  if (invite.claimed) return res.json({ claimed: true });
  return res.json({ active: true });
});

// Claim invite (called by invitee)
const rewardMallcoins = require('../utils/rewardMallcoins');
router.post('/claim', async (req, res) => {
  const { inviteId } = req.body;
  if (!inviteId) return res.status(400).json({ error: 'Missing inviteId' });
  const invite = await Invite.findOne({ inviteId });
  if (!invite || invite.expired || invite.claimed) return res.status(400).json({ error: 'Invite expired or already claimed' });
  // Mark as claimed and expire
  invite.claimed = true;
  invite.claimedAt = new Date();
  invite.expired = true;
  await invite.save();
  // Reward inviter (Mallcoins worth 15 KES)
  try {
    // Fetch market price (assume endpoint returns { price: number })
    const { data } = await axios.get('http://localhost:4000/api/market/price');
    const price = data && data.market_price && data.market_price.mid;
    if (price) {
      const mallcoins = Math.round(15 / price);
      // Prevent duplicate rewards: check if already rewarded
      if (!invite.rewardTx) {
        await rewardMallcoins(invite.inviter, mallcoins);
        invite.rewardTx = `rewarded-${Date.now()}`;
        await invite.save();
      }
    }
  } catch (e) { /* log error */ }
  return res.json({ ok: true });
});

module.exports = router;
