/**
 * Referrals/Affiliate system routes
 * Handles referral codes, tracking, and rewards
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/user');

/**
 * GET /api/referrals - Get user's referral stats
 */
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const referralData = {
      code: user.referralCode || `MALL-${user.username || user._id}`.toUpperCase().substring(0, 15),
      earned: user.referralEarnings || 0,
      count: user.referralCount || 0,
      claimed: user.referralClaimed || 0,
    };

    res.json(referralData);
  } catch (error) {
    console.error('Error fetching referral data:', error);
    res.status(500).json({ error: 'Failed to fetch referral data' });
  }
});

/**
 * GET /api/referrals/code - Get user's referral code
 */
router.get('/code', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const code = user.referralCode || `MALL-${user.username || user._id}`.toUpperCase().substring(0, 15);
    
    res.json({ code });
  } catch (error) {
    console.error('Error fetching referral code:', error);
    res.status(500).json({ error: 'Failed to fetch referral code' });
  }
});

/**
 * POST /api/referrals/claim - Claim referral rewards
 */
router.post('/claim', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const unclaimed = (user.referralEarnings || 0) - (user.referralClaimed || 0);
    
    if (unclaimed <= 0) {
      return res.status(400).json({ error: 'No unclaimed rewards' });
    }

    user.referralClaimed = user.referralEarnings;
    await user.save();

    res.json({ 
      success: true, 
      claimed: unclaimed,
      message: `Claimed ${unclaimed} MALL` 
    });
  } catch (error) {
    console.error('Error claiming referral rewards:', error);
    res.status(500).json({ error: 'Failed to claim rewards' });
  }
});

/**
 * GET /api/referrals/history - Get referral history
 */
router.get('/history', auth, async (req, res) => {
  try {
    // Return empty history for now - will be populated when referral tracking is implemented
    const history = [];
    res.json(history);
  } catch (error) {
    console.error('Error fetching referral history:', error);
    res.status(500).json({ error: 'Failed to fetch referral history' });
  }
});

module.exports = router;
