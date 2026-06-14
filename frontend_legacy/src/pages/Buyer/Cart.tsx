import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Minus, Plus, Trash2, ArrowRight, ShoppingBag, ShieldCheck
} from 'lucide-react';
import { syncCart } from "../../api/order.api";
import { useUserStore } from "../../store/userStore";
import { getCart, setCart as setCartStorage } from "../../utils/storage";

export default function Cart() {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const [cart, setCart] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load and on user change
    const saved = getCart(user?.id || user?._id);
    setCart(saved);
    setLoading(false);
  }, [user]);

  function updateQuantity(id: string, delta: number) {
    const newCart = cart.map(item => {
      if (item.id === id) {
        return { ...item, quantity: Math.max(1, (item.quantity || 1) + delta) };
      }
      return item;
    });
    setCart(newCart);
    setCartStorage(newCart, user?.id || user?._id);
    syncCart(newCart).catch(console.error);
  }

  function removeItem(id: string) {
    const newCart = cart.filter(item => item.id !== id);
    setCart(newCart);
    setCartStorage(newCart, user?.id || user?._id);
    syncCart(newCart).catch(console.error);
  }

  const subtotal = cart.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
  const shipping = subtotal > 5000 ? 0 : 250;
  const total = subtotal + shipping;

  if (loading) return null;

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center pb-20">
        <div className="w-20 h-20 bg-[#0a0a0a] rounded-full border border-white/5 flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/10">
          <ShoppingBag className="w-8 h-8 text-slate-500" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Your Cart is Empty</h2>
        <p className="text-slate-500 mb-8 font-medium max-w-xs mx-auto">Looks like you haven't added anything yet.</p>
        <Link
          to="/buyer/browse"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-500 transition-all uppercase tracking-widest text-xs shadow-lg shadow-indigo-500/20"
        >
          Start Shopping <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-20 animate-fade-in">
      <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-8 flex items-center gap-3">
        Shopping Cart <span className="text-slate-500 text-xl font-medium">({cart.length} items)</span>
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Cart Items */}
        <div className="lg:col-span-8 space-y-4">
          {cart.map((item) => (
            <div key={item.id} className="flex flex-col sm:flex-row gap-6 p-4 rounded-2xl glass-dark border border-white/5 items-start sm:items-center group hover:border-indigo-500/30 transition-colors">
              <div className="w-24 h-24 bg-white/5 rounded-xl overflow-hidden flex-shrink-0 border border-white/5 relative">
                <img
                  src={
                    (item.images && item.images.length > 0)
                      ? (typeof item.images[0] === 'string' ? item.images[0] : (item.images[0] as any).url)
                      : '/placeholder.png'
                  }
                  alt={item.title || item.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/200x200/1e293b/white?text=No+Image';
                  }}
                />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <Link to={`/buyer/product/${item.id}`} className="font-bold text-white text-base truncate hover:text-indigo-400 transition-colors block">
                  {item.title || item.name}
                </Link>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{item.condition || 'New'}</p>
                <p className="text-slate-400 text-xs font-medium">Unit Price: KES {(item.price || 0).toLocaleString()}</p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto mt-4 sm:mt-0">
                <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/5">
                  <button
                    onClick={() => updateQuantity(item.id, -1)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center font-bold text-white text-sm">{item.quantity || 1}</span>
                  <button
                    onClick={() => updateQuantity(item.id, 1)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-right min-w-[100px]">
                  <p className="text-lg font-black text-white">KES {((item.price || 0) * (item.quantity || 1)).toLocaleString()}</p>
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="lg:col-span-4">
          <div className="glass-dark p-6 md:p-8 rounded-[2rem] border border-white/5 space-y-6 sticky top-24">
            <h3 className="text-lg font-black text-white uppercase tracking-wider">Order Summary</h3>

            <div className="space-y-3 pb-6 border-b border-white/5">
              <div className="flex justify-between text-sm font-medium text-slate-400">
                <span>Subtotal</span>
                <span className="text-white font-bold">KES {(subtotal || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-medium text-slate-400">
                <span>Shipping</span>
                <span className="text-emerald-400 font-bold">{shipping === 0 ? 'Free' : `KES ${shipping}`}</span>
              </div>
            </div>

            <div className="flex justify-between items-end">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total</span>
              <span className="text-3xl font-black text-white">KES {(total || 0).toLocaleString()}</span>
            </div>

            <button
              onClick={() => navigate('/buyer/checkout')}
              className="w-full py-4 rounded-xl bg-white text-black font-black text-sm uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all flex items-center justify-center gap-2 group active:scale-[0.98] shadow-xl"
            >
              Checkout <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-600 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Secure Checkout</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
