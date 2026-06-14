import { useEffect, useState } from "react";
import {
  DollarSign,
  ShoppingBag,
  Package,
  TrendingUp,
  ArrowRight,
  Plus,
  Activity,
  BarChart3
} from 'lucide-react';
import { Link } from "react-router-dom";
import StatCard from "../../../components/dashboard/StatCard";
import { getSellerStats } from "../../../api";
import { getSellerOrders } from "../../../api/order.api";
import type { SellerStats, Order } from "../../../types";

export default function Overview() {
  const [stats, setStats] = useState<SellerStats>({
    totalSales: 0,
    totalOrders: 0,
    pendingOrders: 0,
    totalProducts: 0,
    activeProducts: 0
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, ordersData] = await Promise.all([
          getSellerStats(),
          getSellerOrders()
        ]);
        setStats(statsData);
        setRecentOrders(ordersData.slice(0, 5));
      } catch (e) {
        console.error("Failed to fetch seller data", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-tight">
            Shop <span className="text-indigo-400">Overview</span>
          </h2>
          <p className="text-slate-500 font-medium">Monitor your sales, inventory and shop performance.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/seller/products/new"
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-500 text-white font-black hover:bg-indigo-600 transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-5 h-5" />
            Add Product
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={`KES ${stats.totalSales.toLocaleString()}`}
          icon={DollarSign}
          color="green"
          trend={{ value: '24%', isPositive: true }}
        />
        <StatCard
          title="Active Products"
          value={stats.activeProducts}
          icon={ShoppingBag}
          color="blue"
        />
        <StatCard
          title="New Orders"
          value={stats.pendingOrders}
          icon={Package}
          color="amber"
          trend={{ value: '5', isPositive: true }}
        />
        <StatCard
          title="Total Orders"
          value={stats.totalOrders}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Recent Sales / Orders */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-black text-white tracking-tight">Recent Sales</h2>
            </div>
            <Link to="/seller/orders" className="text-sm font-bold text-indigo-400 hover:text-white transition-colors flex items-center gap-1 group">
              Full History <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="glass-dark rounded-[2.5rem] overflow-hidden border border-white/5">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Order</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Buyer</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Amount</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentOrders.length > 0 ? recentOrders.map((order) => (
                  <tr key={order._id} className="hover:bg-white/[0.02] transition-colors group cursor-pointer">
                    <td className="px-8 py-6">
                      <span className="text-sm font-bold text-white uppercase tracking-tighter">#{order._id?.toString().slice(-8)}</span>
                      <p className="text-[10px] text-slate-500 font-medium mt-1">
                        {new Date(order.createdAt || '').toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-200">{order.buyerName || 'Buyer'}</span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-tighter">{order.paymentMethod}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-sm font-black text-white">
                      KES {order.total?.toLocaleString()}
                    </td>
                    <td className="px-8 py-6">
                      <span className={`
                                                inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest
                                                ${order.status === 'paid' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}
                                            `}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
                      No sales recorded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Seller Analytics / Shortcuts */}
        <div className="lg:col-span-4 space-y-8">
          <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-indigo-500/5 to-transparent">
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-black text-white tracking-tight">Performance</h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-500">Order Completion</span>
                  <span className="text-indigo-400">92%</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 w-[92%]"></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-500">Customer Rating</span>
                  <span className="text-green-400">4.8/5</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 w-[85%]"></div>
                </div>
              </div>
            </div>

            <Link to="/seller/wallet" className="w-full mt-8 flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-black text-white hover:bg-white/10 transition-all group">
              MANAGE WALLET
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
