/* eslint-env node */
/* global require, module */
const { getEffectiveBurnRate, calculateBurnSplit } = require('./burnCalculator');
const { getCirculatingSupply } = require('./supplyService');
const { burnCoinsOnChain } = require('./burnTxBuilder');
const TreasuryLedger = require('../models/TreasuryLedger');
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

// Execute complete burn workflow for a sale
async function executeSellBurnWorkflow({ saleId, amount, txHash, operatorMnemonic, sale }) {
  let burnAmount = 0;
  let treasuryAmount = amount;
  let burnTxHash = null;
  let appliedBurnPercentage = 30; // default

  try {
    // Fetch current supply and calculate burn
    const currentSupply = await getCirculatingSupply();
    appliedBurnPercentage = await getEffectiveBurnRate('cash_out', currentSupply);

    const { burnAmount: calculated, treasuryAmount: treasury, burnPercentage } = calculateBurnSplit(
      Math.floor(amount),
      appliedBurnPercentage
    );

    burnAmount = calculated;
    treasuryAmount = treasury;
    appliedBurnPercentage = burnPercentage;

    console.log(`[Sell] Burn calc: total=${amount}, burn=${burnAmount} (${burnPercentage}%), treasury=${treasuryAmount}`);

    // Execute on-chain burn if amount > 0
    if (burnAmount > 0 && operatorMnemonic) {
      try {
        const burnResult = await burnCoinsOnChain({
          mnemonic: operatorMnemonic,
          burnAmount,
          memo: `Mallcoin sale burn ${saleId}`,
        });

        burnTxHash = burnResult.txHash;
        if (sale) {
          sale.burnTxHash = burnTxHash;
        }
        console.log(`[Sell] Burn executed: ${burnTxHash}`);
      } catch (burnErr) {
        console.error('[Sell] Burn transaction failed:', burnErr.message || burnErr);
      }
    }
  } catch (burnCalcErr) {
    console.warn('[Sell] Burn calculation failed, using default:', burnCalcErr.message || burnCalcErr);
    const { burnAmount: calculated, treasuryAmount: treasury } = calculateBurnSplit(
      Math.floor(amount),
      appliedBurnPercentage
    );
    burnAmount = calculated;
    treasuryAmount = treasury;
  }

  // Update sale record with burn info
  if (sale) {
    sale.burnAmount = burnAmount;
    sale.treasuryAmount = treasuryAmount;
    sale.burnPercentage = appliedBurnPercentage;
  }

  // Record burn event in treasury ledger if the on-chain burn executed
  if (burnAmount > 0 && burnTxHash) {
    try {
      await TreasuryLedger.create({
        txHash: burnTxHash,
        activity: 'burn',
        amount: burnAmount,
        direction: 'burn',
        relatedSaleId: saleId,
        description: `Burned ${burnAmount} MLCNS from sale ${saleId} at ${appliedBurnPercentage}% burn rate`,
      });
    } catch (burnLedgerErr) {
      console.warn('[Sell] Failed to record burn ledger:', burnLedgerErr.message);
    }
  }

  // Record treasury inflow in ledger
  try {
    await TreasuryLedger.create({
      txHash: sale?.txHash || burnTxHash || null,
      activity: 'inflow_cash_out',
      amount: treasuryAmount,
      direction: 'inflow',
      relatedSaleId: saleId,
      description: `Treasury inflow from sale: ${treasuryAmount} MLCNS (${appliedBurnPercentage}% burned)`,
    });
  } catch (ledgerErr) {
    console.warn('[Sell] Failed to record treasury ledger:', ledgerErr.message);
  }

  return {
    burnAmount,
    treasuryAmount,
    burnPercentage: appliedBurnPercentage,
    burnTxHash,
  };
}

module.exports = {
  executeSellBurnWorkflow,
};
