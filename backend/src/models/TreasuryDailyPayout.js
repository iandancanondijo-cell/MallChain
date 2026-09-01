const mongoose = require('mongoose');

// One document per UTC calendar day — a running total of B2C (KES) payouts
// actually initiated, used to enforce MAX_PAYOUT_KES_PER_DAY
// (services/treasuryLimitsService.js). Deliberately NOT derived by summing
// B2CPayout on every check: that collection's pesaAmount wasn't even
// populated by its callers until this same change, and summing a growing
// collection on every payout attempt gets slower as history grows — an
// explicit running counter stays O(1) regardless of how much payout
// history exists.
const TreasuryDailyPayoutSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // 'YYYY-MM-DD', UTC
  totalKes: { type: Number, default: 0 },
});

module.exports = mongoose.models.TreasuryDailyPayout || mongoose.model('TreasuryDailyPayout', TreasuryDailyPayoutSchema);
