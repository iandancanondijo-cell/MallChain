/**
 * The published transaction-type taxonomy.
 *
 * Handoff §3's complaint about `/api/tx/history` was that a chain transaction's
 * type was whatever the client guessed from the protobuf message's `@type`
 * string: each consumer matched on fragments ('…Stake…', '…Swap…') and landed
 * everything it did not recognise in a generic "Other" label, silently — so a
 * new module's transactions were invisible as a category the moment they were
 * added, and nobody could tell whether a row was genuinely unknown or just
 * unclassified here.
 *
 * This module is the one place that decides, from the chain's own proto
 * definitions, and it is published over `GET /api/tx/types` so a client can
 * render the same labels without embedding a copy of this table.
 *
 * Two fields travel with every row:
 *   `txType`  — one of the enum values below, or 'other'.
 *   `msgType` — the raw `/marketplace.mlcoin.v1.MsgStake`-style URL, always.
 * A row that reads 'other' therefore still says what it is, which is the part
 * that used to be unrecoverable.
 *
 * The enum values reuse the words the wallet UI already speaks
 * (send/receive/swap/stake/unstake/reward/penalty/claim/escrow) wherever one
 * of them already means the thing, because a taxonomy that invents synonyms is
 * a taxonomy nobody adopts.
 */

/**
 * `value` is the machine-readable enum, `label` what a person should see,
 * `msgTypes` the protobuf message URLs that amount to it. Order is the order
 * the catalogue is published in — grouped by what a customer would recognise,
 * not by module.
 */
