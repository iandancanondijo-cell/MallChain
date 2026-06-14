import React, {useState} from 'react'
import { SigningStargateClient } from '@cosmjs/stargate'
import { Registry } from '@cosmjs/proto-signing'
import { typeUrl as ML_TYPE_URL, encode as mlEncode } from '../proto/mlcoin/tx'
import { sendTransferMallcoin } from '../utils/wallet'

// RPC endpoint for local node
const RPC_ENDPOINT = 'http://127.0.0.1:26657'
const CHAIN_ID = 'testing-1'

export default function SignAndSend({wallet, privHex, pubHex, onSent}){
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSend(){
    setBusy(true)
    try{
      if(window.keplr){
        // Use Keplr if available (preferred UX)
        await window.keplr.enable(CHAIN_ID)
        const offlineSigner = window.getOfflineSigner ? window.getOfflineSigner(CHAIN_ID) : window.keplr.getOfflineSigner(CHAIN_ID)

        const accounts = await offlineSigner.getAccounts()
        if(!accounts || accounts.length === 0) throw new Error('no accounts from keplr')
        const fromAddress = accounts[0].address

        // Register mlcoin Msg type so SigningStargateClient can encode it
        const registry = new Registry()
        registry.register(ML_TYPE_URL, { encode: (msg) => mlEncode(msg) })

        const client = await SigningStargateClient.connectWithSigner(RPC_ENDPOINT, offlineSigner, { registry })

        // Prepare module msg
        const msg = {
          creator: fromAddress,
          amount: String(Number(amount)),
          to: to,
        }

        const fee = { amount: [{ denom: 'mlc', amount: '0' }], gas: '200000' }

        const result = await client.signAndBroadcast(fromAddress, [{ typeUrl: ML_TYPE_URL, value: msg }], fee)
        onSent && onSent(result)
        alert('tx broadcasted: ' + (result.transactionHash || result.txhash || JSON.stringify(result)))
      } else if(wallet && wallet.mnemonic){
        // Fallback: use unlocked mnemonic from in-memory wallet
        const mnemonic = wallet.mnemonic
        const rpc = RPC_ENDPOINT.replace('127.0.0.1', '127.0.0.1')
        const res = await sendTransferMallcoin({ mnemonic, rpcEndpoint: rpc, recipient: to, amount: String(Number(amount)), fee: { amount: [{ denom: 'mlc', amount: '0' }], gas: '200000' }, memo: '' })
        onSent && onSent(res)
        alert('tx broadcasted (fallback): ' + JSON.stringify(res))
      } else {
        return alert('No signer available: install Keplr or unlock a mnemonic in the wallet')
      }
    }catch(e){
      console.error(e)
      alert('send failed: ' + (e.message || e))
    }finally{setBusy(false)}
  }

  return (
    <div style={{border:'1px solid #e5e7eb',padding:12,borderRadius:8,maxWidth:420}}>
      <h3>Send Mallcoin (Keplr or Local mnemonic)</h3>
      <input placeholder='recipient address' value={to} onChange={e=>setTo(e.target.value)} style={{width:'100%'}} />
      <input placeholder='amount' value={amount} onChange={e=>setAmount(e.target.value)} style={{width:'100%',marginTop:8}} />
      <div style={{marginTop:8}}>
        <button onClick={handleSend} disabled={busy} className='menu-cta'>Sign & Send</button>
      </div>
    </div>
  )
}
