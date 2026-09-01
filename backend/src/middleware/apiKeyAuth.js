const crypto = require('crypto')
const logger = require('../utils/logger')

function buildKeyValidator(kind, envVarNames, options = {}) {
  const { allowAdminFallback = false } = options
  const rawAdmin = process.env.ADMIN_API_KEY || ''
  const adminKeys = rawAdmin.split(',').map(k => k.trim()).filter(Boolean)

  let scopeKeys = []
  for (const envVarName of envVarNames) {
    const raw = process.env[envVarName] || ''
    const split = raw.split(',').map(k => k.trim()).filter(Boolean)
    scopeKeys = scopeKeys.concat(split)
  }

  return function apiKeyAuthScope(req, res, next) {
    const got = req.get('x-api-key') || ''
    if (!got) return res.status(401).json({ error: `missing ${kind} api key` })

    const gotBuf = Buffer.from(got)

    let matchedIndex = scopeKeys.findIndex(key => {
      const keyBuf = Buffer.from(key)
      return gotBuf.length === keyBuf.length && crypto.timingSafeEqual(gotBuf, keyBuf)
    })
    let matchedKind = kind
    let adminFallbackUsed = false

    if (matchedIndex === -1 && allowAdminFallback) {
      matchedIndex = adminKeys.findIndex(key => {
        const keyBuf = Buffer.from(key)
        return gotBuf.length === keyBuf.length && crypto.timingSafeEqual(gotBuf, keyBuf)
      })
      if (matchedIndex !== -1) {
        matchedKind = 'admin'
        adminFallbackUsed = true
      }
    }

    if (matchedIndex === -1) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    logger.info('apiKeyAuth', `${matchedKind} API key used`, {
      scope: kind,
      keyPosition: matchedIndex + 1,
      route: req.path,
      adminFallbackUsed,
    })
    next()
  }
}

const adminApiKeyAuth = buildKeyValidator('admin', ['ADMIN_API_KEY'])
const metricsApiKeyAuth = buildKeyValidator('metrics', ['MONITORING_API_KEY'], { allowAdminFallback: true })

adminApiKeyAuth.admin = adminApiKeyAuth
adminApiKeyAuth.metrics = metricsApiKeyAuth
adminApiKeyAuth.buildKeyValidator = buildKeyValidator

module.exports = adminApiKeyAuth
