const verifySignature = require('../mallwallet/security/verifySignature')

module.exports = (req, res, next) => {
  const { message, signature, publicKey } = req.body

  if (!message || !signature || !publicKey) {
    return res.status(401).json({
      error: 'Missing signature data'
    })
  }

  const valid = verifySignature(
    message,
    signature,
    publicKey
  )

  if (!valid) {
    return res.status(401).json({
      error: 'Invalid signature'
    })
  }

  next()
}
