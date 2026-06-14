import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Lock, Eye, EyeOff, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import * as bip39 from 'bip39'
import { HDKey } from '@scure/bip32'
import { storeEncryptedPrivateKey, retrievePrivateKey } from '../core/wallet/secureKeystore'

export default function KeystoreModal({ isOpen, onClose, address }) {
  const [mode, setMode] = useState('store') // 'store' or 'retrieve'
  const [inputType, setInputType] = useState('privateKey') // or 'mnemonic'
  const [privateKeyHex, setPrivateKeyHex] = useState('')
  const [mnemonic, setMnemonic] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [retrieved, setRetrieved] = useState(null)

  const clear = () => {
    setPrivateKeyHex('')
    setMnemonic('')
    setPassword('')
    setRetrieved(null)
  }

  const derivePrivateKeyFromMnemonic = (m) => {
    if (!bip39.validateMnemonic(m)) throw new Error('Invalid mnemonic')
    const seed = bip39.mnemonicToSeedSync(m)
    const root = HDKey.fromMasterSeed(seed)
    const path = "m/44'/118'/0'/0/0"
    const derived = root.derive(path)
    return Buffer.from(derived.privateKey).toString('hex')
  }

  const handleStore = async () => {
    setIsProcessing(true)
    try {
      let pk = privateKeyHex.trim()
      if (inputType === 'mnemonic') {
        const nm = mnemonic.trim().replace(/\s+/g, ' ')
        pk = derivePrivateKeyFromMnemonic(nm)
      }
      if (!pk || pk.length < 60) throw new Error('Invalid private key')
      if (!password) throw new Error('Password is required')
      await storeEncryptedPrivateKey(address, pk, password)
      toast.success('Private key stored securely for this address')
      clear()
      onClose()
    } catch (e) {
      toast.error(e.message || 'Failed to store key')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRetrieve = async () => {
    setIsProcessing(true)
    try {
      if (!password) throw new Error('Password is required')
      const pk = await retrievePrivateKey(address, password)
      if (!pk) throw new Error('No stored key for this address')
      setRetrieved(pk)
    } catch (e) {
      toast.error(e.message || 'Failed to retrieve key')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    clear()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Keystore Manager</h3>
              </div>
              <button onClick={handleClose} className="text-slate-400 hover:text-slate-200"><X /></button>
            </div>

            <div className="mb-4 text-sm text-slate-300">Manage encrypted private keys for address: <code className="font-mono">{address}</code></div>

            <div className="flex gap-2 mb-4">
              <button onClick={() => setMode('store')} className={`px-3 py-2 rounded ${mode==='store' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Store</button>
              <button onClick={() => setMode('retrieve')} className={`px-3 py-2 rounded ${mode==='retrieve' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Retrieve</button>
            </div>

            {mode === 'store' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button onClick={() => setInputType('privateKey')} className={`px-2 py-1 rounded ${inputType==='privateKey' ? 'bg-slate-700' : 'bg-slate-800'}`}>Private Key</button>
                  <button onClick={() => setInputType('mnemonic')} className={`px-2 py-1 rounded ${inputType==='mnemonic' ? 'bg-slate-700' : 'bg-slate-800'}`}>Mnemonic</button>
                </div>
                {inputType === 'privateKey' ? (
                  <textarea value={privateKeyHex} onChange={(e) => setPrivateKeyHex(e.target.value)} placeholder="Paste private key hex" className="w-full p-3 rounded bg-slate-800 text-white font-mono h-24" />
                ) : (
                  <textarea value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} placeholder="Enter mnemonic (12/24 words)" className="w-full p-3 rounded bg-slate-800 text-white h-24" />
                )}
                <div>
                  <label className="text-sm text-slate-400">Encryption Password</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1 p-2 rounded bg-slate-800 text-white" />
                    <button onClick={() => setShowPassword(!showPassword)} className="text-slate-400"><>{showPassword ? <EyeOff /> : <EyeOff />}</></button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={handleClose} className="px-4 py-2 rounded bg-slate-800 text-slate-300">Cancel</button>
                  <button onClick={handleStore} disabled={isProcessing} className="px-4 py-2 rounded bg-cyan-500 text-white">{isProcessing ? 'Storing...' : 'Store Securely'}</button>
                </div>
              </div>
            )}

            {mode === 'retrieve' && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-slate-400">Encryption Password</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1 p-2 rounded bg-slate-800 text-white" />
                    <button onClick={() => setShowPassword(!showPassword)} className="text-slate-400"><>{showPassword ? <EyeOff /> : <EyeOff />}</></button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={handleClose} className="px-4 py-2 rounded bg-slate-800 text-slate-300">Cancel</button>
                  <button onClick={handleRetrieve} disabled={isProcessing} className="px-4 py-2 rounded bg-cyan-500 text-white">{isProcessing ? 'Retrieving...' : 'Retrieve'}</button>
                </div>

                {retrieved && (
                  <div className="mt-4 p-3 rounded bg-slate-800 text-white font-mono">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-slate-300">Private key (hex)</div>
                      <button onClick={() => { navigator.clipboard.writeText(retrieved); toast.success('Copied') }} className="text-slate-400">Copy</button>
                    </div>
                    <div className="break-all">{retrieved}</div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
