import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp, ArrowDown, Copy, ExternalLink, Filter, Calendar, Clock, CheckCircle, XCircle, Loader } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const CHAIN_REST = import.meta.env.VITE_CHAIN_REST || 'http://localhost:1317'

export default function Transactions() {
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [filter, setFilter] = useState('all')
  const [walletAddress, setWalletAddress] = useState('')
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0
  })

  useEffect(() => {
    const savedWallet = localStorage.getItem('wallet')
    if (savedWallet) {
      const wallet = JSON.parse(savedWallet)
      setWalletAddress(wallet.address)
      fetchTransactions(wallet.address)
    } else {
      setLoading(false)
    }
  }, [filter, pagination.page])

  const fetchTransactions = async (address) => {
    setLoading(true)
    try {
      // Fetch from backend API
      const response = await axios.get(`${API_URL}/tx/history`, {
        params: {
          address,
          status: filter !== 'all' ? filter : undefined,
          page: pagination.page,
          limit: pagination.limit
        }
      })

      if (response?.data?.success) {
        setTransactions(response.data.transactions || [])
        setPagination(prev => ({
          ...prev,
          total: response.data.total || 0
        }))
      }

    } catch (error) {
      // If user is not authorized, don't spam console/error UI.
      const status = error?.response?.status
      if (status === 401) {
        setTransactions([])
      } else {
        console.error('Error fetching transactions:', error)
        setTransactions([])
      }
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'text-green-400 bg-green-500/10 border-green-500/20'
      case 'pending':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
      case 'failed':
        return 'text-red-400 bg-red-500/10 border-red-500/20'
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="w-5 h-5" />
      case 'failed':
        return <XCircle className="w-5 h-5" />
      default:
        return <Clock className="w-5 h-5" />
    }
  }

  if (!walletAddress) {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <h1 className="text-4xl font-black text-white mb-4">
              Transaction History
            </h1>
            <p className="text-slate-400 mb-8">
              Connect your wallet to view your transactions
            </p>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-black text-white mb-2">
            Transaction History
          </h1>
          <p className="text-slate-400">
            View all your blockchain transactions
          </p>
        </motion.div>

        {/* Filters */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-500" />
            <div className="flex gap-2">
              {['all', 'confirmed', 'pending', 'failed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    filter === status
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/20'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="text-slate-400 text-sm">
            {pagination.total} transactions
          </div>
        </div>

        {/* Transactions List */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 backdrop-blur-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader className="w-8 h-8 text-slate-500 animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Transactions</h3>
              <p className="text-slate-400">
                Your transaction history will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {transactions.map((tx, index) => (
                <motion.div
                  key={tx.hash || index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-6 hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        tx.type === 'send' ? 'bg-red-500/10' : 'bg-green-500/10'
                      }`}>
                        {tx.type === 'send' ? (
                          <ArrowUp className={`w-5 h-5 ${tx.type === 'send' ? 'text-red-400' : 'text-green-400'}`} />
                        ) : (
                          <ArrowDown className="w-5 h-5 text-green-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-semibold ${
                            tx.type === 'send' ? 'text-red-400' : 'text-green-400'
                          }`}>
                            {tx.type === 'send' ? 'Sent' : 'Received'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${getStatusColor(tx.status)}`}>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(tx.status)}
                              {tx.status}
                            </span>
                          </span>
                        </div>
                        <div className="text-sm text-slate-400">
                          <div className="flex items-center gap-2">
                            <span>{tx.type === 'send' ? 'To:' : 'From:'}</span>
                            <code className="font-mono">
                              {tx.type === 'send' ? tx.to : tx.from}
                            </code>
                            <button
                              onClick={() => copyToClipboard(tx.type === 'send' ? tx.to : tx.from)}
                              className="text-slate-500 hover:text-cyan-400 transition-colors"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {formatDate(tx.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-white">
                        {tx.amount} MLN
                      </div>
                      <div className="flex items-center justify-end gap-1 text-xs text-slate-500">
                        <span>≈ ${((parseFloat(tx.amount) || 0) * 0.39).toFixed(2)}</span>
                        <button
                          onClick={() => copyToClipboard(tx.hash)}
                          className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {transactions.length > 0 && (
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <div className="text-slate-400 text-sm">
              Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
            </div>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page * pagination.limit >= pagination.total}
              className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}