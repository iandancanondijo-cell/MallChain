import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Package, Clock, ChevronRight, Search, ExternalLink } from 'lucide-react';
import { listOrders } from "../../api/order.api";
import type { Order } from "../../types";

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function load() {
      try {
        const data = await listOrders();
        setOrders(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  if (loading) return <div className="h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-500"></div></div>;

  return (
    <div className="pb-20 animate-fade-in text-white">
      <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight mb-2">My Orders</h1>
          <p className="text-slate-500 font-medium">Track and manage your purchase history.</p>
        </div>

        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
          {['all', 'pending', 'processing', 'delivered'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${filter === status ? 'bg-white text-black' : 'text-slate-500 hover:text-white'
                }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-[2.5rem] border border-white/5">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Package className="w-10 h-10 text-slate-600" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No orders found</h3>
          <p className="text-slate-500 mb-8 max-w-xs mx-auto">Start shopping to fill your history with amazing items.</p>
          <Link
            to="/buyer/browse"
            className="px-8 py-3 rounded-xl bg-indigo-500 text-white font-bold hover:bg-indigo-600 transition-all uppercase tracking-widest text-xs"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map(order => (
            <div key={order._id} className="group p-6 rounded-[2rem] bg-white/5 border border-white/5 hover:border-white/10 transition-all">
              <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                    <Package className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">Order #{order._id?.toString().slice(-8)}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${order.status === 'delivered' ? 'bg-green-500/10 text-green-400' :
                    order.status === 'processing' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-amber-500/10 text-amber-400'
                    }`}>
                    {order.status}
                  </span>
                  <Link
                    to={`/buyer/orders/${order._id}`}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-indigo-50 transition-all active:scale-95"
                  >
                    Track Order <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              <div className="pl-0 md:pl-[4.5rem] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {order.items?.slice(0, 3).map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden flex-shrink-0">
                      <img src={item.image || '/placeholder.png'} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-200 truncate">{item.name}</p>
                      <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                    </div>
                  </div>
                ))}
                {order.items?.length > 3 && (
                  <div className="flex items-center justify-center text-xs font-bold text-slate-500 uppercase tracking-widest bg-white/[0.02] rounded-xl border border-white/5">
                    +{order.items.length - 3} More Items
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
