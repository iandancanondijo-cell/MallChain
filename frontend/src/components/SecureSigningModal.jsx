import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Lock, Eye, EyeOff, Loader, X } from 'lucide-react'
import toast from 'react-hot-toast'
import * as bip39 from 'bip39'

/**
 * SecureSigningModal
 * 
 * Prompts user for their mnemonic phrase to sign a transaction
 * The mnemonic is NEVER stored; it's only used during this signing session
 * After signing, it's immediately cleared from memory
 */
export default function SecureSigningModal({
  isOpen,
  onClose,
  title = 'Sign Transaction',
  description = 'Enter your recovery phrase to sign and confirm this transaction',
  onSign,
  isLoading = false,
}) {
  const [mnemonic, setMnemonic] = useState('')
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')

  const handleSign = async () => {
    setError('')

    // Validate mnemonic
    if (!mnemonic.trim()) {
      setError('Please enter your recovery phrase')
      return
    }

    const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, ' ')
    if (!bip39.validateMnemonic(normalizedMnemonic)) {
      setError('Invalid recovery phrase. Please check the words.')
      return
    }

    setIsProcessing(true)
    try {
      // Pass mnemonic to callback; it will be used only during signing
      await onSign(normalizedMnemonic)

      // Success - close modal and clear state
      setMnemonic('')
      setShowMnemonic(false)
      onClose()
      toast.success('Transaction signed successfully!')
    } catch (err) {
      setError(err.message || 'Failed to sign transaction')
      console.error('Signing error:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    setMnemonic('')
    setShowMnemonic(false)
    setError('')
    onClose()
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isProcessing && !isLoading && mnemonic.trim()) {
      handleSign()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="border-b border-slate-800 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Lock className="w-5 h-5 text-cyan-400" />
                    {title}
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">{description}</p>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isProcessing || isLoading}
                  className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Security Warning */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200">
                  <p className="font-semibold mb-1">Security Notice</p>
                  <p>Your recovery phrase will be used only to sign this transaction and is never stored.</p>
                </div>
              </div>

              {/* Mnemonic Input */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Recovery Phrase (12 or 24 words)
                </label>
                <div className="relative">
                  <textarea
                    value={showMnemonic ? mnemonic : mnemonic.replace(/\S/g, '•').replace(/•+/g, (m) => m.length > 1 ? '••' : '•')}
                    onChange={(e) => setMnemonic(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isProcessing || isLoading}
                    className="w-full px-4 py-3 pr-12 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition-colors disabled:opacity-50 resize-none h-28 font-mono text-sm"
                    placeholder="Enter your 12 or 24 word recovery phrase..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowMnemonic(!showMnemonic)}
                    disabled={isProcessing || isLoading}
                    className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
                  >
                    {showMnemonic ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-800 p-6 flex gap-3">
              <button
                onClick={handleClose}
                disabled={isProcessing || isLoading}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-50 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSign}
                disabled={isProcessing || isLoading || !mnemonic.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 transition-all disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                {isProcessing || isLoading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Signing...
                  </>
                ) : (
                  'Sign & Confirm'
                )}
              </button>
            </div>

            {/* Footer Info */}
            <div className="px-6 pb-4 text-xs text-slate-500 text-center">
              Your recovery phrase is never saved or sent to servers.
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
