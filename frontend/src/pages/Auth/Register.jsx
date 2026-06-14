import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

const platforms = [
  { value: '', label: 'Select your primary platform' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'other', label: 'Other' }
]

const activities = {
  youtube: [
    { value: '', label: 'Select your main activity' },
    { value: 'content_creation', label: 'Content Creation' },
    { value: 'viewing', label: 'Watching Videos' },
    { value: 'commenting', label: 'Commenting' },
    { value: 'live_streaming', label: 'Live Streaming' }
  ],
  instagram: [
    { value: '', label: 'Select your main activity' },
    { value: 'content_creation', label: 'Content Creation' },
    { value: 'stories', label: 'Stories' },
    { value: 'reels', label: 'Reels' },
    { value: 'shopping', label: 'Shopping' }
  ],
  twitter: [
    { value: '', label: 'Select your main activity' },
    { value: 'posting', label: 'Posting Tweets' },
    { value: 'engagement', label: 'Engaging with Content' },
    { value: 'news', label: 'Following News' },
    { value: 'networking', label: 'Networking' }
  ],
  tiktok: [
    { value: '', label: 'Select your main activity' },
    { value: 'content_creation', label: 'Creating Videos' },
    { value: 'viewing', label: 'Watching Videos' },
    { value: 'live_streaming', label: 'Live Streaming' },
    { value: 'duets', label: 'Duets & Collabs' }
  ],
  twitch: [
    { value: '', label: 'Select your main activity' },
    { value: 'streaming', label: 'Streaming' },
    { value: 'watching', label: 'Watching Streams' },
    { value: 'chatting', label: 'Chatting' },
    { value: 'hosting', label: 'Hosting' }
  ],
  other: [
    { value: '', label: 'Select your main activity' },
    { value: 'content_creation', label: 'Content Creation' },
    { value: 'consumption', label: 'Content Consumption' },
    { value: 'community', label: 'Community Engagement' },
    { value: 'business', label: 'Business/Marketing' }
  ]
}

export default function Register() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    platform: '',
    activity: '',
    budget: ''
  })
  const [errors, setErrors] = useState({})
  const [step, setStep] = useState(1)

  const validateStep1 = () => {
    const newErrors = {}
    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }
    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateStep2 = () => {
    const newErrors = {}
    if (!formData.platform) {
      newErrors.platform = 'Please select a platform'
    }
    if (!formData.activity) {
      newErrors.activity = 'Please select an activity'
    }
    if (!formData.budget || parseFloat(formData.budget) <= 0) {
      newErrors.budget = 'Please enter a valid budget amount'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNextStep = () => {
    if (validateStep1()) {
      setStep(2)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateStep2()) return

    setLoading(true)
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        email: formData.email,
        password: formData.password,
        platform: formData.platform,
        activity: formData.activity,
        budget: parseFloat(formData.budget)
      })
      if (response.data.token) {
        localStorage.setItem('token', response.data.token)
        localStorage.setItem('user', JSON.stringify(response.data.user))
        toast.success('Registration successful!')
        navigate('/dashboard')
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Registration failed. Please try again.')
      setErrors({ general: error.response?.data?.error || 'Registration failed' })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
    // Clear activity when platform changes
    if (name === 'platform') {
      setFormData(prev => ({ ...prev, activity: '' }))
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 backdrop-blur-xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-white mb-2">
              Create Account
            </h1>
            <p className="text-slate-400">
              Join the Mallcoin marketplace
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-8">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-cyan-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-cyan-500/20 border border-cyan-500' : 'bg-slate-800 border border-slate-700'}`}>
                1
              </div>
              <span className="text-sm font-medium">Account</span>
            </div>
            <div className={`flex-1 h-0.5 mx-4 ${step >= 2 ? 'bg-cyan-500' : 'bg-slate-800'}`} />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-cyan-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-cyan-500/20 border border-cyan-500' : 'bg-slate-800 border border-slate-700'}`}>
                2
              </div>
              <span className="text-sm font-medium">Profile</span>
            </div>
          </div>

          {errors.general && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {step === 1 && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className={`w-full bg-slate-800 border ${
                        errors.email ? 'border-red-500' : 'border-slate-700'
                      } rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors`}
                      placeholder="you@example.com"
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-2 text-sm text-red-400">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      className={`w-full bg-slate-800 border ${
                        errors.password ? 'border-red-500' : 'border-slate-700'
                      } rounded-xl py-3 pl-12 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-2 text-sm text-red-400">{errors.password}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className={`w-full bg-slate-800 border ${
                        errors.confirmPassword ? 'border-red-500' : 'border-slate-700'
                      } rounded-xl py-3 pl-12 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-2 text-sm text-red-400">{errors.confirmPassword}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-6 rounded-xl hover:from-cyan-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all flex items-center justify-center gap-2"
                >
                  Next Step
                  <ArrowRight className="w-5 h-5" />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Primary Platform
                  </label>
                  <select
                    name="platform"
                    value={formData.platform}
                    onChange={handleChange}
                    className={`w-full bg-slate-800 border ${
                      errors.platform ? 'border-red-500' : 'border-slate-700'
                    } rounded-xl py-3 px-4 text-white focus:outline-none focus:border-cyan-500 transition-colors appearance-none`}
                  >
                    {platforms.map(platform => (
                      <option key={platform.value} value={platform.value}>
                        {platform.label}
                      </option>
                    ))}
                  </select>
                  {errors.platform && (
                    <p className="mt-2 text-sm text-red-400">{errors.platform}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Main Activity
                  </label>
                  <select
                    name="activity"
                    value={formData.activity}
                    onChange={handleChange}
                    disabled={!formData.platform}
                    className={`w-full bg-slate-800 border ${
                      errors.activity ? 'border-red-500' : 'border-slate-700'
                    } rounded-xl py-3 px-4 text-white focus:outline-none focus:border-cyan-500 transition-colors appearance-none disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {formData.platform && activities[formData.platform] ? (
                      activities[formData.platform].map(activity => (
                        <option key={activity.value} value={activity.value}>
                          {activity.label}
                        </option>
                      ))
                    ) : (
                      <option>Select a platform first</option>
                    )}
                  </select>
                  {errors.activity && (
                    <p className="mt-2 text-sm text-red-400">{errors.activity}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Monthly Budget (Mallpoints)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">MP</span>
                    <input
                      type="number"
                      name="budget"
                      value={formData.budget}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className={`w-full bg-slate-800 border ${
                        errors.budget ? 'border-red-500' : 'border-slate-700'
                      } rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors`}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.budget && (
                    <p className="mt-2 text-sm text-red-400">{errors.budget}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    This helps us personalize your experience and rewards.
                  </p>
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 bg-slate-800 border border-slate-700 text-white font-medium py-3 px-6 rounded-xl hover:bg-slate-700 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-6 rounded-xl hover:from-cyan-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        Create Account
                        <CheckCircle className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}