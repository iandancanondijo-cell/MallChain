import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'
import { useLivePrice } from '../hooks/useRealtime'

export function LivePriceChart() {
  const priceData = useLivePrice()
  const [chartData, setChartData] = useState([])

  useEffect(() => {
    if (priceData?.history) {
      const formattedData = priceData.history.map((point: any) => ({
        time: new Date(point.timestamp).toLocaleTimeString(),
        price: parseFloat(point.price.toFixed(6)),
        timestamp: point.timestamp
      }))
      setChartData(formattedData)
    }
  }, [priceData])

  const currentPrice = priceData?.price || 0
  const priceChange = priceData?.priceChange || 0
  const isPositive = priceChange >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 border border-slate-700"
    >
      <div className="mb-6">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
              Mallcoin Price
            </h3>
            <p className="text-4xl font-bold text-white mt-2">
              ${currentPrice.toFixed(6)}
            </p>
          </div>
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className={`px-3 py-1 rounded-full text-sm font-semibold ${
              isPositive
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {isPositive ? '📈' : '📉'} {Math.abs(priceChange).toFixed(2)}%
          </motion.div>
        </div>
        {priceData?.volume24h && (
          <p className="text-xs text-slate-500">
            24h Volume: {priceData.volume24h.toFixed(2)} MLCOIN
          </p>
        )}
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              domain="dataMin - 0.1"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '8px'
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value: any) => `$${value.toFixed(6)}`}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
              isAnimationActive={true}
              fill="url(#priceGradient)"
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-64 flex items-center justify-center text-slate-500">
          Waiting for price data...
        </div>
      )}
    </motion.div>
  )
}

export default LivePriceChart
