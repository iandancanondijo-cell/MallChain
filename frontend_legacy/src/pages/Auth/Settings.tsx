import { useState, useRef } from "react";
import { useUserStore } from "../../store/userStore";
import { profileApi, authApi, walletApi } from "../../api";
import {
    User as UserIcon,
    Mail,
    Phone,
    Camera,
    Save,
    Loader2,
    Shield,
    Globe,
    LogOut,
    Trash2,
    Bell,
    Palette,
    Monitor,
    Moon,
    Sun,
    Eye,
    Lock,
    Smartphone,
    Check,
    ChevronRight,
    X,
    Star as StarIcon
} from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
    const { user, setUser, logout } = useUserStore();
    const [loading, setLoading] = useState(false);
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'notifications' | 'security' | 'privacy'>('profile');
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [isPinSet, setIsPinSet] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState({
        username: user?.username || "",
        email: user?.email || "",
        phone: user?.phone || "",
        bio: user?.bio || "",
        countryCode: user?.countryCode || "KE",
        idNumber: user?.idNumber || ""
    });

    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });

    const [pinForm, setPinForm] = useState({
        oldPin: "",
        newPin: "",
        confirmPin: ""
    });

    const [isResetingPin, setIsResetingPin] = useState(false);
    const [resetPinForm, setResetPinForm] = useState({
        idNumber: "",
        newPin: "",
        confirmPin: ""
    });

    // Appearance settings
    const [appearance, setAppearance] = useState({
        theme: user?.preferences?.theme || "dark",
        accentColor: user?.preferences?.accentColor || "indigo",
        fontSize: user?.preferences?.fontSize || "medium",
        reducedMotion: user?.preferences?.reducedMotion || false
    });

    // Notification settings
    const [notifications, setNotifications] = useState({
        email: user?.preferences?.notifications?.email ?? true,
        push: user?.preferences?.notifications?.push ?? true,
        sms: user?.preferences?.notifications?.sms ?? false,
        marketing: user?.preferences?.notifications?.marketing ?? false
    });

    // Privacy settings
    const [privacy, setPrivacy] = useState({
        profileVisibility: user?.preferences?.privacy?.profileVisibility || "public",
        showEmail: user?.preferences?.privacy?.showEmail ?? false,
        showPhone: user?.preferences?.privacy?.showPhone ?? false,
        activityStatus: user?.preferences?.privacy?.activityStatus ?? true
    });

    useState(() => {
        walletApi.checkPinStatus().then(res => {
            setIsPinSet(res.isSet);
        }).catch(() => { });
    });

    if (!user) return null;

    async function handleSave() {
        setLoading(true);
        try {
            const updateData = {
                ...form,
                preferences: {
                    theme: appearance.theme,
                    accentColor: appearance.accentColor,
                    fontSize: appearance.fontSize,
                    reducedMotion: appearance.reducedMotion,
                    notifications,
                    privacy
                }
            };
            const res = await profileApi.updateProfile(updateData);
            setUser({ ...user!, ...res.user });
            toast.success("Settings saved successfully");
        } catch (error: any) {
            toast.error(error.message || "Failed to update settings");
        } finally {
            setLoading(false);
        }
    }

    async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("avatar", file);

        setAvatarLoading(true);
        try {
            const res = await profileApi.updateProfile(formData);
            // Append timestamp to force refresh image
            const updatedUser = { ...user!, ...res.user };
            if (updatedUser.avatar) {
                // Remove existing timestamp if any and add a new one
                const baseAvatar = updatedUser.avatar.split('?')[0];
                updatedUser.avatar = `${baseAvatar}?t=${Date.now()}`;
            }
            setUser(updatedUser);
            toast.success("Avatar updated!");
        } catch (error: any) {
            toast.error("Failed to upload avatar");
        } finally {
            setAvatarLoading(false);
        }
    }

    async function handleChangePassword() {
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            toast.error("New passwords do not match");
            return;
        }
        if (passwordForm.newPassword.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }

        setLoading(true);
        try {
            await authApi.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
            toast.success("Password updated successfully");
            setShowPasswordModal(false);
            setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Failed to change password");
        } finally {
            setLoading(false);
        }
    }

    async function handlePinAction() {
        if (!/^\d{4,6}$/.test(pinForm.newPin)) {
            toast.error("PIN must be 4-6 digits");
            return;
        }
        if (pinForm.newPin !== pinForm.confirmPin) {
            toast.error("PINs do not match");
            return;
        }

        setLoading(true);
        try {
            if (isPinSet) {
                await walletApi.changePin(pinForm.oldPin, pinForm.newPin);
                toast.success("PIN changed successfully");
            } else {
                await walletApi.setPin(pinForm.newPin);
                toast.success("PIN set successfully");
                setIsPinSet(true);
            }
            setShowPinModal(false);
            setPinForm({ oldPin: "", newPin: "", confirmPin: "" });
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || "Failed to update PIN";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }

    async function handlePinReset() {
        if (!resetPinForm.idNumber) {
            toast.error("Please enter your ID Number");
            return;
        }
        if (!/^\d{4,6}$/.test(resetPinForm.newPin)) {
            toast.error("PIN must be 4-6 digits");
            return;
        }
        if (resetPinForm.newPin !== resetPinForm.confirmPin) {
            toast.error("PINs do not match");
            return;
        }

        setLoading(true);
        try {
            await walletApi.resetPin(resetPinForm.idNumber, resetPinForm.newPin);
            toast.success("PIN reset successfully");
            setIsPinSet(true);
            setShowPinModal(false);
            setIsResetingPin(false);
            setResetPinForm({ idNumber: "", newPin: "", confirmPin: "" });
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || "Failed to reset PIN";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }

    const accentColors = [
        { name: "Indigo", value: "indigo", class: "bg-indigo-500" },
        { name: "Purple", value: "purple", class: "bg-purple-500" },
        { name: "Blue", value: "blue", class: "bg-blue-500" },
        { name: "Green", value: "green", class: "bg-green-500" },
        { name: "Red", value: "red", class: "bg-red-500" },
        { name: "Amber", value: "amber", class: "bg-amber-500" },
        { name: "Pink", value: "pink", class: "bg-pink-500" },
        { name: "Cyan", value: "cyan", class: "bg-cyan-500" }
    ];

    const tabs = [
        { id: 'profile', label: 'Profile', icon: UserIcon },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'security', label: 'Security', icon: Lock },
        { id: 'privacy', label: 'Privacy', icon: Eye }
    ] as const;

    return (
        <div className="pb-20 animate-fade-in space-y-8 relative">
            <div>
                <h1 className="text-3xl font-black text-white tracking-tight">Settings</h1>
                <p className="text-slate-400 font-medium">Manage your account and system preferences.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar with Profile Card & Tabs */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Profile Card */}
                    <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 text-center space-y-6 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                        <div className="relative w-32 h-32 mx-auto">
                            <div className="w-full h-full rounded-full overflow-hidden border-4 border-white/10 bg-slate-900 relative shadow-2xl transition-transform duration-500 group-hover:scale-105">
                                {user.avatar ? (
                                    <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <UserIcon className="w-12 h-12 text-slate-600" />
                                    </div>
                                )}
                                {avatarLoading && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={avatarLoading}
                                className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center hover:bg-indigo-400 transition-all border-4 border-[#0a0a0a] disabled:opacity-50 shadow-xl"
                            >
                                <Camera className="w-4 h-4" />
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleAvatarUpload}
                            />
                        </div>

                        <div className="space-y-1 relative">
                            <h2 className="text-2xl font-black text-white tracking-tighter italic uppercase">{user.fullName}</h2>
                            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest opacity-80">@{user.username}</p>
                        </div>

                        <div className="flex justify-center gap-2 relative">
                            <span className="px-4 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest text-indigo-400 shadow-inner">
                                {user.role}
                            </span>
                            {user.badgeOwned && (
                                <span className="px-4 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest text-amber-400 shadow-inner">
                                    Premium
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-4 space-y-2">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-300 group ${isActive
                                        ? 'bg-white/10 text-white border border-white/10 shadow-xl'
                                        : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-500 group-hover:text-slate-300'}`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <span className={`text-sm font-black uppercase tracking-wider ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>
                                            {tab.label}
                                        </span>
                                    </div>
                                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>}
                                </button>
                            );
                        })}
                    </div>

                    {/* Danger Zone */}
                    <div className="bg-slate-950/40 backdrop-blur-2xl border border-red-500/10 rounded-[2.5rem] p-6 space-y-3">
                        <p className="text-[10px] font-black text-red-500/50 uppercase tracking-[0.2em] ml-2 mb-2">Danger Zone</p>
                        <button onClick={logout} className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-red-400 hover:bg-red-500/10 transition-all font-black text-xs uppercase tracking-widest border border-transparent hover:border-red-500/20">
                            <LogOut className="w-4 h-4" /> Sign Out
                        </button>
                        <button className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-slate-600 hover:text-red-500 hover:bg-red-500/5 transition-all font-black text-xs uppercase tracking-widest border border-transparent">
                            <Trash2 className="w-4 h-4" /> Delete Account
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="lg:col-span-3 space-y-8">
                    {/* Profile Tab */}
                    {activeTab === 'profile' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Personal Info Card */}
                                <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 space-y-8">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                                            <Shield className="w-5 h-5 text-indigo-400" />
                                        </div>
                                        <h3 className="text-lg font-black text-white italic uppercase tracking-tight">Identity</h3>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Username</label>
                                            <div className="relative group">
                                                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                                                <input
                                                    type="text"
                                                    value={form.username}
                                                    onChange={e => setForm({ ...form, username: e.target.value })}
                                                    className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-bold focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Identity verification (ID Number)</label>
                                            <div className="relative group">
                                                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                                                <input
                                                    type="text"
                                                    value={form.idNumber}
                                                    onChange={e => setForm({ ...form, idNumber: e.target.value })}
                                                    placeholder="Required for PIN reset"
                                                    className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-bold focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-slate-700"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Email Address</label>
                                            <div className="relative">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                                                <input
                                                    type="email"
                                                    value={form.email}
                                                    disabled
                                                    className="w-full bg-white/[0.02] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-slate-500 text-sm font-bold cursor-not-allowed italic"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Contact Card */}
                                <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 space-y-8">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                            <Globe className="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <h3 className="text-lg font-black text-white italic uppercase tracking-tight">Location & Contact</h3>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Phone Number</label>
                                            <div className="relative group">
                                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                                                <input
                                                    type="tel"
                                                    value={form.phone}
                                                    onChange={e => setForm({ ...form, phone: e.target.value })}
                                                    className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-bold focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 outline-none transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Country</label>
                                            <div className="relative">
                                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                                <select
                                                    value={form.countryCode}
                                                    onChange={e => setForm({ ...form, countryCode: e.target.value })}
                                                    className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-bold focus:border-emerald-500/50 outline-none transition-all appearance-none"
                                                >
                                                    <option value="KE" className="bg-slate-900 font-bold">Kenya</option>
                                                    <option value="UG" className="bg-slate-900 font-bold">Uganda</option>
                                                    <option value="TZ" className="bg-slate-900 font-bold">Tanzania</option>
                                                    <option value="NG" className="bg-slate-900 font-bold">Nigeria</option>
                                                    <option value="SA" className="bg-slate-900 font-bold">South Africa</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Bio Card */}
                            <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                        <UserIcon className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <h3 className="text-lg font-black text-white italic uppercase tracking-tight">Biography</h3>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">About You</label>
                                    <textarea
                                        rows={4}
                                        value={form.bio}
                                        onChange={e => setForm({ ...form, bio: e.target.value })}
                                        placeholder="Tell us about yourself..."
                                        className="w-full bg-white/5 border border-white/5 rounded-[2rem] p-6 text-white text-sm font-bold focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/5 outline-none transition-all resize-none min-h-[150px]"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Appearance Tab */}
                    {activeTab === 'appearance' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Theme & Accent Card */}
                                <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 space-y-8">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                            <Palette className="w-5 h-5 text-purple-400" />
                                        </div>
                                        <h3 className="text-lg font-black text-white italic uppercase tracking-tight">Visual Style</h3>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Theme Mode</label>
                                            <div className="grid grid-cols-3 gap-3">
                                                {[
                                                    { value: 'light', label: 'Light', icon: Sun },
                                                    { value: 'dark', label: 'Dark', icon: Moon },
                                                    { value: 'auto', label: 'Auto', icon: Monitor }
                                                ].map((theme) => {
                                                    const Icon = theme.icon;
                                                    const isActive = appearance.theme === theme.value;
                                                    return (
                                                        <button
                                                            key={theme.value}
                                                            onClick={() => setAppearance({ ...appearance, theme: theme.value as 'light' | 'dark' | 'auto' })}
                                                            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-3 ${isActive
                                                                ? 'bg-indigo-500/20 border-indigo-500 text-white shadow-lg'
                                                                : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'
                                                                }`}
                                                        >
                                                            <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-400 fill-indigo-400/20' : ''}`} />
                                                            <span className="text-[10px] font-black uppercase tracking-widest">{theme.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Accent Highlighting</label>
                                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                                                {accentColors.map((color) => {
                                                    const isActive = appearance.accentColor === color.value;
                                                    return (
                                                        <button
                                                            key={color.value}
                                                            onClick={() => setAppearance({ ...appearance, accentColor: color.value })}
                                                            className={`aspect-square rounded-xl ${color.class} relative transition-all hover:scale-110 shadow-lg ${isActive ? 'ring-4 ring-white/30 scale-110 shadow-indigo-500/20' : 'opacity-60 hover:opacity-100'}`}
                                                            title={color.name}
                                                        >
                                                            {isActive && (
                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                    <div className="w-2.5 h-2.5 rounded-full bg-white shadow-xl"></div>
                                                                </div>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Font & Motion Card */}
                                <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 space-y-8">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                            <Monitor className="w-5 h-5 text-cyan-400" />
                                        </div>
                                        <h3 className="text-lg font-black text-white italic uppercase tracking-tight">Interface</h3>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Default Typography</label>
                                            <div className="grid grid-cols-3 gap-3">
                                                {[
                                                    { value: 'small', label: 'Small' },
                                                    { value: 'medium', label: 'Medium' },
                                                    { value: 'large', label: 'Large' }
                                                ].map((size) => {
                                                    const isActive = appearance.fontSize === size.value;
                                                    return (
                                                        <button
                                                            key={size.value}
                                                            onClick={() => setAppearance({ ...appearance, fontSize: size.value as 'small' | 'medium' | 'large' })}
                                                            className={`p-4 rounded-2xl border transition-all ${isActive
                                                                ? 'bg-cyan-500/20 border-cyan-500 text-white shadow-lg'
                                                                : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'
                                                                }`}
                                                        >
                                                            <span className="text-[10px] font-black uppercase tracking-widest">{size.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 flex items-center justify-between group hover:bg-white/[0.04] transition-colors">
                                            <div className="space-y-0.5">
                                                <p className="font-black text-white text-xs uppercase tracking-wider">Reduce Motion</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Optimize performance</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer scale-90">
                                                <input
                                                    type="checkbox"
                                                    checked={appearance.reducedMotion}
                                                    onChange={(e) => setAppearance({ ...appearance, reducedMotion: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notifications Tab */}
                    {activeTab === 'notifications' && (
                        <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 space-y-8 animate-fade-in">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <Bell className="w-5 h-5 text-amber-500" />
                                </div>
                                <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Notification Channels</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    { id: 'email', label: 'Email Reports', desc: 'Orders & Newsletters', icon: Mail, color: 'text-indigo-400' },
                                    { id: 'push', label: 'Live Alerts', desc: 'Messages & Status', icon: Bell, color: 'text-amber-400' },
                                    { id: 'sms', label: 'Direct SMS', desc: 'Secure Codes & Keys', icon: Smartphone, color: 'text-emerald-400' },
                                    { id: 'marketing', label: 'Promotions', desc: 'Exclusive Offers', icon: StarIcon, color: 'text-purple-400' }
                                ].map((item) => {
                                    const Icon = item.icon as any;
                                    return (
                                        <div key={item.id} className="flex items-center justify-between p-6 rounded-[2rem] bg-white/[0.02] border border-white/10 group hover:border-white/20 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center ${item.color} shadow-inner`}>
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-black text-white text-xs uppercase tracking-wider">{item.label}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{item.desc}</p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer scale-90">
                                                <input
                                                    type="checkbox"
                                                    checked={notifications[item.id as keyof typeof notifications]}
                                                    onChange={(e) => setNotifications({ ...notifications, [item.id]: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Security Tab */}
                    {activeTab === 'security' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* PIN Management Section */}
                            <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 space-y-8">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                                        <Shield className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <h3 className="text-lg font-black text-white italic uppercase tracking-tight">Financial Security</h3>
                                </div>

                                <div className="bg-gradient-to-tr from-indigo-500/20 to-teal-400/5 p-8 rounded-[2rem] border border-white/10 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                    <div className="flex items-center gap-6 relative">
                                        <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 shadow-2xl">
                                            <Lock className="w-8 h-8 text-indigo-400" />
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-lg font-black text-white uppercase tracking-tighter italic">Transfer Authorization PIN</h4>
                                            <p className="text-sm font-medium text-indigo-200/60 max-w-sm">
                                                {isPinSet ? "Authorization PIN is securely stored and configured." : "Protect your funds. A PIN is required for all transfers."}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setShowPinModal(true)}
                                        className="w-full md:w-auto px-10 py-4 rounded-[1.25rem] bg-white text-slate-950 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-500 hover:text-white transition-all shadow-2xl active:scale-95 shrink-0"
                                    >
                                        {isPinSet ? "Change Secure PIN" : "Initialize PIN"}
                                    </button>
                                </div>
                            </div>

                            {/* Additional Security Options Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <button
                                    onClick={() => setShowPasswordModal(true)}
                                    className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 hover:border-white/20 rounded-[2.5rem] p-8 text-left transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-white transition-colors">
                                            <Lock className="w-6 h-6" />
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                            <ChevronRight className="w-4 h-4 text-indigo-400" />
                                        </div>
                                    </div>
                                    <h4 className="text-lg font-black text-white uppercase italic tracking-tight mb-2">Login Password</h4>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Update your primary account access key</p>
                                </button>

                                <button className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 hover:border-emerald-500/20 rounded-[2.5rem] p-8 text-left transition-all group">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 transition-colors">
                                            <Shield className="w-6 h-6" />
                                        </div>
                                        <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-black uppercase tracking-widest text-emerald-500">
                                            Coming Soon
                                        </div>
                                    </div>
                                    <h4 className="text-lg font-black text-white uppercase italic tracking-tight mb-2">Two-Factor Auth</h4>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Add secondary biometric or TOTP protection</p>
                                </button>
                            </div>

                            {/* Sessions Card */}
                            <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-black text-white italic uppercase tracking-tight">Active Sessions</h3>
                                    <button className="text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:text-white transition-colors">Sign Out All</button>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-5 rounded-[1.5rem] bg-white/[0.02] border border-white/5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-500">
                                                <Monitor className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-white uppercase italic tracking-tight">Chrome on Desktop</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Nairobi, Kenya • Active now</p>
                                            </div>
                                        </div>
                                        <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[8px] font-black text-indigo-400 tracking-widest uppercase">
                                            THIS DEVICE
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Privacy Tab */}
                    {activeTab === 'privacy' && (
                        <div className="bg-slate-950/40 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] p-8 space-y-8 animate-fade-in">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                    <Eye className="w-5 h-5 text-cyan-400" />
                                </div>
                                <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Stealth & Privacy</h3>
                            </div>

                            <div className="space-y-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Profile Discovery</label>
                                    <div className="relative group">
                                        <Eye className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                                        <select
                                            value={privacy.profileVisibility}
                                            onChange={e => setPrivacy({ ...privacy, profileVisibility: e.target.value as 'public' | 'friends' | 'private' })}
                                            className="w-full bg-white/5 border border-white/5 rounded-[1.5rem] py-5 pl-14 pr-6 text-white text-sm font-bold focus:border-cyan-500/50 outline-none transition-all appearance-none"
                                        >
                                            <option value="public" className="bg-slate-900 font-bold uppercase">Public - Visible to all</option>
                                            <option value="friends" className="bg-slate-900 font-bold uppercase">Friends Only</option>
                                            <option value="private" className="bg-slate-900 font-bold uppercase">Strictly Private</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { id: 'showEmail', label: 'Email Visibility', desc: 'Allow email on public profile' },
                                        { id: 'showPhone', label: 'Phone Discovery', desc: 'Let others find you by number' },
                                        { id: 'activityStatus', label: 'Online Status', desc: 'Display last seen information' }
                                    ].map((item) => (
                                        <div key={item.id} className="flex items-center justify-between p-6 rounded-[2rem] bg-white/[0.02] border border-white/10 group hover:border-white/20 transition-all">
                                            <div className="space-y-0.5">
                                                <p className="font-black text-white text-xs uppercase tracking-wider">{item.label}</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{item.desc}</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer scale-90">
                                                <input
                                                    type="checkbox"
                                                    checked={privacy[item.id as keyof typeof privacy] as boolean}
                                                    onChange={(e) => setPrivacy({ ...privacy, [item.id]: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Final Action Bar */}
                    <div className="flex items-center justify-between pt-6 border-t border-white/5">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] italic">Changes will be synchronized globally</p>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="flex items-center gap-4 px-12 py-4 rounded-[1.5rem] bg-white text-slate-950 font-black uppercase tracking-[0.2em] text-xs hover:bg-indigo-500 hover:text-white transition-all shadow-2xl active:scale-95 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Commit Changes
                        </button>
                    </div>
                </div>
            </div>

            {/* Password Change Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fade-in">
                    <div className="bg-slate-950/80 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-10 w-full max-w-md relative shadow-[0_0_100px_rgba(0,0,0,0.5)] border-white/5">
                        <button
                            onClick={() => setShowPasswordModal(false)}
                            className="absolute top-8 right-8 p-3 rounded-full bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white transition-all group"
                        >
                            <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                        </button>

                        <div className="mb-10 text-center">
                            <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-500/20 flex items-center justify-center mx-auto mb-6 border border-indigo-500/30">
                                <Lock className="w-8 h-8 text-indigo-400" />
                            </div>
                            <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">Access Key</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Enter current and new credentials</p>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Current Password</label>
                                <input
                                    type="password"
                                    value={passwordForm.currentPassword}
                                    onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm font-bold focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-700"
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">New Secure Password</label>
                                <input
                                    type="password"
                                    value={passwordForm.newPassword}
                                    onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm font-bold focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-700"
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Confirm Identity</label>
                                <input
                                    type="password"
                                    value={passwordForm.confirmPassword}
                                    onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm font-bold focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-700"
                                    placeholder="••••••••"
                                />
                            </div>

                            <button
                                onClick={handleChangePassword}
                                disabled={loading}
                                className="w-full py-5 rounded-[1.5rem] bg-white text-slate-950 font-black uppercase tracking-[0.2em] text-xs hover:bg-indigo-500 hover:text-white transition-all flex items-center justify-center gap-3 mt-8 shadow-2xl active:scale-95"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                Commit Password
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PIN Action Modal */}
            {showPinModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fade-in">
                    <div className="bg-slate-950/80 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-10 w-full max-w-md relative shadow-[0_0_100px_rgba(0,0,0,0.5)] border-white/5">
                        <button
                            onClick={() => setShowPinModal(false)}
                            className="absolute top-8 right-8 p-3 rounded-full bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white transition-all group"
                        >
                            <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                        </button>

                        <div className="mb-10 text-center">
                            <div className={`w-16 h-16 rounded-[1.5rem] ${isResetingPin ? 'bg-amber-500/20 border-amber-500/30' : 'bg-emerald-500/20 border-emerald-500/30'} flex items-center justify-center mx-auto mb-6 border transition-colors`}>
                                <Shield className={`w-8 h-8 ${isResetingPin ? 'text-amber-400' : 'text-emerald-400'}`} />
                            </div>
                            <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">
                                {isResetingPin ? "Reset PIN" : (isPinSet ? "Sync PIN" : "Initiate PIN")}
                            </h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
                                {isResetingPin ? "Verify identity to reset" : "4-6 Digits required for transactions"}
                            </p>
                        </div>

                        <div className="space-y-6">
                            {isResetingPin ? (
                                <>
                                    <div className="space-y-3 text-center">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Identification Number</label>
                                        <input
                                            type="text"
                                            value={resetPinForm.idNumber}
                                            onChange={e => setResetPinForm({ ...resetPinForm, idNumber: e.target.value })}
                                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 text-center text-white text-sm font-bold focus:border-amber-500/50 outline-none transition-all placeholder:text-slate-700"
                                            placeholder="Enter your ID Number"
                                        />
                                    </div>
                                    <div className="space-y-3 text-center">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">New Secure PIN</label>
                                        <input
                                            type="password"
                                            value={resetPinForm.newPin}
                                            onChange={e => setResetPinForm({ ...resetPinForm, newPin: e.target.value })}
                                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-5 text-center text-white text-3xl tracking-[0.5em] font-black focus:border-amber-500/50 outline-none transition-all placeholder:text-slate-800"
                                            placeholder="••••"
                                            maxLength={6}
                                        />
                                    </div>
                                    <div className="space-y-3 text-center">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Verify PIN</label>
                                        <input
                                            type="password"
                                            value={resetPinForm.confirmPin}
                                            onChange={e => setResetPinForm({ ...resetPinForm, confirmPin: e.target.value })}
                                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-5 text-center text-white text-3xl tracking-[0.5em] font-black focus:border-amber-500/50 outline-none transition-all placeholder:text-slate-800"
                                            placeholder="••••"
                                            maxLength={6}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={handlePinReset}
                                            disabled={loading}
                                            className="w-full py-5 rounded-[1.5rem] bg-white text-slate-950 font-black uppercase tracking-[0.2em] text-xs hover:bg-amber-500 hover:text-white transition-all flex items-center justify-center gap-3 mt-4 shadow-2xl active:scale-95"
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                                            Commit Reset
                                        </button>
                                        <button
                                            onClick={() => setIsResetingPin(false)}
                                            className="w-full py-3 text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
                                        >
                                            Back to Login
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {isPinSet && (
                                        <div className="space-y-3 text-center">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Active PIN</label>
                                            <input
                                                type="password"
                                                value={pinForm.oldPin}
                                                onChange={e => setPinForm({ ...pinForm, oldPin: e.target.value })}
                                                className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-5 text-center text-white text-3xl tracking-[0.5em] font-black focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-800"
                                                placeholder="••••"
                                                maxLength={6}
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-3 text-center">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{isPinSet ? "Fresh PIN" : "New Secure PIN"}</label>
                                        <input
                                            type="password"
                                            value={pinForm.newPin}
                                            onChange={e => setPinForm({ ...pinForm, newPin: e.target.value })}
                                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-5 text-center text-white text-3xl tracking-[0.5em] font-black focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-800"
                                            placeholder="••••"
                                            maxLength={6}
                                        />
                                    </div>
                                    <div className="space-y-3 text-center">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Verify PIN</label>
                                        <input
                                            type="password"
                                            value={pinForm.confirmPin}
                                            onChange={e => setPinForm({ ...pinForm, confirmPin: e.target.value })}
                                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-5 text-center text-white text-3xl tracking-[0.5em] font-black focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-800"
                                            placeholder="••••"
                                            maxLength={6}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={handlePinAction}
                                            disabled={loading}
                                            className="w-full py-5 rounded-[1.5rem] bg-white text-slate-950 font-black uppercase tracking-[0.2em] text-xs hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-3 mt-4 shadow-2xl active:scale-95"
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                            {isPinSet ? "COMMIT UPDATE" : "SAVE SESSION"}
                                        </button>
                                        {isPinSet && (
                                            <button
                                                onClick={() => setIsResetingPin(true)}
                                                className="w-full py-3 text-slate-500 hover:text-indigo-400 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 group"
                                            >
                                                <Smartphone className="w-3 h-3 group-hover:animate-bounce" />
                                                Forgot PIN? Use ID Identity
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
