import React from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import { BarChart2, TrendingUp, RefreshCw, RotateCw } from 'lucide-react'

const rings = [
  {
    name: 'Covert Ford',
    value: 48,
    color: '#8b5cf6',
    inner: 82,
    outer: 92,
  },
  {
    name: 'Leif Johnson Ford',
    value: 36,
    color: '#fb923c',
    inner: 68,
    outer: 78,
  },
  {
    name: 'Maxwell Ford',
    value: 16,
    color: '#22d3ee',
    inner: 54,
    outer: 64,
  },
]

export default function MultiDonutChart() {
  return (
    <div className="rounded-2xl bg-[#2c3e50] p-6 text-white border border-white/5">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">Multiple Donut Chart Title</h3>
          <p className="text-sm text-teal-300">Subtitle for Multiple Donut Chart</p>
        </div>

        <div className="flex gap-3 text-teal-400">
          <BarChart2 size={18} />
          <TrendingUp size={18} />
          <RefreshCw size={18} />
          <RotateCw size={18} />
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {rings.map((ring, index) => (
              <Pie
                key={index}
                data={[{ value: ring.value }, { value: 100 - ring.value }]}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                innerRadius={ring.inner}
                outerRadius={ring.outer}
                stroke="none"
              >
                <Cell fill={ring.color} />
                <Cell fill="rgba(255,255,255,0.08)" />
              </Pie>
            ))}
          </PieChart>
        </ResponsiveContainer>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-5xl font-bold">48%</div>
          <div className="text-sm opacity-70 mt-1">283 Sold</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-6">
        {rings.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/20 border border-white/10 text-sm"
          >
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
            {r.name}
          </div>
        ))}
      </div>
    </div>
  )
}