const TX_TYPE_CATALOGUE = Object.freeze([
  {
    value: 'send',
    label: 'Sent',
    description: 'Mallcoin paid out of this wallet to another address.',
    msgTypes: ['/marketplace.mlcoin.v1.MsgTransferMallcoin', '/marketplace.mlcoin.v1.MsgTransferFrom'],
  },
  {
    value: 'receive',
    label: 'Received',
    description: 'Mallcoin credited into this wallet from another address.',
    msgTypes: [],
  },
  {
    value: 'purchase',
    label: 'Mallcoin purchase',
    description: 'Mallcoin bought with fiat or treasury liquidity (M-Pesa, faucet payouts).',
    msgTypes: ['/marketplace.mlcoin.v1.MsgBuyMallcoin'],
  },
  {
    value: 'sale',
    label: 'Mallcoin sale',
    description: 'Mallcoin sold back into the liquidity pool.',
    msgTypes: ['/marketplace.mlcoin.v1.MsgSellMallcoin'],
  },
  {
    value: 'mint',
    label: 'Mallcoin mint',
    description: 'New Mallcoin created by the mint authority — an operator action, not a customer one.',
    msgTypes: ['/marketplace.mlcoin.v1.MsgMintMallcoin'],
  },
  {
    value: 'burn',
    label: 'Mallcoin burn',
    description: 'Mallcoin removed from circulation by the burn authority.',
    // The URL backend/src/services/burnTxBuilder.js signs. proto/marketplace/
    // mlcoin/v1/tx.proto has no MsgBurn message yet, so on the current chain
    // this broadcast would be rejected — the row exists so that when it is
    // decoded from a node that does have the handler, it reads as a burn
    // instead of 'other'. The mismatch itself is tracked separately.
    msgTypes: ['/marketplace.mlcoin.v1.MsgBurn'],
  },
  {
    value: 'stake',
    label: 'Staked',
    description: 'Mallcoin or stake delegated to a validator.',
    msgTypes: ['/marketplace.mlcoin.v1.MsgStake', '/cosmos.staking.v1beta1.MsgDelegate'],
  },
  {
    value: 'unstake',
    label: 'Unstaked',
    description: 'Delegation withdrawn, subject to the unbonding period.',
    msgTypes: ['/marketplace.mlcoin.v1.MsgUnstake', '/cosmos.staking.v1beta1.MsgUndelegate'],
  },
  {
    value: 'redelegate',
    label: 'Re-delegated',
    description: 'Stake moved from one validator to another without unbonding.',
    msgTypes: ['/cosmos.staking.v1beta1.MsgBeginRedelegate'],
  },
  {
    value: 'reward',
    label: 'Reward',
    description: 'Staking rewards, Mallpoints awards or mined task rewards paid to this wallet.',
    msgTypes: [
      '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
      '/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission',
      '/marketplace.mallpoints.v1.MsgAwardPoints',
    ],
  },
  {
    value: 'convert',
    label: 'Mallpoints conversion',
    description: 'Mallpoints converted into Mallcoin during a conversion window.',
    msgTypes: ['/marketplace.mallpoints.v1.MsgConvertToMallcoin'],
  },
  {
    value: 'swap',
    label: 'Swap',
    description: 'One pool asset traded for another on the DEX.',
    msgTypes: ['/marketplace.dex.v1.MsgSwap'],
  },
  {
    value: 'liquidity',
    label: 'Liquidity',
    description: 'Pool position added to or removed from.',
    msgTypes: ['/marketplace.dex.v1.MsgAddLiquidity', '/marketplace.dex.v1.MsgRemoveLiquidity', '/marketplace.dex.v1.MsgCreatePool'],
  },
  {
    value: 'escrow',
    label: 'Escrow',
    description: 'Marketplace order funds held, released or refunded.',
    msgTypes: ['/marketplace.marketplace.v1.MsgCreateEscrow', '/marketplace.marketplace.v1.MsgReleaseFunds'],
  },
  {
    value: 'refund',
    label: 'Refund',
    description: 'An escrowed order returned to the buyer.',
    msgTypes: ['/marketplace.marketplace.v1.MsgRefundBuyer'],
  },
  {
    value: 'dispute',
    label: 'Dispute',
    description: 'A marketplace order opened for resolution.',
    msgTypes: ['/marketplace.marketplace.v1.MsgOpenDispute'],
  },
  {
    value: 'badge',
    label: 'Badge issued',
    description: 'A membership badge issued on chain.',
    msgTypes: ['/marketplace.badge.v1.MsgIssueBadge'],
  },
  {
    value: 'vault',
    label: 'Vault',
    description: 'A custody vault set up, confirmed or disabled.',
    msgTypes: ['/marketplace.vault.v1.MsgSetupVault', '/marketplace.vault.v1.MsgConfirmVault', '/marketplace.vault.v1.MsgDisableVault'],
  },
  {
    value: 'bridge',
    label: 'Cross-chain transfer',
    description: 'Assets bridged out or in through the cross-chain module.',
    msgTypes: ['/marketplace.crosschain.v1.MsgInitiateBridgeTransfer', '/marketplace.crosschain.v1.MsgCompleteBridgeTransfer'],
  },
  {
    value: 'attestation',
    label: 'Document registered',
    description: 'A document anchored on chain (Edu module).',
    msgTypes: ['/marketplace.edu.v1.MsgRegisterDocument'],
  },
  {
    value: 'contract',
    label: 'Contract call',
    description: 'A WASM code upload, instantiation or action executed through the chain or the bridge.',
    msgTypes: [
      '/marketplace.wasmbridge.v1.MsgExecuteAction',
      '/marketplace.wasm.types.v1.MsgExecuteContract',
      '/marketplace.wasm.types.v1.MsgInstantiateContract',
      '/marketplace.wasm.types.v1.MsgStoreCode',
    ],
  },
  {
    value: 'governance',
    label: 'Governance',
    description: 'A proposal submitted, deposited on or voted in.',
    msgTypes: [
      '/marketplace.governance.v1.MsgSubmitProposal',
      '/marketplace.governance.v1.MsgDeposit',
      '/marketplace.governance.v1.MsgVote',
      '/marketplace.governance.v1.MsgVoteWeighted',
      '/cosmos.gov.v1.MsgSubmitProposal',
      '/cosmos.gov.v1.MsgDeposit',
      '/cosmos.gov.v1.MsgVote',
      '/cosmos.gov.v1.MsgVoteWeighted',
      '/cosmos.gov.v1.MsgCancelProposal',
    ],
  },
  {
    value: 'penalty',
    label: 'Slashed',
    description: 'Stake slashed for validator misbehaviour.',
    msgTypes: ['/marketplace.governance.v1.MsgSlashValidator'],
  },
  {
    value: 'validator',
    label: 'Validator operations',
    description: 'A validator created, edited or unjailed — operator activity rather than a customer transaction.',
    msgTypes: [
      '/cosmos.staking.v1beta1.MsgCreateValidator',
      '/cosmos.staking.v1beta1.MsgEditValidator',
      '/cosmos.slashing.v1beta1.MsgUnjail',
    ],
  },
  {
    value: 'authorization',
    label: 'Authorization',
    description: 'A spend allowance granted to another address.',
    msgTypes: ['/marketplace.mlcoin.v1.MsgApprove'],
  },
  {
    value: 'params',
    label: 'Parameter change',
    description: 'A module’s on-chain parameters, or the Mallcoin price oracle rate, updated by its authority — never a customer transaction.',
    msgTypes: ['/marketplace.mlcoin.v1.MsgSetCurrencyRate'],
  },
  {
    value: 'other',
    label: 'Other on-chain activity',
    description: 'A message this build does not classify yet; `msgType` says what it is.',
    msgTypes: [],
  },
]);

