async function simulateTx(tx) {
  return {
    gasEstimate: 200000,
    success: true
  }
}

module.exports = simulateTx