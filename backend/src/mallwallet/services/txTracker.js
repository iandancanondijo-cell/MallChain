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
