import React, {useState} from 'react'
import { decryptPrivateKey, pubFromPrivHex, decryptKeystore, deriveCosmosAccountFromMnemonic } from '../utils/wallet'

export default function UnlockWallet({onUnlock}){
  const [cipherJson, setCipherJson] = useState('')
  const [password, setPassword] = useState('')

  async function handleUnlock(){
    try{
      const blob = JSON.parse(cipherJson)
      // detect keystore format with crypto object
      if(blob.crypto){
        try{
          const mnemonic = await decryptKeystore(blob, password)
          const acct = await deriveCosmosAccountFromMnemonic(mnemonic)
          onUnlock && onUnlock({ mnemonic, account: acct })
          return
        }catch(e){
          console.error('keystore unlock failed, falling back', e)
        }
      }
      // fallback: old export format (ciphertext of privHex)
      const privHex = await decryptPrivateKey(blob.ciphertext, blob.iv, blob.salt, password)
      const pubHex = await pubFromPrivHex(privHex)
      onUnlock && onUnlock({ priv: privHex, pub: pubHex })
    }catch(e){
      console.error(e)
      alert('unlock failed')
    }
  }

  return (
    <div id="unlock-wallet-panel" style={{border:'1px solid #e5e7eb',padding:12,borderRadius:8,maxWidth:420}}>
      <h3>Unlock Wallet</h3>
      <div style={{fontSize:12,color:'#6b7280',marginBottom:6}}>Paste your encrypted keystore JSON (new format) or the older encrypted private-key export.</div>
      <textarea placeholder='paste encrypted JSON export here' value={cipherJson} onChange={e=>setCipherJson(e.target.value)} style={{width:'100%',height:120}} />
      <input placeholder='password' value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',marginTop:8}} />
      <div style={{marginTop:8}}>
        <button onClick={handleUnlock} className='menu-cta'>Unlock</button>
      </div>
    </div>
  )
}
