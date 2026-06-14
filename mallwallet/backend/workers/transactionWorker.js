const { Worker } = require('bullmq')
const connection = require('../queue/redis')

const worker = new Worker(
  'transactions',
  async job => {
    const { from, to, amount } = job.data

    console.log('Processing tx:', from, to, amount)

    // TODO:
    // Broadcast signed transaction
    // Save tx hash
    // Update DB
  },
  { connection }
)

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed`, err)
})