/** 'other' is the fallback, and it is the only row with no URLs of its own. */
const OTHER = 'other';

/**
 * Exact message URL → enum value. Built once at load.
 *
 * 'receive' is in the catalogue for the UI's sake but is not classified here:
 * the same message is a send for one wallet and a receive for the other, which
 * only the querying address can tell — see classifyMessage's `direction`.
 */
const BY_MESSAGE = new Map();
for (const entry of TX_TYPE_CATALOGUE) {
  if (entry.value === 'receive') continue;
  for (const msgType of entry.msgTypes) BY_MESSAGE.set(msgType, entry.value);
}

const LABEL_BY_VALUE = new Map(TX_TYPE_CATALOGUE.map((entry) => [entry.value, entry.label]));

/**
 * Classify one protobuf message URL.
 *
 * @param msgType the raw `@type` string from the transaction body, may be ''
 * @param direction 'send' | 'receive' as derived from the queried address
 * @returns {{ txType: string, txTypeLabel: string, msgType: string }}
 *
 * A transfer the caller sent is 'send' and one they received is 'receive';
 * every other classification is direction-free, because a stake or a swap does
 * not change meaning depending on which side of the event log you read it from.
 */
function classifyMessage(msgType, direction) {
  const raw = typeof msgType === 'string' ? msgType : '';
  let txType = BY_MESSAGE.get(raw);

  if (!txType && raw) {
    // Suffix match is the documented leniency for the two cases worth having:
    // a versioned URL under a different package path (…/v1beta2/MsgStake) and
    // MsgUpdateParams, which every module defines for itself.
    const name = raw.split('.').pop() || '';
    if (name === 'MsgUpdateParams' || name.endsWith('MsgUpdateParams')) txType = 'params';
    else txType = BY_MESSAGE.get(name) || null;
    // cosmos.bank sends are deliberately NOT folded into 'send': this route
    // skips bank events altogether (see routes/tx.js), and if one ever reaches
    // here it is gas accounting, not a customer transfer.
  }

  if (!txType) {
    // Unknown message: keep the honest bucket, and let the row say what it was.
    txType = OTHER;
  } else if (txType === 'send' && direction === 'receive') {
    txType = 'receive';
  }

  return { txType, txTypeLabel: LABEL_BY_VALUE.get(txType) || 'Other on-chain activity', msgType: raw };
}

/** The catalogue as it is published over GET /api/tx/types. */
function txTypeCatalogue() {
  return TX_TYPE_CATALOGUE.map((entry) => ({ ...entry, msgTypes: [...entry.msgTypes] }));
}

module.exports = { TX_TYPE_CATALOGUE, classifyMessage, txTypeCatalogue };
