import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, ArrowRight, Zap, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import './Register.css';

const platforms = [
  { id: 'youtube', name: 'YouTube' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'twitter', name: 'Twitter' },
  { id: 'tiktok', name: 'TikTok' }
];

const activityOptions = {
  youtube: ['Views', 'Likes', 'Subscribers', 'Comments'],
  instagram: ['Likes', 'Followers', 'Comments', 'Shares'],
  twitter: ['Retweets', 'Likes', 'Followers', 'Comments'],
  tiktok: ['Views', 'Likes', 'Followers', 'Shares']
};

export default function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    platform: 'youtube',
    activity: 'Views',
    budget: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!formData.username.trim()) newErrors.username = 'Username is required';
    if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) newErrors.email = 'Valid email required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    if (formData.password.length < 8) newErrors.password = 'Password must be 8+ characters';
    if (!formData.budget.trim()) newErrors.budget = 'Budget is required';
    if (Number(formData.budget) <= 0) newErrors.budget = 'Budget must be greater than 0';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the errors above');
      return;
    }

    setLoading(true);
    try {
      // Simulated API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success('Account created successfully!');
      navigate('/login');
    } catch (error) {
      toast.error('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      {/* Animated Background Orbs */}
      <div className="backdrop-blur"></div>
      <div className="floating-orb orb-1"></div>
      <div className="floating-orb orb-2"></div>
      <div className="floating-orb orb-3"></div>
      <div className="gradient-line"></div>

      {/* Main Content */}
      <div className="register-content">
        {/* Header */}
        <div className="register-header">
          <div className="header-icon">
            <div className="icon-wrapper">
              <Zap className="icon" />
            </div>
          </div>
          <h1>Create Account</h1>
          <p>Start your journey in decentralized commerce</p>
        </div>

        {/* Form Container - Centered */}
        <form className="register-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            {/* Full Name */}
            <div className={`form-group ${focusedField === 'fullName' ? 'focused' : ''} ${errors.fullName ? 'error' : ''}`}>
              <label htmlFor="fullName">
                <User className="field-icon" />
                <span>Full Name</span>
              </label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                onFocus={() => setFocusedField('fullName')}
                onBlur={() => setFocusedField(null)}
                placeholder="Full Name"
                className="form-input"
              />
              {errors.fullName && <span className="error-text">{errors.fullName}</span>}
            </div>

            {/* Username */}
            <div className={`form-group ${focusedField === 'username' ? 'focused' : ''} ${errors.username ? 'error' : ''}`}>
              <label htmlFor="username">
                <Sparkles className="field-icon" />
                <span>Username</span>
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                placeholder="Username"
                className="form-input"
              />
              {errors.username && <span className="error-text">{errors.username}</span>}
            </div>

            {/* Email */}
            <div className={`form-group ${focusedField === 'email' ? 'focused' : ''} ${errors.email ? 'error' : ''}`}>
              <label htmlFor="email">
                <Mail className="field-icon" />
                <span>Email</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                placeholder="Email Address"
                className="form-input"
              />
              {errors.email && <span className="error-text">{errors.email}</span>}
            </div>

            {/* Phone */}
            <div className={`form-group ${focusedField === 'phone' ? 'focused' : ''} ${errors.phone ? 'error' : ''}`}>
              <label htmlFor="phone">
                <Phone className="field-icon" />
                <span>Phone</span>
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
                placeholder="+254..."
                className="form-input"
              />
              {errors.phone && <span className="error-text">{errors.phone}</span>}
            </div>
          </div>

          {/* Platform Selection */}
          <div className="form-group full-width">
            <label>Platform</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {platforms.map(platform => (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    platform: platform.id,
                    activity: activityOptions[platform.id as keyof typeof activityOptions][0]
                  })}
                  className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                    formData.platform === platform.id
                      ? 'bg-purple-500/10 border-purple-500 text-purple-400'
                      : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full ${
                    platform.id === 'youtube' ? 'bg-red-500' :
                    platform.id === 'instagram' ? 'bg-pink-500' :
                    platform.id === 'twitter' ? 'bg-sky-500' :
                    'bg-black border border-white/20'
                  }`}></div>
                  <span className="text-xs font-bold uppercase tracking-wider">{platform.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Activity Selection */}
          <div className={`form-group full-width ${errors.activity ? 'error' : ''}`}>
            <label htmlFor="activity" className="block text-xs font-bold text-slate-500 uppercase mb-2">Activity Type</label>
            <select
              id="activity"
              name="activity"
              value={formData.activity}
              onChange={(e) => setFormData({ ...formData, activity: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-purple-500/50 placeholder-slate-600"
            >
              {activityOptions[formData.platform as keyof typeof activityOptions].map(act => (
                <option key={act} value={act} className="bg-slate-900">
                  {act}
                </option>
              ))}
            </select>
            {errors.activity && <span className="error-text">{errors.activity}</span>}
          </div>

          {/* Budget */}
          <div className={`form-group full-width ${focusedField === 'budget' ? 'focused' : ''} ${errors.budget ? 'error' : ''}`}>
            <label htmlFor="budget" className="block text-xs font-bold text-slate-500 uppercase mb-2">Budget (Mallpoints)</label>
            <input
              type="number"
              id="budget"
              name="budget"
              value={formData.budget}
              onChange={handleChange}
              onFocus={() => setFocusedField('budget')}
              onBlur={() => setFocusedField(null)}
              placeholder="e.g. 300"
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-purple-500/50 placeholder-slate-600"
              min="0"
            />
            {errors.budget && <span className="error-text">{errors.budget}</span>}
          </div>

          {/* Password */}
          <div className={`form-group full-width ${focusedField === 'password' ? 'focused' : ''} ${errors.password ? 'error' : ''}`}>
            <label htmlFor="password">
              <Lock className="field-icon" />
              <span>Secure Password</span>
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              placeholder="••••••••••••"
              className="form-input"
            />
            {errors.password && <span className="error-text">{errors.password}</span>}
          </div>

          {/* Buttons */}
          <div className="form-actions">
            <button 
              type="submit" 
              className="btn-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="spinner"></div>
                  Creating...
                </>
              ) : (
                <>
                  CREATE ACCOUNT
                  <ArrowRight className="btn-icon" />
                </>
              )}
            </button>
            <button 
              type="button" 
              className="btn-secondary"
              onClick={() => navigate('/login')}
            >
              Already part of the network? Log In
            </button>
          </div>
        </form>

        {/* Footer Security Info */}
        <div className="security-footer">
          <div className="security-item">
            <ShieldCheck className="check-icon" />
            <span>Encryption Active</span>
          </div>
          <div className="security-divider"></div>
          <div className="security-item">
            <Zap className="check-icon" style={{ color: '#60a5fa' }} />
            <span>Zero Gas Fees</span>
          </div>
        </div>
      </div>
    </div>
  );
}
