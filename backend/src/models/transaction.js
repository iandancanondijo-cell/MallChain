const mongoose = require('mongoose')


const TransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    from: {
      type: String,
      required: true
    },

    to: {
      type: String,
      required: true
    },

    amount: {
      type: String,
      required: true
    },

    denom: {
      type: String,
      default: 'mln'
    },

    txHash: {
      type: String,
      default: null
    },

    blockHeight: {
      type: Number,
      default: null
    },

    status: {
      type: String,
      enum: [
        'queued',
        'broadcasting',
        'pending',
        'confirmed',
        'failed'
      ],
      default: 'queued'
    },

    error: {
      type: String,
      default: null
    },

    retryCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
)

// Add indexes for common query patterns
TransactionSchema.index({ from: 1 })
TransactionSchema.index({ to: 1 })
TransactionSchema.index({ txHash: 1 }, { unique: true, sparse: true })
TransactionSchema.index({ status: 1 })
TransactionSchema.index({ userId: 1 })
TransactionSchema.index({ createdAt: -1 })
TransactionSchema.index({ from: 1, status: 1 })
TransactionSchema.index({ to: 1, status: 1 })
TransactionSchema.index({ blockHeight: 1 })


module.exports = mongoose.model('Transaction', TransactionSchema)
