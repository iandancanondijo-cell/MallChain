import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Download, Share2, CheckCircle, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadWallet, clearWallet } from '../core/wallet/walletUtils'
import { TOKENS } from '../config/tokens'

const DENOM = TOKENS?.mallcoin?.symbol || 'MLCNS'

export default function Receive() {
  const navigate = useNavigate()
  const [walletAddress] = useState(() => loadWallet()?.address || '')
  const [amount, setAmount] = useState('')

  const handleSwitchWallet = () => { clearWallet(); navigate('/wallet/create') }

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress)
    toast.success('Address copied')
  }

  const paymentLink = () => {
    if (!amount) return walletAddress
    return `${window.location.origin}/wallet/send?to=${walletAddress}&amount=${amount}`
  }

  const downloadQR = () => {
    const svgEl = document.getElementById('qr-code')
    if (!svgEl) return
    // Proper SVG serialization using XMLSerializer
    const serialized = new XMLSerializer().serializeToString(svgEl)
    const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const canvas = document.createElement('canvas')
    canvas.width = 280; canvas.height = 280
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 280, 280)
      ctx.drawImage(img, 0, 0, 280, 280)
      const a = document.createElement('a')
      a.download = `mallcoin-wallet-qr.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
      URL.revokeObjectURL(url)
      toast.success('QR downloaded')
    }
    img.src = url
  }

  const sharePaymentLink = async () => {
    const link = paymentLink()
    if (navigator.share) {
      try { await navigator.share({ title: 'Mallcoin Payment', text: `Send ${amount || ''} ${DENOM} to my wallet`, url: link }) }
      catch { /* user dismissed */ }
    } else {
      navigator.clipboard.writeText(link)
      toast.success('Payment link copied')
    }
  }

  if (!walletAddress) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <Wallet className="w-12 h-12 text-slate-600" />
        <h1 className="text-3xl font-black text-white">Receive {DENOM}</h1>
        <p className="text-slate-400">Create or import a wallet to receive funds</p>
        <Link to="/wallet/create" className="px-6 py-3 rounded-xl bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition-colors">
          Create Wallet
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Receive {DENOM}</h1>
          <p className="text-slate-400 text-sm mt-1">Share your address or QR code</p>
        </div>
        <button onClick={handleSwitchWallet}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-sm">
          <Wallet size={14} /> Switch Wallet
        </button>
      </div>

      {/* QR card */}
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
        className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 flex flex-col items-center gap-6">
        <div className="bg-white p-4 rounded-2xl shadow-xl">
          <QRCodeSVG id="qr-code" value={paymentLink()} size={220} level="H" includeMargin={false}/>
        </div>

        <div className="w-full">
          <label className="block text-xs text-slate-500 mb-2 uppercase tracking-wider">Wallet Address</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-800 rounded-xl px-4 py-3 font-mono text-sm text-white break-all leading-relaxed">
              {walletAddress}
            </div>
            <button onClick={copyAddress} className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors flex-shrink-0">
              <Copy size={18}/>
            </button>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap justify-center w-full">
          <button onClick={copyAddress} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm hover:bg-slate-700">
            <Copy size={16}/> Copy Address
          </button>
          <button onClick={downloadQR} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm hover:bg-slate-700">
            <Download size={16}/> Download QR
          </button>
          <button onClick={sharePaymentLink} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 text-black font-semibold text-sm hover:bg-cyan-400">
            <Share2 size={16}/> Share Link
          </button>
        </div>
      </motion.div>

      {/* Request amount */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h3 className="font-bold text-white mb-4">Request Specific Amount <span className="text-slate-500 font-normal text-sm">(optional)</span></h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-2">Amount ({DENOM})</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.0000" min="0" step="0.0001"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"/>
          </div>
        </div>
        {amount && (
          <p className="mt-3 text-xs text-slate-500 font-mono break-all">
            {paymentLink()}
          </p>
        )}
      </div>

      {/* Security note */}
      <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex gap-3">
        <CheckCircle size={18} className="text-emerald-400 flex-shrink-0 mt-0.5"/>
        <p className="text-sm text-emerald-300/80">
          Your address is safe to share. Only you can access the funds using your private key or mnemonic phrase.
        </p>
      </div>
    </div>
  )
}
