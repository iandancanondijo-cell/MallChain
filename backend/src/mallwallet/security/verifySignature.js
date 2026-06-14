const crypto = require('crypto')

function verifySignature(message, signature, publicKey) {
  const verify = crypto.createVerify('SHA256')
  verify.update(message)
  verify.end()

  return verify.verify(publicKey, signature, 'hex')
}

module.exports = verifySignature
