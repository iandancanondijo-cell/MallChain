import { useEffect, useState } from 'react';
import { getAgentProfile, updateAgentProfile, toggleAgentOnline } from '../../../api';
import { User, Phone, Truck, Wifi, WifiOff, Save, Loader2 } from 'lucide-react';

interface AgentProfile {
  _id?: string;
  displayName?: string;
  phone?: string;
  email?: string;
  online?: boolean;
  vehicle?: {
    type?: string;
    regNumber?: string;
  };
  rating?: number;
  totalCompleted?: number;
  avatar?: string;
}

export default function Settings() {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('motorbike');
  const [vehicleReg, setVehicleReg] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const data = await getAgentProfile();
      setProfile(data);
      setDisplayName(data.displayName || '');
      setPhone(data.phone || '');
      setVehicleType(data.vehicle?.type || 'motorbike');
      setVehicleReg(data.vehicle?.regNumber || '');
    } catch (e) {
      console.error('Failed to load profile', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateAgentProfile({
        displayName,
        phone,
        vehicle: { type: vehicleType, regNumber: vehicleReg }
      });
      alert('Profile updated!');
    } catch (e: any) {
      alert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleOnline() {
    if (!profile) return;
    setTogglingOnline(true);
    try {
      const result = await toggleAgentOnline(!profile.online);
      setProfile(prev => prev ? { ...prev, online: result.online } : null);
    } catch (e) {
      console.error('Failed to toggle status', e);
    } finally {
      setTogglingOnline(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const vehicleOptions = [
    { value: 'on-foot', label: 'On Foot' },
    { value: 'bike', label: 'Bicycle' },
    { value: 'motorbike', label: 'Motorbike' },
    { value: 'car', label: 'Car' },
    { value: 'van', label: 'Van' },
    { value: 'truck', label: 'Truck' },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          Agent <span className="text-indigo-400">Settings</span>
        </h1>
        <p className="text-slate-500 font-medium mt-1">Manage your delivery profile and preferences.</p>
      </div>

      {/* Online Status Toggle */}
      <div className="glass-dark p-6 rounded-[2rem] border border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${profile?.online ? 'bg-green-500/20' : 'bg-slate-500/20'}`}>
              {profile?.online ? <Wifi className="w-6 h-6 text-green-400" /> : <WifiOff className="w-6 h-6 text-slate-400" />}
            </div>
            <div>
              <p className="text-white font-bold">Online Status</p>
              <p className="text-sm text-slate-500">
                {profile?.online ? 'You are receiving job requests' : 'You are not receiving jobs'}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleOnline}
            disabled={togglingOnline}
            className={`px-6 py-3 rounded-xl font-black text-sm transition-all disabled:opacity-50 ${profile?.online
              ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
              : 'bg-green-500 text-white hover:bg-green-600'
              }`}
          >
            {togglingOnline ? 'Updating...' : profile?.online ? 'Go Offline' : 'Go Online'}
          </button>
        </div>
      </div>

      {/* Profile Form */}
      <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5">
        <h3 className="text-xl font-black text-white mb-6">Profile Information</h3>

        <div className="space-y-6">
          {/* Display Name */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              Display Name
            </label>
            <div className="relative">
              <div className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-white/5">
                {profile?.avatar ? (
                  <img src={profile.avatar} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-slate-500" />
                )}
              </div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full pl-14 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                placeholder="Your name"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                placeholder="+254..."
              />
            </div>
          </div>

          {/* Vehicle Type */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              Vehicle Type
            </label>
            <div className="relative">
              <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all appearance-none"
              >
                {vehicleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Vehicle Registration */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              Vehicle Registration
            </label>
            <input
              type="text"
              value={vehicleReg}
              onChange={(e) => setVehicleReg(e.target.value.toUpperCase())}
              className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              placeholder="KXX 123X"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-xl bg-indigo-500 text-white font-black hover:bg-indigo-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
