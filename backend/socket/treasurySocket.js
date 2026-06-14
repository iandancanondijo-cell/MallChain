module.exports = io => {
  setInterval(async () => {
    const treasury = await getTreasuryMetrics()

    io.emit('treasury_update', treasury)
  }, 5000)
}