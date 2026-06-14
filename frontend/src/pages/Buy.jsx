import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'

import mpesaIcon from '../assets/Pics and Illustrations/Mpesa Geen.jpeg'
import airtelMoneyIcon from '../assets/Pics and Illustrations/AirtelMoney Red.png'
import tkashIcon from '../assets/Pics and Illustrations/Tkash Blue.png'


const COUNTRY_CURRENCY = {
  Kenya: { code: 'KES', symbol: 'KSh' },
}

const PAYMENT_METHODS = [
  {
    title: 'M-Pesa',
    description: 'Mobile money payments in Kenya.',
    path: '/buy/mpesa',
    iconImg: mpesaIcon,
  },
  {
    title: 'Airtel Money',
    description: 'Top up using Airtel Money.',
    path: '/buy/airtel-money',
    iconImg: airtelMoneyIcon,
  },
  {
    title: 'T-Kash',
    description: 'Fast payments with T-Kash.',
    path: '/buy/t-kash',
    iconImg: tkashIcon,
  },

]


const countryOptions = Object.keys(COUNTRY_CURRENCY)

function PaymentCard({ title, description, path, iconImg }) {
  return (
    <Link
      to={path}
      className={
        'flex items-center gap-5 rounded-3xl border p-6 transition-all hover:scale-[1.01] ' +
        'border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:border-cyan-400/60'
      }
    >
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-cyan-500/20 overflow-hidden">
        <img src={iconImg} alt={title} className="w-full h-full object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="text-slate-400 text-sm mt-1">{description}</p>
      </div>
      <ArrowRight className="w-5 h-5 text-slate-500 shrink-0" />
    </Link>
  )
}


export default function Buy() {
  const [country, setCountry] = useState(countryOptions[0] || 'Kenya')

  useEffect(() => {
    const saved = localStorage.getItem('buyCountry')
    if (saved && COUNTRY_CURRENCY[saved]) setCountry(saved)
  }, [])

  useEffect(() => {
    localStorage.setItem('buyCountry', country)
  }, [country])

  const currency = COUNTRY_CURRENCY[country] || COUNTRY_CURRENCY.Kenya

  const payments = useMemo(() => PAYMENT_METHODS, [])

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full sm:w-72">
          <label className="text-sm text-slate-400">Country & Currency</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-white"
          >
            {countryOptions.map((c) => (
              <option key={c} value={c}>
                {c} ({COUNTRY_CURRENCY[c]?.code})
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-2">
            Prices shown in {currency.symbol} ({currency.code})
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex gap-3">
        <Shield className="w-5 h-5 text-cyan-400 shrink-0" />
        <p className="text-sm text-slate-300">Select a payment method to continue.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        {payments.map((p, i) => (
          <motion.div
            key={p.path}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <PaymentCard title={p.title} description={p.description} path={p.path} iconImg={p.iconImg} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

