const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const MallPointAccount = require('../models/MallPointAccount')
const User = require('../models/user')
const Campaign = require('../models/Campaign')
const WalletTransaction = require('../models/WalletTransaction')
const auth = require('../middleware/auth')
const logger = require('../utils/logger')
const { syncMallPointAccount } = require('../services/mallpointsService')

// Route-level auth wrapper: the shared JWT middleware only attaches req.user,
// while every route below reads req.userId (string form). Mirrors mines.js's
// minesAuth — without this, User.findById(req.userId) resolved undefined and
// every protected creator-space route returned 404 "user not found".
function creatorAuth(req, res, next) {
  auth(req, res, () => {
    req.userId = req.user?._id?.toString()
    next()
  })
}

// Creator Space - Content Creation Activities
// Separate from Mines (which is for mining/social tasks)
// Creators spend Mallpoints to create content campaigns

// POST /api/creator-space/campaigns/create - create a content campaign
router.post('/campaigns/create', creatorAuth, async (req, res) => {
  const session = await mongoose.startSession()

  try {
    const { platform, content_type, title, description, content_link, budget_mlpts } = req.body || {}

    if (!platform || !content_type || !title || !budget_mlpts) {
      return res.status(400).json({ error: 'platform, content_type, title, and budget_mlpts are required' })
    }

    const budget = Number(budget_mlpts)
    if (!Number.isFinite(budget) || budget <= 0) {
      return res.status(400).json({ error: 'budget_mlpts must be a positive number' })
    }

    // Get user's Mallpoints balance
    const user = await User.findById(req.userId)
    if (!user) {
      return res.status(404).json({ error: 'user not found' })
    }

    if (user.mlpts_balance < budget) {
      return res.status(400).json({
        error: 'insufficient Mallpoints balance',
        required: budget,
        available: user.mlpts_balance,
      })
    }

    // Deduct Mallpoints and create campaign atomically
    await session.withTransaction(async () => {
      // Deduct Mallpoints
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.userId, mlpts_balance: { $gte: budget } },
        { $inc: { mlpts_balance: -budget } },
        { session, new: true }
      )

      if (!updatedUser) {
        throw new Error('insufficient Mallpoints balance')
      }

      // Create campaign
      const campaign = await Campaign.create([{
        creator_id: req.userId,
        platform,
        content_type,
        title,
        description: description || '',
        content_link: content_link || '',
        budget_mlpts: budget,
        budget_remaining: budget,
        status: 'active',
        created_at: new Date(),
      }], { session })

      // Log transaction
      await WalletTransaction.create([{
        user_id: req.userId,
        type: 'debit',
        amount: budget,
        currency: 'MLPTS',
        description: `Campaign creation - ${platform} ${content_type}`,
        campaign_id: campaign[0]._id,
      }], { session })

      // GATE 61: Synchronize campaign debit to MallPointAccount for conversion consistency
      await syncMallPointAccount(updatedUser.walletAddress, -budget, session, {
        userId: req.userId,
        flow: 'creator_space_campaign_create',
      })

      return res.json({
        ok: true,
        campaign: campaign[0],
        newBalance: updatedUser.mlpts_balance,
      })
    })
  } catch (e) {
    logger.error('creator-space', 'campaign creation error', e)
    if (e.message === 'insufficient Mallpoints balance') {
      return res.status(400).json({ error: e.message })
    }
    res.status(500).json({ error: String(e) })
  } finally {
    await session.endSession()
  }
})

// GET /api/creator-space/campaigns - get user's campaigns
router.get('/campaigns', creatorAuth, async (req, res) => {
  try {
    const campaigns = await Campaign.find({ creator_id: req.userId })
      .sort({ created_at: -1 })
      .lean()

    return res.json({ ok: true, campaigns })
  } catch (e) {
    logger.error('creator-space', 'get campaigns error', e)
    res.status(500).json({ error: String(e) })
  }
})

// GET /api/creator-space/balance - get user's Mallpoints balance
router.get('/balance', creatorAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('mlpts_balance walletAddress')
    if (!user) {
      return res.status(404).json({ error: 'user not found' })
    }

    return res.json({
      ok: true,
      mlpts_balance: user.mlpts_balance || 0,
      walletAddress: user.walletAddress,
    })
  } catch (e) {
    logger.error('creator-space', 'balance error', e)
    res.status(500).json({ error: String(e) })
  }
})

// GET /api/creator-space/platforms - get supported platforms and content types
router.get('/platforms', (req, res) => {
  return res.json({
    ok: true,
    platforms: {
      tiktok: {
        label: 'TikTok',
        content_types: ['video', 'duet', 'stitch'],
        description: 'Create TikTok content campaigns',
      },
      instagram: {
        label: 'Instagram',
        content_types: ['post', 'reel', 'story'],
        description: 'Create Instagram content campaigns',
      },
      facebook: {
        label: 'Facebook',
        content_types: ['post', 'video', 'story'],
        description: 'Create Facebook content campaigns',
      },
      youtube: {
        label: 'YouTube',
        content_types: ['video', 'short'],
        description: 'Create YouTube content campaigns',
      },
      twitter: {
        label: 'Twitter/X',
        content_types: ['tweet', 'thread', 'video'],
        description: 'Create Twitter/X content campaigns',
      },
    },
  })
})

module.exports = router
