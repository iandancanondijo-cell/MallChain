import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingBag,
  Package,
  Clock,
  ArrowRight,
  Heart,
  CreditCard,
  MapPin,
  Settings,
  LogOut,
  ChevronRight,
  TrendingUp,
  Truck,
  CheckCircle,
  AlertCircle,
  User,
  Activity,
  Calendar
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";
import { useUserStore } from "../../store/userStore";
import { listOrders } from "../../api/order.api";
import { getCart, getWishlist } from "../../utils/storage";
import type { Order } from "../../types";
import StatCard from "../../components/dashboard/StatCard";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function BuyerDashboard() {
  const { user, logout } = useUserStore();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    cartCount: 0,
    wishlistCount: 0,
    activeOrders: 0,
    totalSpent: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        // Load active data
        const ordersData = await listOrders().catch(() => []);
        setOrders(ordersData);

        // Calculate stats
        const active = ordersData.filter(o => !['delivered', 'cancelled', 'returned'].includes(o.status.toLowerCase())).length;
        const spent = ordersData.reduce((acc, o) => acc + o.total, 0);

        const cart = getCart(user?.id || user?._id);
        const wishlist = getWishlist(user?.id || user?._id);

        setStats({
          cartCount: cart.length,
          wishlistCount: wishlist.length,
          activeOrders: active,
          totalSpent: spent
        });

        // Prepare chart data (Last 7 days spending or orders)
        // Group orders by date
        const last7Days = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return d.toISOString().split('T')[0];
        });

        const chartData = last7Days.map(date => {
          const dayOrders = ordersData.filter(o => o.createdAt.startsWith(date));
          const daySpent = dayOrders.reduce((acc, o) => acc + o.total, 0);
          return {
            day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
            spent: daySpent
          };
        });
        setChartData(chartData);

      } catch (error) {
        console.error("Failed to load dashboard data", error);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      loadData();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <LoadingSpinner size="lg" text="Loading your dashboard..." />
      </div>
    );
  }

  const recentOrders = orders.slice(0, 5);

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 mb-1">
            <User className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{user?.role || 'Valued Customer'}</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">Buyer <span className="bg-gradient-premium bg-clip-text text-transparent">Command</span></h1>
          <p className="text-slate-500 font-medium">Manage your orders, track shipments, and discover new products.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/buyer/browse" className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-slate-300 text-xs font-black hover:bg-white/10 transition-all uppercase tracking-widest group">
            <ShoppingBag className="w-4 h-4 group-hover:text-indigo-400 transition-colors" />
            Browse Market
          </Link>
          <button onClick={() => navigate('/settings')} className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-500 text-white text-xs font-black hover:bg-indigo-600 transition-all uppercase tracking-widest shadow-lg shadow-indigo-500/20">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Orders"
          value={stats.activeOrders}
          icon={Package}
          color="indigo"
          trend={{ value: 'Tracking', isPositive: true }}
        />
        <StatCard
          title="Total Spent"
          value={`KES ${(stats.totalSpent / 1000).toFixed(1)}k`}
          icon={CreditCard}
          color="indigo"
          trend={{ value: 'Lifetime', isPositive: true }}
        />
        <StatCard
          title="Wishlist"
          value={stats.wishlistCount}
          icon={Heart}
          color="indigo"
        />
        <StatCard
          title="Mall Points"
          value={user?.mallPoints || 0}
          icon={Activity}
          color="indigo"
          trend={{ value: 'Rewards', isPositive: true }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content Area (Chart + Orders) */}
        <div className="lg:col-span-8 space-y-8">

          {/* Spending Chart */}
          <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-indigo-500/5 to-transparent">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                <h3 className="text-xl font-black text-white tracking-tight">Spending Activity</h3>
              </div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Last 7 Days
              </div>
            </div>

            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke="#ffffff20"
                    fontSize={10}
                    fontWeight="900"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#ffffff20"
                    fontSize={10}
                    fontWeight="900"
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `K${val / 1000}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0a0a0c',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '20px',
                      boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                    }}
                    itemStyle={{ fontSize: '11px', fontWeight: '900', color: '#6366f1' }}
                    labelStyle={{ color: '#64748b', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="spent"
                    stroke="#6366f1"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorSpent)"
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Orders List */}
          <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-indigo-400" />
                <h3 className="text-xl font-black text-white tracking-tight">Recent Orders</h3>
              </div>
              <Link to="/buyer/orders" className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 uppercase tracking-wider">
                View All History <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-4">
              {recentOrders.length > 0 ? (
                recentOrders.map(order => (
                  <div key={order._id || order.id} className="group flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 border border-white/5 group-hover:scale-110 transition-transform">
                        <Package className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white mb-0.5 group-hover:text-indigo-400 transition-colors">
                          Order #{order.id?.slice(-6) || order._id?.slice(-6)}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                          <Calendar className="w-3 h-3" />
                          {new Date(order.createdAt).toLocaleDateString()}
                          <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                          <span>{order.items.length} Items</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto mt-2 md:mt-0">
                      <OrderStatusBadge status={order.status} />
                      <div className="text-right">
                        <p className="text-sm font-black text-white">KES {order.total.toLocaleString()}</p>
                      </div>
                      <Link to={`/buyer/orders/${order.id || order._id}`} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 hover:bg-indigo-500 hover:text-white transition-all">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center">
                  <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">No recent orders found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Side Column - Wallet & Quick Actions */}
        <div className="lg:col-span-4 space-y-8">

          {/* Wallet Card */}
          <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-8 relative overflow-hidden group">
            <div className="absolute -right-12 -top-12 w-40 h-40 bg-indigo-500/5 blur-[80px] group-hover:bg-indigo-500/10 transition-colors duration-700"></div>

            <div className="flex items-center gap-3 relative z-10">
              <CreditCard className="w-5 h-5 text-indigo-400" />
              <h3 className="text-xl font-black text-white tracking-tight">Wallet Balance</h3>
            </div>

            <div className="relative z-10 space-y-6">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/5 text-white shadow-2xl shadow-indigo-500/5">
                <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2 text-slate-500">Total Balance</p>
                <div className="text-3xl font-black mb-6 text-white">
                  KES 0.00
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Mall Points</p>
                    <p className="font-black text-indigo-400">{user?.mallPoints || 0} MP</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Mall Coins</p>
                    <p className="font-black text-indigo-400">{user?.mallCoins || 0} MC</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Link to="/wallet" className="py-3 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 font-black text-xs uppercase tracking-widest text-center transition-all shadow-lg shadow-indigo-500/20">
                  Top Up
                </Link>
                <Link to="/wallet" className="py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-black uppercase tracking-widest text-center text-white transition-all">
                  History
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-6">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-black text-white tracking-tight">Quick Actions</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <Link to="/settings" className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 transition-colors">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-white uppercase tracking-tighter">Addresses</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-all transform group-hover:translate-x-1" />
              </Link>
              <button onClick={() => logout()} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 hover:bg-white/[0.05] transition-all group w-full">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-white transition-colors">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-white uppercase tracking-tighter group-hover:text-white">Sign Out</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let color = "bg-slate-500/10 text-slate-400 border-slate-500/20";
  let icon = Clock;

  if (s === 'delivered') { color = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"; icon = CheckCircle; }
  else if (s === 'processing') { color = "bg-blue-500/10 text-blue-400 border-blue-500/20"; icon = Package; }
  else if (s === 'shipped') { color = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"; icon = Truck; }
  else if (s === 'cancelled') { color = "bg-red-500/10 text-red-400 border-red-500/20"; icon = AlertCircle; }

  const Icon = icon;

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${color} w-fit`}>
      <Icon className="w-3 h-3" />
      <span className="text-[10px] font-black uppercase tracking-widest">{status}</span>
    </div>
  );
}
