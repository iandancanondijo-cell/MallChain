const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const Joi = require('joi')
const PendingPayment = require('../models/PendingPayment')
const AuditLog = require('../models/AuditLog')
const { createLimiter } = require('../middleware/rateLimiter')
const limiter = createLimiter({ windowMs: 60*1000, max: 60 })

// Validation schemas
const initiatePaymentSchema = Joi.object({
  method: Joi.string().valid('mpesa', 'card', 'bank_transfer').required(),
  phone: Joi.string().pattern(/^[0-9+]{10,15}$/).when('method', { is: 'mpesa', then: Joi.required(), otherwise: Joi.optional() }),
  amountFiat: Joi.number().positive().required(),
  amountMallcoin: Joi.number().positive().required(),
  metadata: Joi.object().optional()
})

const confirmPaymentSchema = Joi.object({
  providerRef: Joi.string().required(),
  status: Joi.string().valid('pending', 'success', 'failed', 'cancelled').required()
})

const statusQuerySchema = Joi.object({
  providerRef: Joi.string().required()
})

// POST /api/payment/mpesa/initiate
// Expects { method, phone, amountFiat, amountMallcoin }
router.post('/mpesa/initiate', limiter, async (req, res) => {
  try {
    // Validate input
    const { error, value } = initiatePaymentSchema.validate(req.body)
    if (error) {
      return res.status(400).json({ error: error.details[0].message })
    }
    
    const { method, phone, amountFiat, amountMallcoin, metadata } = value
    // Use cryptographically random reference — Math.random() is not suitable for payment IDs
    const providerRef = `mpesa-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
    const doc = await PendingPayment.create({ providerRef, method, phone, amountFiat, amountMallcoin, metadata, status: 'pending' })
    await AuditLog.create({ action: 'payment_initiate', actor: phone || 'unknown', data: { providerRef, amountFiat, amountMallcoin } })
    return res.json({ status: 'pending', providerRef })
  } catch (e) {
    console.error('payment initiate error', e)
    return res.status(500).json({ error: 'initiate failed' })
  }
})

// POST /api/payment/mpesa/confirm
// Provider webhook can call this. If PAYMENT_WEBHOOK_SECRET is set the request body
// signature is verified using HMAC-SHA256 against header 'x-signature'.
router.post('/mpesa/confirm', limiter, async (req, res) => {
  try {
    // Validate input
    const { error, value } = confirmPaymentSchema.validate(req.body)
    if (error) {
      return res.status(400).json({ error: error.details[0].message })
    }
    
    const secret = process.env.PAYMENT_WEBHOOK_SECRET || null
    if (secret) {
      const sig = req.get('x-signature') || req.get('x-hub-signature-256') || ''
      const bodyRaw = JSON.stringify(req.body || {})
      const expected = crypto.createHmac('sha256', secret).update(bodyRaw).digest('hex')
      const provided = String(sig).replace(/^sha256=/, '')
      if (!provided || provided.length !== expected.length) {
        return res.status(401).json({ error: 'invalid signature' })
      }
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(provided, 'utf8')
      if (!crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ error: 'invalid signature' })
      }
    }

    const { providerRef, status } = value
    const doc = await PendingPayment.findOne({ providerRef })
    if (!doc) return res.status(404).json({ error: 'not found' })
    doc.status = status || 'success'
    doc.confirmedAt = new Date()
    await doc.save()
    await AuditLog.create({ action: 'payment_confirm', actor: doc.phone || 'provider', data: { providerRef, status: doc.status } })
    return res.json({ ok: true, providerRef, status: doc.status })
  } catch (e) {
    console.error('payment confirm error', e)
    return res.status(500).json({ error: 'confirm failed' })
  }
})

// GET /api/payment/mpesa/status?providerRef=...
router.get('/mpesa/status', limiter, async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = statusQuerySchema.validate(req.query)
    if (error) {
      return res.status(400).json({ error: error.details[0].message })
    }
    
    const { providerRef } = value
    const doc = await PendingPayment.findOne({ providerRef })
    if (!doc) return res.status(404).json({ error: 'not found' })
    return res.json({ providerRef, status: doc.status, info: doc })
  } catch (e) {
    console.error('payment status error', e)
    return res.status(500).json({ error: 'status failed' })
  }
})

module.exports = router
