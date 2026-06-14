import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle2, Truck, Package, MapPin,
  Phone, MessageCircle, User, Star
} from 'lucide-react';
import { getOrderTracking } from "../../api/order.api";

export default function OrderTracking() {
  const { id } = useParams();
  const [tracking, setTracking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        const data = await getOrderTracking(id);
        setTracking(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [id]);

  if (loading) return <div className="h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-500"></div></div>;
  if (!tracking) return <div className="p-20 text-center text-white">Order not found</div>;

  const { order, agent } = tracking;
  const steps = [
    { status: 'pending', label: 'Order Placed', icon: Package },
    { status: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
    { status: 'picked_up', label: 'Picked Up', icon: Truck },
    { status: 'delivered', label: 'Delivered', icon: MapPin },
  ];

  const currentStepIdx = steps.findIndex(s => s.status === order.status);
  const activeStepIdx = currentStepIdx === -1 ? 0 : currentStepIdx;

  return (
    <div className="max-w-6xl mx-auto pb-20 animate-fade-in text-white space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link to="/buyer/orders" className="text-slate-500 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest">Orders</Link>
            <span className="text-slate-600">/</span>
            <span className="text-indigo-400 font-bold uppercase tracking-widest text-sm">#{order._id?.slice(-8)}</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Track Your Order</h1>
          <p className="text-slate-500 font-medium mt-1">Estimated Delivery: <span className="text-white">Today, 2:00 PM - 4:00 PM</span></p>
        </div>

        {agent && (
          <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 overflow-hidden">
                {agent.avatar ? (
                  <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6" />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-[#1a1a1a]"></div>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Delivery Agent</p>
              <p className="font-bold text-white">{agent.name || 'John Doe'}</p>
              <div className="flex items-center gap-1 text-amber-400 text-xs font-black">
                <Star className="w-3 h-3 fill-amber-400" />
                <span>4.8</span>
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              <button className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                <Phone className="w-4 h-4" />
              </button>
              <button className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                <MessageCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Progress Bar */}
          <div className="relative flex justify-between px-4 pb-8 border-b border-white/5">
            <div className="absolute top-5 left-4 right-4 h-1 bg-white/10 -z-10 rounded-full"></div>
            <div className={`absolute top-5 left-4 h-1 bg-green-500 -z-10 rounded-full transition-all duration-1000`} style={{ width: `${(activeStepIdx / (steps.length - 1)) * 100}%` }}></div>

            {steps.map((step, idx) => {
              const isActive = idx <= activeStepIdx;
              const isCurrent = idx === activeStepIdx;
              return (
                <div key={idx} className="flex flex-col items-center gap-4 relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 transition-all z-10 ${isActive
                    ? 'bg-green-500 border-[#0a0a0a] text-white shadow-[0_0_20px_rgba(34,197,94,0.4)]'
                    : 'bg-[#1a1a1a] border-slate-700 text-slate-600'
                    }`}>
                    <step.icon className="w-4 h-4" />
                  </div>
                  <span className={`text-xs font-black uppercase tracking-widest absolute top-12 whitespace-nowrap ${isActive ? 'text-white' : 'text-slate-600'
                    }`}>
                    {step.label}
                  </span>
                  {isCurrent && (
                    <span className="absolute top-16 px-2 py-1 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-full animate-pulse border border-green-500/20">
                      In Progress
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="aspect-video bg-slate-800 rounded-[2.5rem] relative overflow-hidden group">
            <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/36.8219,-1.2921,13,0/800x600?access_token=pk.xxx')] bg-cover bg-center grayscale opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-2xl flex items-center gap-3 border border-white/10">
                <MapPin className="w-5 h-5 text-indigo-400" />
                <span className="text-white font-bold text-sm">Live Location Preview</span>
              </div>
            </div>
            {/* Simulated Rider */}
            <div className="absolute top-1/2 left-1/2 -translate-x-10 -translate-y-10">
              <div className="w-4 h-4 rounded-full bg-blue-500 shadow-[0_0_0_8px_rgba(59,130,246,0.3)] animate-ping"></div>
            </div>
          </div>
        </div>

        <div className="glass-dark p-8 rounded-[2.5rem] border border-white/5 space-y-6 h-fit sticky top-24">
          <h3 className="text-xl font-black text-white">Order Items</h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
            {order.items?.map((item: any, i: number) => (
              <div key={i} className="flex gap-4 items-center p-3 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="w-16 h-16 rounded-xl bg-white/10 overflow-hidden flex-shrink-0">
                  <img src={item.image || '/placeholder.png'} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm line-clamp-1">{item.name}</p>
                  <p className="text-xs text-slate-500 mt-1">QTY: {item.qty || item.quantity} × {order.currency === 'Mallcoins' ? '' : 'KES '} {item.price} {order.currency === 'Mallcoins' ? 'MLCNS' : ''}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t border-white/5 space-y-3">
            <div className="flex justify-between text-lg font-black text-white pt-2">
              <span>Total</span>
              <span>{order.currency === 'Mallcoins' ? '' : 'KES '} {(order.total || 0).toLocaleString()} {order.currency === 'Mallcoins' ? 'MLCNS' : ''}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
