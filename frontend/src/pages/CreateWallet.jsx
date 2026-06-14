import { useState, useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  Wallet, 
  Copy, 
  Check, 
  Shield, 
  Download, 
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { 
  createWallet, 
  saveWallet,
  importWallet as importWalletUtil
} from '../core/wallet/walletUtils'

const STEP_TITLES = [
  'Create Your Wallet',
  'Secure Your Mnemonic',
  'Confirm & Complete'
]

const STEP_DESCRIPTIONS = [
  'Generate a new wallet with a unique address',
  'Write down your recovery phrase in order',
  'Verify your recovery phrase to complete setup'
]

export default function CreateWallet() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(1)
  const [isCreating, setIsCreating] = useState(false)
  const [wallet, setWallet] = useState(null)
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [copied, setCopied] = useState(false)
  const [importMode, setImportMode] = useState(false)
  const [importMnemonic, setImportMnemonic] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [confirmMnemonic, setConfirmMnemonic] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const navigate = useNavigate()
  const importModeFromQuery = searchParams.get('mode') === 'import'
  const importModeFromRoute = location.pathname === '/wallet/restore'
  const inviteFrom = searchParams.get('inviteFrom')
  const returnTo = searchParams.get('returnTo')
  const suggestedAmount = searchParams.get('amount')

  const finishAfterWalletReady = (address) => {
    if (returnTo === 'send' && address) {
      const qs = new URLSearchParams({ to: address })
      if (suggestedAmount) qs.set('amount', suggestedAmount)
      navigate(`/wallet/send?${qs.toString()}`)
      return
    }
    navigate('/wallet')
  }

  useEffect(() => {
    if (importModeFromQuery || importModeFromRoute) {
      setImportMode(true)
    }
  }, [importModeFromQuery, importModeFromRoute])

  const wordList = wallet?.mnemonic ? wallet.mnemonic.split(' ') : []

  const handleCreateWallet = () => {
    console.log('Create Wallet button clicked')
    setIsCreating(true)
    try {
      console.log('Calling createWallet()...')
      // Small delay to show loading state
      setTimeout(() => {
        const newWallet = createWallet()
        console.log('Wallet created:', newWallet)
        setWallet(newWallet)
        setStep(2)
        toast.success('Wallet created successfully!')
        setIsCreating(false)
      }, 100)
    } catch (error) {
      console.error('Wallet creation error:', error)
      toast.error(error.message || 'Failed to create wallet')
      setIsCreating(false)
    }
  }

  const handleImportWallet = async () => {
    const normalizedMnemonic = importMnemonic.trim().replace(/\s+/g, ' ')

    if (!normalizedMnemonic) {
      toast.error('Please enter your mnemonic phrase')
      return
    }

    setIsImporting(true)
    try {
      const importedWallet = await importWalletUtil(normalizedMnemonic)
      // SECURITY: Only save address and publicKey, never store mnemonic on disk
      saveWallet(importedWallet)
      toast.success('Wallet imported successfully!')
      finishAfterWalletReady(importedWallet.address)
    } catch (error) {
      toast.error(error.message || 'Failed to import wallet')
    } finally {
      setIsImporting(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleConfirmMnemonic = async () => {
    const normalizedConfirm = confirmMnemonic.trim().replace(/\s+/g, ' ')
    const normalizedWalletMnemonic = wallet.mnemonic.trim().replace(/\s+/g, ' ')

    if (!normalizedConfirm) {
      setConfirmError('Please enter your mnemonic phrase')
      return
    }

    if (normalizedConfirm !== normalizedWalletMnemonic) {
      setConfirmError('Mnemonic does not match. Please try again.')
      return
    }

    setIsConfirming(true)
    try {
      // SECURITY: Save wallet without mnemonic or privateKey
      saveWallet(wallet)
      // Clear mnemonic from component state
      setWallet({ ...wallet, mnemonic: null })
      
      try {
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/mallpoints/award`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: wallet.address }),
        })
      } catch {
        /* welcome points are best-effort */
      }
      toast.success('Wallet created — welcome Mallpoints awarded!')
      finishAfterWalletReady(wallet.address)
    } catch (error) {
      toast.error('Failed to save wallet')
    } finally {
      setIsConfirming(false)
    }
  }

  const downloadMnemonic = () => {
    const content = `Mallchain Wallet Recovery Phrase
================================
DO NOT SHARE THIS WITH ANYONE!
Store it in a safe and secure place.

Mnemonic Phrase:
${wallet.mnemonic}

Address: ${wallet.address}

Generated on: ${new Date().toISOString()}
`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mallchain-wallet-recovery.txt'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Recovery phrase downloaded')
  }

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {inviteFrom && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-5 text-center"
          >
            <p className="text-cyan-200 font-semibold">You&apos;re invited to Mallchain</p>
            <p className="text-slate-400 text-sm mt-2">
              Create a wallet so you can receive Mallcoins (MLCNS).
            </p>
            <p className="text-xs font-mono text-slate-500 mt-2 break-all">
              From: {inviteFrom}
            </p>
          </motion.div>
        )}

        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
          >
            <Wallet className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-4xl font-black text-white mb-4">
            {importMode ? 'Import Your Wallet' : 'Create Your Wallet'}
          </h1>
          <p className="text-slate-400 text-lg">
            {importMode
              ? 'Restore your existing Mallchain wallet with your recovery phrase'
              : 'Securely create or import your Mallchain wallet'}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((stepNum) => (
              <div key={stepNum} className="flex items-center">
                <div className={`
                  w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg
                  transition-all duration-300
                  ${step >= stepNum 
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' 
                    : 'bg-slate-800 text-slate-500'}
                `}>
                  {step > stepNum ? <Check className="w-6 h-6" /> : stepNum}
                </div>
                {stepNum < 3 && (
                  <div className={`
                    w-24 sm:w-32 h-1 mx-2 rounded-full transition-all duration-300
                    ${step > stepNum ? 'bg-gradient-to-r from-cyan-500 to-blue-600' : 'bg-slate-800'}
                  `} />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <h3 className="text-xl font-bold text-white">
              {STEP_TITLES[step - 1]}
            </h3>
            <p className="text-slate-400 mt-1">
              {STEP_DESCRIPTIONS[step - 1]}
            </p>
          </div>
        </div>

        {/* Step Content */}
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-slate-900/50 backdrop-blur-xl rounded-3xl p-8 border border-slate-800"
        >
          {/* Step 1: Create or Import */}
          {step === 1 && (
            <div className="space-y-6">
              {!importMode ? (
                <>
                  <div className="text-center">
                    <Shield className="w-16 h-16 text-cyan-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">
                      Generate New Wallet
                    </h2>
                    <p className="text-slate-400">
                      Create a new wallet with a randomly generated recovery phrase
                    </p>
                  </div>

                  <button
                    onClick={handleCreateWallet}
                    disabled={isCreating}
                    className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isCreating ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Creating Wallet...
                      </>
                    ) : (
                      <>
                        Create New Wallet
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-slate-900 text-slate-400">or</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setImportMode(true)}
                    className="w-full py-4 px-6 rounded-xl border-2 border-slate-700 text-white font-bold text-lg hover:border-cyan-500 hover:text-cyan-500 transition-all"
                  >
                    Import Existing Wallet
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <RefreshCw className="w-16 h-16 text-cyan-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">
                      Import Wallet
                    </h2>
                    <p className="text-slate-400">
                      Enter your 12 or 24 word recovery phrase to import an existing wallet
                    </p>
                  </div>

                  <div className="space-y-4">
                    <textarea
                      value={importMnemonic}
                      onChange={(e) => setImportMnemonic(e.target.value)}
                      placeholder="Enter your mnemonic phrase (12 or 24 words separated by spaces)"
                      className="w-full h-32 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        if (importModeFromRoute || importModeFromQuery) {
                          navigate('/wallet')
                          return
                        }
                        setImportMode(false)
                      }}
                      className="flex-1 py-4 px-6 rounded-xl border-2 border-slate-700 text-white font-bold hover:border-slate-600 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleImportWallet}
                      disabled={isImporting}
                      className="flex-1 py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isImporting ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        'Import Wallet'
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: View Mnemonic */}
          {step === 2 && wallet && (
            <div className="space-y-6">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-yellow-500 mb-1">
                    Important Security Notice
                  </h3>
                  <p className="text-sm text-yellow-500/80">
                    Write down your recovery phrase on paper and store it in a safe place. 
                    Never share it with anyone or store it digitally. 
                    Anyone with this phrase can access your funds.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {wordList.map((word, index) => (
                  <div
                    key={index}
                    className="bg-slate-800 rounded-xl p-3 text-center border border-slate-700"
                  >
                    <div className="text-xs text-slate-500 mb-1">{index + 1}</div>
                    <div className="text-white font-mono font-bold">
                      {showMnemonic ? word : '••••••'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setShowMnemonic(!showMnemonic)}
                  className="flex items-center gap-2 text-cyan-500 hover:text-cyan-400 transition-colors"
                >
                  {showMnemonic ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                  {showMnemonic ? 'Hide' : 'Show'} Recovery Phrase
                </button>
              </div>

              <div className="bg-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">Your Wallet Address</span>
                  <button
                    onClick={() => copyToClipboard(wallet.address)}
                    className="text-cyan-500 hover:text-cyan-400 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="text-white font-mono text-sm break-all">
                  {wallet.address}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={downloadMnemonic}
                  className="flex-1 py-4 px-6 rounded-xl border-2 border-slate-700 text-white font-bold hover:border-cyan-500 hover:text-cyan-500 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Backup
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold hover:opacity-90 transition-all"
                >
                  I've Written It Down
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm Mnemonic */}
          {step === 3 && wallet && (
            <div className="space-y-6">
              <div className="text-center">
                <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">
                  Verify Your Recovery Phrase
                </h2>
                <p className="text-slate-400">
                  Enter your recovery phrase to confirm you've saved it correctly
                </p>
              </div>

              <div className="space-y-4">
                <textarea
                  value={confirmMnemonic}
                  onChange={(e) => {
                    setConfirmMnemonic(e.target.value)
                    setConfirmError('')
                  }}
                  placeholder="Enter your mnemonic phrase (words separated by spaces)"
                  className="w-full h-32 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                />
                {confirmError && (
                  <p className="text-red-500 text-sm">{confirmError}</p>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-4 px-6 rounded-xl border-2 border-slate-700 text-white font-bold hover:border-slate-600 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmMnemonic}
                  disabled={isConfirming}
                  className="flex-1 py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isConfirming ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      Confirm & Complete
                      <Check className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Security Info */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl p-6 border border-slate-800">
            <Shield className="w-8 h-8 text-cyan-500 mb-3" />
            <h3 className="font-bold text-white mb-2">Secure Generation</h3>
            <p className="text-sm text-slate-400">
              Wallets are generated using cryptographically secure random number generation
            </p>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl p-6 border border-slate-800">
            <Wallet className="w-8 h-8 text-cyan-500 mb-3" />
            <h3 className="font-bold text-white mb-2">Local Storage</h3>
            <p className="text-sm text-slate-400">
              Your wallet is stored securely in your browser's local storage
            </p>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl p-6 border border-slate-800">
            <Download className="w-8 h-8 text-cyan-500 mb-3" />
            <h3 className="font-bold text-white mb-2">Backup Option</h3>
            <p className="text-sm text-slate-400">
              Download your recovery phrase as a text file for safekeeping
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}