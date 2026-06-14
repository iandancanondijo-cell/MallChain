import { useEffect, useState } from 'react';
import { getSellerOrders, updateOrderStatus } from '../../api/seller.api';
import type { Order } from '../../types';
import {
  Package,
  Clock,
  Truck,
  Loader2,
  Search,
  Eye,
  DollarSign,
  ChevronDown,
  RefreshCw,
  MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';

const ORDER_STATUSES = [
  { value: 'pending_payment', label: 'Pending Payment', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  { value: 'paid', label: 'Paid', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { value: 'packed', label: 'Packed', color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
  { value: 'assigned', label: 'Assigned', color: 'text-violet-400', bg: 'bg-violet-400/10' },
  { value: 'in_transit', label: 'In Transit', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { value: 'delivered', label: 'Delivered', color: 'text-green-400', bg: 'bg-green-400/10' },
  { value: 'cancelled', label: 'Cancelled', color: 'text-red-400', bg: 'bg-red-400/10' },
];

export default function SellerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getSellerOrders();
      setOrders(data);
    } catch (error: any) {
      toast.error('Failed to load orders');
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success('Order status updated');
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status: newStatus } : o));
    } catch (e) {
      toast.error('Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesFilter = filter === 'all' || order.status === filter;
    const matchesSearch =
      (order._id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.buyerName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: orders.length,
    pending: orders.filter(o => ['pending_payment', 'paid'].includes(o.status)).length,
    processing: orders.filter(o => ['packed', 'assigned'].includes(o.status)).length,
    shipped: orders.filter(o => o.status === 'in_transit').length,
    revenue: orders.reduce((sum, o) => sum + (o.total || 0), 0)
  };

  const getStatusColor = (status: string) => {
    const s = ORDER_STATUSES.find(os => os.value === status);
    return s ? `${s.bg} ${s.color} border-${s.color.split('-')[1]}-500/20` : 'bg-white/5 text-slate-400 border-white/5';
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className="text-slate-400 font-medium animate-pulse">Fetching orders...</p>
      </div>
    );
  }

  return (
    <div className="pb-20 animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">Sales Orders</h1>
          <p className="text-slate-400 font-medium mt-1">Manage and fulfill customer orders in real-time</p>
        </div>
        <button
          onClick={() => fetchOrders(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="text-sm font-bold">Refresh</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {[
          { label: 'Total', value: stats.total, icon: Package, color: 'text-indigo-400' },
          { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-400' },
          { label: 'Processing', value: stats.processing, icon: RefreshCw, color: 'text-blue-400' },
          { label: 'Shipped', value: stats.shipped, icon: Truck, color: 'text-purple-400' },
          { label: 'Revenue', value: `KES ${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-green-400' }
        ].map((stat, i) => (
          <div key={i} className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6 hover:border-white/10 transition-colors group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
                <p className="text-3xl font-black text-white mt-2 group-hover:scale-105 transition-transform origin-left">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by order ID or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/5 overflow-x-auto custom-scrollbar">
          {['all', ...ORDER_STATUSES.map(s => s.value)].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === status
                ? 'bg-white text-black shadow-xl shadow-white/10'
                : 'text-slate-500 hover:text-white hover:bg-white/5'
                }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-[#0a0a0a] border border-white/5 rounded-[3rem] p-20 flex flex-col items-center justify-center text-center">
            <div className="w-32 h-32 bg-white/5 rounded-full flex items-center justify-center mb-8">
              <Package className="w-12 h-12 text-slate-700" />
            </div>
            <h3 className="text-2xl font-black text-white">No orders found</h3>
            <p className="text-slate-500 mt-2 max-w-sm">
              {searchQuery ? 'Try adjusting your search criteria' : 'New orders from customers will appear here automatically'}
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div
              key={order._id}
              className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 hover:border-indigo-500/30 transition-all group"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                {/* Order Identity & Customer */}
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Package className="w-8 h-8 text-indigo-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-500">#{order._id?.slice(-8).toUpperCase()}</span>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${getStatusColor(order.status)}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors">
                      {order.buyerName || 'Premium Customer'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {order.items?.length || 0} items • Ordered {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Status Controls */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-right mr-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Amount</p>
                    <p className="text-2xl font-black text-white">KES {order.total?.toLocaleString()}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {order.buyerId && (
                      <button
                        onClick={() => navigate(`/chat/${order.buyerId}`)}
                        className="w-12 h-12 rounded-xl bg-white/5 hover:bg-emerald-500/10 border border-white/5 flex items-center justify-center transition-all group/chat"
                        title="Chat with Buyer"
                      >
                        <MessageCircle className="w-5 h-5 text-slate-400 group-hover/chat:text-emerald-400" />
                      </button>
                    )}
                    <div className="relative">
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusUpdate(order._id!, e.target.value)}
                        disabled={updatingId === order._id}
                        className="appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-xs font-black uppercase tracking-widest text-white hover:bg-white/10 outline-none cursor-pointer disabled:opacity-50 transition-all"
                      >
                        {ORDER_STATUSES.map(s => (
                          <option key={s.value} value={s.value} className="bg-slate-900 text-white">
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>

                    <Link
                      to={`/seller/orders/${order._id}`}
                      className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center transition-all group/btn"
                    >
                      <Eye className="w-5 h-5 text-slate-400 group-hover/btn:text-white" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Items Preview */}
              <div className="mt-8 pt-6 border-t border-white/5 flex flex-wrap gap-4">
                {(order.items || []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-black text-white">
                      {item.qty}x
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white max-w-[150px] truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-500">KES {item.price?.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


