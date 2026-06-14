/* eslint-env node */
/* global require, module */
const mongoose = require('mongoose');

// Define burn rates and treasury policies
const BurnPolicySchema = new mongoose.Schema({
  activity: {
    type: String,
    enum: ['marketplace_purchase', 'wallet_transfer', 'cash_out', 'validator_penalty', 'lost_recovery'],
    required: true,
    unique: true,
  },
  burnPercentage: { type: Number, required: true, min: 0, max: 100 },
  description: { type: String },
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Dynamic burn thresholds based on circulating supply
const DynamicBurnThresholdSchema = new mongoose.Schema({
  activity: {
    type: String,
    enum: ['cash_out', 'marketplace_purchase', 'wallet_transfer'],
    required: true,
  },
  supplyThreshold: { type: Number, required: true }, // e.g., 500000000
  burnPercentage: { type: Number, required: true, min: 0, max: 100 },
  order: { type: Number, default: 0 }, // for sorting: highest supply first
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = {
  BurnPolicy: mongoose.model('BurnPolicy', BurnPolicySchema),
  DynamicBurnThreshold: mongoose.model('DynamicBurnThreshold', DynamicBurnThresholdSchema),
};
