import { useState, useEffect, useRef } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Loader2 } from 'lucide-react'

/**
 * Live price chart fed from socket price updates.
 * Props:
 *   priceData - latest { price, marketCap, ... } from socket
 *   loading   - initial loading state
 */
export default function LiveChart({ priceData, loading }) {
  const [chartData, setChartData] = useState([])
  const maxPoints = 30
  const lastPriceRef = useRef(null)

  useEffect(() => {
    if (!priceData?.price) return

    const numericPrice = parseFloat(String(priceData.price).replace(/[^0-9.]/g, ''))
    if (!numericPrice || numericPrice === lastPriceRef.current) return

    lastPriceRef.current = numericPrice
    const now = new Date()
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`

    setChartData((prev) => {
      const next = [...prev, { time: timeLabel, price: numericPrice }]
      return next.length > maxPoints ? next.slice(-maxPoints) : next
    })
  }, [priceData])

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Live Market Activity</h2>
        <p className="text-slate-400 mt-2">
          {chartData.length > 0
            ? `Tracking ${chartData.length} price points in real time`
            : 'Waiting for price data from the network…'}
        </p>
      </div>

      <div className="h-[350px]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <p className="text-lg font-semibold">No price data yet</p>
              <p className="text-sm mt-1">Chart will populate as price updates arrive</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 11 }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 11 }}
                domain={['auto', 'auto']}
                tickFormatter={(val) => val.toFixed(2)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  color: '#f1f5f9',
                }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, fill: '#3b82f6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
