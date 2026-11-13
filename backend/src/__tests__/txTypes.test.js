/**
 * The published tx_type taxonomy (services/txTypes.js), which /api/tx/history
 * writes into every row and /api/tx/types publishes to clients.
 *
 * What these cases protect is the difference between "this chain transaction
 * is unknown" and "this build has not learned its category yet" — the old
 * client-side guesswork collapsed both into a generic label, so a newly added
 * module's transactions disappeared as a category with nothing on the row to
 * say why.
 *
 * No mocks: this module reads nothing but its own table, which is the point —
 * classification must be a pure function of the message URL for a client to be
 * able to trust it.
 */

const { TX_TYPE_CATALOGUE, classifyMessage, txTypeCatalogue } = require('../services/txTypes');

const values = TX_TYPE_CATALOGUE.map((entry) => entry.value);

describe('the catalogue itself', () => {
  test('every entry has the fields a client renders, and the enum is unique', () => {
    for (const entry of TX_TYPE_CATALOGUE) {
      expect(typeof entry.value).toBe('string');
      expect(entry.label).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(Array.isArray(entry.msgTypes)).toBe(true);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  test("'other' is the last bucket and the only kind with no message of its own", () => {
    expect(values[values.length - 1]).toBe('other');
    const empty = TX_TYPE_CATALOGUE.filter((e) => e.msgTypes.length === 0).map((e) => e.value);
    // 'receive' is exempt for the reason in classifyMessage: it is a direction,
    // not a message, so no URL can decide it.
    expect(empty.sort()).toEqual(['other', 'receive']);
  });

  test('no message URL belongs to two categories', () => {
    const owners = new Map();
    for (const entry of TX_TYPE_CATALOGUE) {
      for (const msgType of entry.msgTypes) {
        expect(owners.has(msgType)).toBe(false); // else BY_MESSAGE silently last-wins
        owners.set(msgType, entry.value);
      }
    }
  });

  test('the published copy is a snapshot the caller cannot mutate into the table', () => {
    const first = txTypeCatalogue()[0];
    first.value = 'tampered';
    first.msgTypes.push('/tampered');
    expect(txTypeCatalogue()[0].value).not.toBe('tampered');
    expect(values[0]).toBe('send');
  });
});

describe('classifyMessage', () => {
  test('a known message gets its enum value, label and raw URL', () => {
    expect(classifyMessage('/marketplace.dex.v1.MsgSwap', 'send')).toEqual({
      txType: 'swap',
      txTypeLabel: 'Swap',
      msgType: '/marketplace.dex.v1.MsgSwap',
    });
  });

  test.each([
    ['/marketplace.mlcoin.v1.MsgBuyMallcoin', 'purchase'],
    ['/marketplace.mlcoin.v1.MsgSellMallcoin', 'sale'],
    ['/marketplace.mlcoin.v1.MsgMintMallcoin', 'mint'],
    ['/marketplace.mlcoin.v1.MsgStake', 'stake'],
    ['/cosmos.staking.v1beta1.MsgUndelegate', 'unstake'],
    ['/marketplace.mallpoints.v1.MsgConvertToMallcoin', 'convert'],
    ['/marketplace.marketplace.v1.MsgRefundBuyer', 'refund'],
    ['/marketplace.badge.v1.MsgIssueBadge', 'badge'],
    ['/marketplace.governance.v1.MsgVote', 'governance'],
    ['/marketplace.mlcoin.v1.MsgSetCurrencyRate', 'params'],
  ])('%s is %s whatever direction it is read from', (msgType, expected) => {
    expect(classifyMessage(msgType, 'send').txType).toBe(expected);
    expect(classifyMessage(msgType, 'receive').txType).toBe(expected);
  });

  test('a transfer is the one category that depends on which wallet is asking', () => {
    const url = '/marketplace.mlcoin.v1.MsgTransferMallcoin';
    expect(classifyMessage(url, 'send').txType).toBe('send');
    expect(classifyMessage(url, 'receive').txType).toBe('receive');
    expect(classifyMessage('/marketplace.mlcoin.v1.MsgTransferFrom', 'receive').txType).toBe('receive');
  });

  test('an unclassified message is still identifiable, because the URL travels with it', () => {
    // The complaint this replaces: a category the client had not heard of
    // rendered as "Other" with nothing to say what it actually was.
    expect(classifyMessage('/marketplace.whatever.v2.MsgNewThing', 'send')).toEqual({
      txType: 'other',
      txTypeLabel: 'Other on-chain activity',
      msgType: '/marketplace.whatever.v2.MsgNewThing',
    });
  });

  test.each([
    ['', 'other'],
    [undefined, 'other'],
    [null, 'other'],
    [42, 'other'],
  ])('a missing or non-string @type (%p) is %s, not a crash', (msgType, expected) => {
    expect(classifyMessage(msgType, 'send').txType).toBe(expected);
    expect(classifyMessage(msgType, 'send').msgType).toBe('');
  });

  test('MsgUpdateParams is a parameter change from any module and any version path', () => {
    // Every module defines its own, so the table cannot enumerate them; the
    // documented leniency is the message name, including a bumped package.
    for (const url of [
      '/cosmos.staking.v1beta1.MsgUpdateParams',
      '/marketplace.mallcoin.v1.MsgUpdateParams',
      '/marketplace.dex.v1.MsgUpdateParams',
    ]) {
      expect(classifyMessage(url, 'send').txType).toBe('params');
    }
  });

  test('a bank send is not folded into a customer transfer', () => {
    // routes/tx.js skips bank events before they reach here, and if one ever
    // does it is gas accounting (the faucet's stake top-up), not Mallcoin.
    expect(classifyMessage('/cosmos.bank.v1beta1.MsgSend', 'receive').txType).toBe('other');
  });

  test('every URL the backend actually signs is classified, or deliberately left as other', () => {
    // The catalogue is built from this repo's protos; this keeps it honest as
    // the chain grows — a new message must either join a category or be named
    // here as intentionally unclassified.
    const signed = [
      '/marketplace.mlcoin.v1.MsgTransferMallcoin',
      '/marketplace.mlcoin.v1.MsgBuyMallcoin',
      '/marketplace.mlcoin.v1.MsgSellMallcoin',
      '/marketplace.mlcoin.v1.MsgMintMallcoin',
      '/marketplace.mlcoin.v1.MsgStake',
      '/marketplace.mlcoin.v1.MsgUnstake',
      '/marketplace.mlcoin.v1.MsgApprove',
      '/marketplace.mlcoin.v1.MsgTransferFrom',
      '/marketplace.mlcoin.v1.MsgSetCurrencyRate',
      '/marketplace.mlcoin.v1.MsgBurn',
      '/marketplace.mallpoints.v1.MsgConvertToMallcoin',
      '/marketplace.mallpoints.v1.MsgAwardPoints',
      '/marketplace.badge.v1.MsgIssueBadge',
      '/marketplace.vault.v1.MsgSetupVault',
      '/marketplace.vault.v1.MsgConfirmVault',
      '/marketplace.vault.v1.MsgDisableVault',
      '/marketplace.crosschain.v1.MsgInitiateBridgeTransfer',
      '/marketplace.crosschain.v1.MsgCompleteBridgeTransfer',
      '/marketplace.edu.v1.MsgRegisterDocument',
      '/marketplace.marketplace.v1.MsgCreateEscrow',
      '/marketplace.marketplace.v1.MsgReleaseFunds',
      '/marketplace.marketplace.v1.MsgRefundBuyer',
      '/marketplace.marketplace.v1.MsgOpenDispute',
      '/marketplace.governance.v1.MsgSubmitProposal',
      '/marketplace.governance.v1.MsgDeposit',
      '/marketplace.governance.v1.MsgVote',
      '/marketplace.governance.v1.MsgVoteWeighted',
      '/marketplace.governance.v1.MsgSlashValidator',
      '/marketplace.dex.v1.MsgSwap',
      '/marketplace.dex.v1.MsgAddLiquidity',
      '/marketplace.dex.v1.MsgRemoveLiquidity',
      '/marketplace.dex.v1.MsgCreatePool',
      '/marketplace.wasmbridge.v1.MsgExecuteAction',
      '/marketplace.wasm.types.v1.MsgExecuteContract',
      '/marketplace.wasm.types.v1.MsgInstantiateContract',
      '/marketplace.wasm.types.v1.MsgStoreCode',
    ];
    for (const url of signed) {
      expect(classifyMessage(url, 'send').txType).not.toBe('other');
    }
  });
});
