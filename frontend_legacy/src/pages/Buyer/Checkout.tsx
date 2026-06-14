import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CreditCard, MapPin, CheckCircle2, Loader2, Smartphone
} from 'lucide-react';
import { checkout, checkoutMallmoney, checkoutMallcoins } from "../../api/order.api";
import { getWallet } from "../../api/wallet.api";
import { Wallet } from "../../types";
import { useEffect } from "react";
import { toast } from "sonner";
import { Coins, Wallet as WalletIcon } from 'lucide-react';

export default function Checkout() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState({
    street: '', city: 'Nairobi', phone: ''
  });
  const [paymentMethod, setPaymentMethod] = useState('mpesa');

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
  const subtotal = cart.reduce((sum: number, item: any) => sum + (item.price * (item.quantity || 1)), 0);
  const shipping = 250;
  const total = subtotal + shipping;

  useEffect(() => {
    async function fetchBalance() {
      try {
        const w = await getWallet();
        setWallet(w);
      } catch (e) {
        console.warn("Failed to fetch wallet for checkout balance check");
      }
    }
    fetchBalance();
  }, []);

  async function handlePlaceOrder() {
    setLoading(true);
    try {
      let result: any;
      const orderData = {
        items: cart.map((i: any) => ({
          productId: i.id, // backend expects productId
          name: i.name || i.title,
          price: i.price,
          qty: i.quantity || 1
        })),
        deliveryAddress: `${address.street}, ${address.city}`,
        shippingFee: shipping
      };

      if (paymentMethod === 'mallmoney') {
        if (!wallet || wallet.mallmoney < total) {
          toast.error("Insufficient KES Balance");
          setLoading(false);
          return;
        }
        result = await checkoutMallmoney(orderData);
      } else if (paymentMethod === 'mallcoins') {
        if (!wallet || wallet.mallcoins < total) {
          toast.error("Insufficient Mallcoins balance");
          setLoading(false);
          return;
        }
        result = await checkoutMallcoins(orderData);
      } else {
        // Fallback to M-Pesa (original generic checkout)
        result = await checkout({
          items: cart.map((i: any) => ({
            product: i.id,
            quantity: i.quantity,
            price: i.price
          })),
          shippingAddress: address, // Fix: use shippingAddress which is in the type definition
          paymentMethod,
          total
        });
      }

      // Clear cart
      localStorage.removeItem('cart');
      toast.success("Order placed successfully!");

      // Navigate to tracking
      const orderId = result.order?._id || result.orderId || result._id || 'new';
      navigate(`/buyer/orders/${orderId}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.response?.data?.error || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  }

  if (cart.length === 0) return <div className="p-20 text-center text-white">Cart is empty</div>;

  return (
    <div className="max-w-4xl mx-auto pb-20 animate-fade-in">
      {/* Progress */}
      <div className="flex justify-between mb-12 relative px-10">
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/10 -z-10 rounded-full"></div>
        <div className={`absolute top-1/2 left-0 h-1 bg-indigo-500 -z-10 rounded-full transition-all duration-500 ${step === 1 ? 'w-0' : step === 2 ? 'w-1/2' : 'w-full'}`}></div>

        {[1, 2, 3].map(s => (
          <div key={s} className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step >= s ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)]' : 'bg-[#1a1a1a] border border-white/10 text-slate-500'
              }`}>
              {s}
            </div>
            <span className={`text-xs font-black uppercase tracking-widest ${step >= s ? 'text-white' : 'text-slate-600'}`}>
              {s === 1 ? 'Shipping' : s === 2 ? 'Payment' : 'Review'}
            </span>
          </div>
        ))}
      </div>

      <div className="glass-dark p-8 md:p-12 rounded-[3rem] border border-white/5">
        {step === 1 && (
          <div className="space-y-8 animate-slide-up">
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
              <MapPin className="w-6 h-6 text-indigo-400" /> Shipping Details
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={address.phone}
                  onChange={e => setAddress({ ...address, phone: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-indigo-500/50"
                  placeholder="07..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">City</label>
                  <select
                    value={address.city}
                    onChange={e => setAddress({ ...address, city: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-indigo-500/50 appearance-none"
                  >
                    <option className="bg-slate-900">Nairobi</option>
                    <option className="bg-slate-900">Mombasa</option>
                    <option className="bg-slate-900">Kisumu</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Delivery Location</label>
                  <input
                    type="text"
                    value={address.street}
                    onChange={e => setAddress({ ...address, street: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-indigo-500/50"
                    placeholder="e.g. Westlands, CBD"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!address.phone || !address.street}
              className="w-full py-5 rounded-2xl bg-indigo-500 text-white font-black hover:bg-indigo-600 transition-all disabled:opacity-50 mt-4"
            >
              Continue to Payment
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8 animate-slide-up">
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
              <CreditCard className="w-6 h-6 text-indigo-400" /> Payment Method
            </h2>

            <div className="grid gap-4">
              <button
                onClick={() => setPaymentMethod('mallmoney')}
                className={`p-6 rounded-2xl border flex items-center gap-4 transition-all ${paymentMethod === 'mallmoney' ? 'bg-indigo-500/10 border-indigo-500' : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${paymentMethod === 'mallmoney' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                  <WalletIcon className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <p className={`font-black uppercase tracking-wider ${paymentMethod === 'mallmoney' ? 'text-indigo-400' : 'text-white'}`}>KES Balance</p>
                  <p className="text-xs text-slate-500 mt-1">Pay with your AVAS wallet balance</p>
                </div>
                {wallet && (
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Available</p>
                    <p className={`text-sm font-bold ${wallet.mallmoney < total ? 'text-red-400' : 'text-green-400'}`}>
                      KES {wallet.mallmoney.toLocaleString()}
                    </p>
                  </div>
                )}
              </button>

              <button
                onClick={() => setPaymentMethod('mallcoins')}
                className={`p-6 rounded-2xl border flex items-center gap-4 transition-all ${paymentMethod === 'mallcoins' ? 'bg-yellow-500/10 border-yellow-500' : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${paymentMethod === 'mallcoins' ? 'bg-yellow-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                  <Coins className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <p className={`font-black uppercase tracking-wider ${paymentMethod === 'mallcoins' ? 'text-yellow-400' : 'text-white'}`}>MallCoins</p>
                  <p className="text-xs text-slate-500 mt-1">Use your digital coin assets</p>
                </div>
                {wallet && (
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Available</p>
                    <p className={`text-sm font-bold ${wallet.mallcoins < total ? 'text-red-400' : 'text-yellow-400'}`}>
                      {wallet.mallcoins.toLocaleString()} MLCNS
                    </p>
                  </div>
                )}
              </button>

              <div className="h-px bg-white/5 my-2"></div>

              <button
                onClick={() => setPaymentMethod('mpesa')}
                className={`p-6 rounded-2xl border flex items-center gap-4 transition-all ${paymentMethod === 'mpesa' ? 'bg-green-500/10 border-green-500' : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${paymentMethod === 'mpesa' ? 'bg-green-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <p className={`font-black uppercase tracking-wider ${paymentMethod === 'mpesa' ? 'text-green-400' : 'text-white'}`}>M-Pesa</p>
                  <p className="text-xs text-slate-500 mt-1">Pay instantly via mobile money</p>
                </div>
              </button>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-5 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-[2] py-5 rounded-2xl bg-indigo-500 text-white font-black hover:bg-indigo-600 transition-all"
              >
                Review Order
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8 animate-slide-up">
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-indigo-400" /> Review Order
            </h2>

            <div className="bg-white/5 rounded-2xl p-6 space-y-4">
              {cart.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <span className="text-slate-300 font-medium">{item.quantity}x {item.name}</span>
                  <span className="text-white font-bold">KES {(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
              <div className="h-px bg-white/10 my-4"></div>
              <div className="flex justify-between items-center font-black text-xl text-white">
                <span>Total</span>
                <span>KES {total.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep(2)}
                disabled={loading}
                className="flex-1 py-5 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handlePlaceOrder}
                disabled={loading}
                className="flex-[2] py-5 rounded-2xl bg-white text-black font-black hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Order'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
