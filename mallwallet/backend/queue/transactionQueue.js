const { Queue } = require('bullmq')
const connection = require('./redis')

const transactionQueue = new Queue('transactions', {
  connection
})

module.exports = transactionQueue