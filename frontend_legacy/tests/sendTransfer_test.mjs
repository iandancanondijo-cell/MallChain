import { sendTransferMallcoin } from '../src/utils/wallet.js'

// Provide mocks for CosmJS to avoid network calls during unit tests
const mocks = {
  SigningStargateClient: class {
    static async connectWithSigner(rpcEndpoint, signer, opts){
      return new this()
    }
    async signAndBroadcast(sender, msgs, fee, memo){
      return { code: 0, transactionHash: '0xmockedtx' }
    }
  },
  DirectSecp256k1HdWallet: class {
    static async fromMnemonic(mnemonic, opts){
      return new this(mnemonic, opts)
    }
    constructor(mnemonic, opts){ this.mnemonic = mnemonic; this.prefix = (opts && opts.prefix) || 'mall' }
    async getAccounts(){ return [{ address: (this.prefix||'mall') + '1testaddress000000000000000000000000', algo: 'secp256k1', pubkey: new Uint8Array([1,2,3]) }] }
  },
  Registry: class { constructor(e){ this._e = e } register(){} },
  proto: { typeUrl: '/marketplace.mlcoin.v1.MsgTransferMallcoin', encode: (m)=> new Uint8Array([1,2,3]) }
}

try{
  const res = await sendTransferMallcoin({
    mnemonic: 'test test test test test test test test test test test ball',
    rpcEndpoint: 'http://localhost:26657',
    recipient: 'mall1recipient0000000000000000000000000000000',
    amount: '1000',
    fee: { amount: [{ denom: 'mlc', amount: '0' }], gas: '200000' },
    memo: 'unit-test',
    mocks
  })
  console.log('sendTransferMallcoin test result:', res)
  process.exit(0)
}catch(e){
  console.error('sendTransferMallcoin test failed:', e)
  process.exit(2)
}
