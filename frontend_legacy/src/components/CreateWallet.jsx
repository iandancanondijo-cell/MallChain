import React, {useState} from 'react'
import { generateMnemonic, genKeypairFromMnemonic, encryptPrivateKey, createKeystoreFromMnemonic, deriveCosmosAccountFromMnemonic } from '../utils/wallet'

export default function CreateWallet({onCreate}){
  const [mnemonic, setMnemonic] = useState('')
  const [password, setPassword] = useState('')
  const [encryptedJson, setEncryptedJson] = useState('')
  const [confirmedRecovery, setConfirmedRecovery] = useState(false)

  function handleCreate(){
    const m = generateMnemonic()
    setMnemonic(m)
    setEncryptedJson('')
  }

  async function handleUse(){
    try{
      const acct = await deriveCosmosAccountFromMnemonic(mnemonic)
      onCreate && onCreate({ mnemonic, account: acct })
      // Attempt to request operator to fund this new wallet (best-effort)
      try{
        const resp = await fetch((process.env.PREVIEW_API_BASE || '') + '/operator/fund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: acct.address, amount: '1000mlc' })
        })
        // ignore errors, it's best-effort
        if(!resp.ok) console.warn('operator fund failed', await resp.text())
      }catch(e){ console.warn('operator fund request failed', e) }
    }catch(e){
      const kp = await genKeypairFromMnemonic(mnemonic)
      onCreate && onCreate({ mnemonic, kp })
    }
  }

  async function handleEncrypt(){
    if(!mnemonic) return alert('generate a mnemonic first')
    if(!password) return alert('enter a password to encrypt')
    try{
      const keystore = await createKeystoreFromMnemonic(mnemonic, password)
      setEncryptedJson(JSON.stringify(keystore, null, 2))
    }catch(e){
      // fallback to older encryptPrivateKey if cosmjs unavailable
      const kp = await genKeypairFromMnemonic(mnemonic)
      const enc = await encryptPrivateKey(kp.priv, password)
      const blob = { ciphertext: enc.ciphertext, iv: enc.iv, salt: enc.salt, pub: kp.pub }
      setEncryptedJson(JSON.stringify(blob, null, 2))
    }
  }

  return (
    <div style={{border:'1px solid #e5e7eb',padding:12,borderRadius:8,maxWidth:420}}>
      <h3>Create Wallet</h3>
      <button onClick={handleCreate} className='menu-cta'>Generate mnemonic</button>
      {mnemonic && (
        <div style={{marginTop:8}}>
          <textarea readOnly value={mnemonic} style={{width:'100%',height:80}} />
          <div style={{fontSize:13,color:'#6b7280',marginTop:8}}>
            Please write down your recovery phrase (24 words) and store it securely. This is required to recover your wallet if you forget your password or lose access.
          </div>
          <label style={{display:'flex',alignItems:'center',gap:8,marginTop:8}}>
            <input type='checkbox' checked={confirmedRecovery} onChange={e=>setConfirmedRecovery(e.target.checked)} />
            <span style={{fontSize:13}}>I have written down my recovery phrase</span>
          </label>
            <div style={{display:'flex',gap:8,marginTop:8,flexDirection:'column'}}>
            <div style={{display:'flex',gap:8}}>
              <input placeholder='password to encrypt key' value={password} onChange={e=>setPassword(e.target.value)} style={{flex:1}} />
              <button onClick={handleEncrypt} className='menu-cta' disabled={!confirmedRecovery}>Encrypt & Export</button>
            </div>
            <div>
              <button onClick={handleUse} className='menu-cta' disabled={!confirmedRecovery}>Use this wallet (in-memory)</button>
            </div>
          </div>
          {encryptedJson && (
            <div style={{marginTop:8}}>
              <label style={{fontSize:12}}>Encrypted export (copy & save):</label>
              <textarea readOnly value={encryptedJson} style={{width:'100%',height:120,marginTop:6}} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
