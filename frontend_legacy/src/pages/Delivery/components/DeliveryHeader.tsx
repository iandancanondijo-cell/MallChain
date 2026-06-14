import { useUserStore } from "../../../store/userStore";
import { LogOut, Bell, User } from "lucide-react";
import { Link } from "react-router-dom";

export default function DeliveryHeader() {
  const { user, logout } = useUserStore();

  return (
    <header className="h-24 px-8 flex items-center justify-between bg-slate-950/30 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40">
      <div className="flex flex-col">
        <h1 className="text-2xl font-black text-white tracking-tight">
          Hey <span className="text-indigo-400">{user?.fullName?.split(' ')[0] || 'Agent'}</span> 👋
        </h1>
        <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Ready for your next delivery?</p>
      </div>

      <div className="flex items-center gap-6">
        {/* Status Indicator */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Online</span>
        </div>

        <div className="h-8 w-[1px] bg-white/5 mx-2"></div>

        <div className="flex items-center gap-4">
          <button className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 transition-all border border-white/5">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full border-2 border-slate-950"></span>
          </button>

          <Link to="/settings" className="w-12 h-12 rounded-xl bg-gradient-premium p-[1px] group transition-transform hover:scale-105 active:scale-95">
            <div className="w-full h-full rounded-[11px] bg-slate-950 flex items-center justify-center overflow-hidden">
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-slate-400" />
              )}
            </div>
          </Link>

          <button
            onClick={() => logout()}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-all border border-red-500/20"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
