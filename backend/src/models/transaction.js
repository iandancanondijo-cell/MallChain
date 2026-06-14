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


module.exports = mongoose.model('Transaction', TransactionSchema)
