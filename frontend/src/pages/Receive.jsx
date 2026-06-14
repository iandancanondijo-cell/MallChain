import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Download, Share2, CheckCircle, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Receive() {
  const [walletAddress, setWalletAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [showQR, setShowQR] = useState(true)

  useEffect(() => {
    const savedWallet = localStorage.getItem('wallet')
    if (savedWallet) {
      const wallet = JSON.parse(savedWallet)
      setWalletAddress(wallet.address)
    }
  }, [])

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress)
    toast.success('Address copied to clipboard')
  }

  const generatePaymentLink = () => {
    if (!amount) return walletAddress
    return `${window.location.origin}/wallet/send?to=${walletAddress}&amount=${amount}`
  }

  const downloadQR = () => {
    const svg = document.getElementById('qr-code')
    const svgData = svg.innerHTML
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)
      const pngFile = canvas.toDataURL('image/png')
      const downloadLink = document.createElement('a')
      downloadLink.download = 'mallcoin-receive.png'
      downloadLink.href = pngFile
      downloadLink.click()
      toast.success('QR code downloaded')
    }
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`
  }

  const sharePaymentLink = async () => {
    const link = generatePaymentLink()
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mallcoin Payment',
          text: `Send ${amount || ''} MLN to this address`,
          url: link
        })
      } catch (err) {
        console.error('Share failed:', err)
      }
    } else {
      navigator.clipboard.writeText(link)
      toast.success('Payment link copied to clipboard')
    }
  }

  if (!walletAddress) {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <Wallet className="w-16 h-16 text-slate-500 mx-auto mb-6" />
            <h1 className="text-4xl font-black text-white mb-4">
              Receive Mallcoin
            </h1>
            <p className="text-slate-400 mb-8">
              Create or import a wallet to receive funds
            </p>
            <a
              href="/wallet/create"
              className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-6 rounded-xl hover:from-cyan-600 hover:to-blue-600 transition-all inline-block"
            >
              Create New Wallet
            </a>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-black text-white mb-2">
            Receive Mallcoin
          </h1>
          <p className="text-slate-400">
            Share your address to receive payments
          </p>
        </motion.div>

        {/* QR Code Section */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 backdrop-blur-xl mb-8">
          <div className="flex flex-col items-center">
            {/* QR Code */}
            <div className="bg-white p-6 rounded-2xl mb-6">
              <QRCodeSVG
                id="qr-code"
                value={walletAddress}
                size={256}
                level="H"
                includeMargin={true}
              />
            </div>

            {/* Wallet Address */}
            <div className="w-full max-w-md">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Your Wallet Address
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-800 rounded-xl p-4 font-mono text-sm text-white break-all">
                  {walletAddress}
                </div>
                <button
                  onClick={copyAddress}
                  className="p-4 rounded-xl bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mt-6 flex-wrap justify-center">
              <button
                onClick={copyAddress}
                className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-white font-medium py-3 px-6 rounded-xl hover:bg-slate-700 transition-colors"
              >
                <Copy className="w-5 h-5" />
                Copy Address
              </button>
              <button
                onClick={downloadQR}
                className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-white font-medium py-3 px-6 rounded-xl hover:bg-slate-700 transition-colors"
              >
                <Download className="w-5 h-5" />
                Download QR
              </button>
              <button
                onClick={sharePaymentLink}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-6 rounded-xl hover:from-cyan-600 hover:to-blue-600 transition-all"
              >
                <Share2 className="w-5 h-5" />
                Share Payment Link
              </button>
            </div>
          </div>
        </div>

        {/* Optional Amount */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">Request Specific Amount (Optional)</h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Amount (MLN)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setShowQR(!showQR)}
              className="p-4 rounded-xl bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 transition-colors"
            >
              <QRCodeSVG
                value={generatePaymentLink()}
                size={24}
                level="H"
              />
            </button>
          </div>
          {amount && (
            <p className="mt-4 text-sm text-slate-400">
              Payment link: <span className="text-cyan-400 font-mono">{generatePaymentLink()}</span>
            </p>
          )}
        </div>

        {/* Security Notice */}
        <div className="mt-8 p-6 rounded-2xl bg-green-500/10 border border-green-500/20">
          <div className="flex items-start gap-4">
            <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-green-400 mb-1">Secure Receiving</h4>
              <p className="text-sm text-green-300/80">
                Your wallet address is safe to share. Anyone can send funds to this address, 
                but only you can access the funds with your private key.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}