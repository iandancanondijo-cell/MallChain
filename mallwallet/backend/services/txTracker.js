const txStore = new Map()

function setTx(hash, status) {
  txStore.set(hash, {
    status,
    updatedAt: Date.now()
  })
}

function getTx(hash) {
  return txStore.get(hash)
}

module.exports = {
  setTx,
  getTx
}
app.get('/tx/:hash', (req, res) => {
  const tx = getTx(req.params.hash)

  if (!tx) {
    return res.status(404).json({
      error: 'Transaction not found'
    })
  }

  res.json(tx)
})