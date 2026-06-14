import { useEffect, useState } from 'react'
import axios from 'axios'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts'

export default function TreasuryDashboard() {
  const [metrics, setMetrics] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const metricsRes = await axios.get(
        '/api/treasury/metrics'
      )

      const historyRes = await axios.get(
        '/api/treasury/history'
      )

      setMetrics(metricsRes.data)

      setHistory(
        historyRes.data.snapshots || []
      )
    } catch (error) {
      console.error(error)
    }
  }

  if (!metrics) {
    return <div>Loading treasury...</div>
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">
        Mallchain Treasury
      </h1>

      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="p-4 border rounded">
          <h2>Total Supply</h2>

          <p>{metrics.total_supply}</p>
        </div>

        <div className="p-4 border rounded">
          <h2>Circulating</h2>

          <p>{metrics.circulating_supply}</p>
        </div>

        <div className="p-4 border rounded">
          <h2>Burned</h2>

          <p>{metrics.burned_supply}</p>
        </div>

        <div className="p-4 border rounded">
          <h2>Staked</h2>

          <p>{metrics.total_staked}</p>
        </div>
      </div>

      <div className="h-[400px]">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <LineChart data={history}>
            <XAxis dataKey="block_height" />

            <YAxis />

            <Tooltip />

            <Line
              type="monotone"
              dataKey="treasury_balance"
            />

            <Line
              type="monotone"
              dataKey="burned_supply"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}