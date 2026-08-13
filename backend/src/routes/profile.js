/**
 * Profile management routes
 * Handles user profile data, activity, and public profiles
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/user');

/**
 * GET /api/profile - Get current user's profile
 */
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = {
      authed: true,
      name: user.username || user.email,
      email: user.email,
      phone: user.phone || null,
      avatarInitial: (user.username || user.email).charAt(0).toUpperCase(),
      bio: user.bio || '',
      frozen: user.frozen || false,
      kycLevel: user.kycLevel || 0,
      address: user.walletAddress || null,
      createdAt: user.createdAt,
    };

    res.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/profile - Update user profile
 */
router.put('/', auth, async (req, res) => {
  try {
    const { bio, phone } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (bio !== undefined) user.bio = bio;
    if (phone !== undefined) user.phone = phone;
    
    await user.save();
    
    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * GET /api/profile/:address - Get public profile by wallet address
 */
router.get('/:address', async (req, res) => {
  try {
    const user = await User.findOne({ walletAddress: req.params.address }).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const publicProfile = {
      name: user.username || 'Anonymous',
      avatarInitial: (user.username || 'A').charAt(0).toUpperCase(),
      bio: user.bio || '',
      kycLevel: user.kycLevel || 0,
      createdAt: user.createdAt,
    };

    res.json(publicProfile);
  } catch (error) {
    console.error('Error fetching public profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * GET /api/profile/activity - Get user activity feed
 */
router.get('/activity/feed', auth, async (req, res) => {
  try {
    // Return empty activity for now - will be populated by transaction history
    const activity = [];
    res.json(activity);
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;
