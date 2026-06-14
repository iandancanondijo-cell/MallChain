import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Minus, Plus, Star, ShoppingCart, Heart, Share2,
  ArrowLeft, Truck, ShieldCheck
} from 'lucide-react';
import { getProduct, listProducts } from "../../api/product.api";
import { syncCart } from "../../api/order.api";
import { getBuyPrice } from "../../api/wallet.api";
import type { Product } from "../../types";
import { useUserStore } from "../../store/userStore";
import { addToCart as addToCartStorage, addToWishlist, removeFromWishlist, getWishlist } from "../../utils/storage";

import { Coins, Zap } from "lucide-react";

const MP_RATE = 0.62;

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUserStore();
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [mlcRate, setMlcRate] = useState(0.62);

  useEffect(() => {
    if (id) {
      loadProduct(id);
    }
  }, [id]);

  async function loadProduct(productId: string) {
    try {
      const [data, price] = await Promise.all([
        getProduct(productId),
        getBuyPrice().catch(() => 0.62)
      ]);
      setProduct(data);
      setMlcRate(price);
      // Fetch related products
      if (data.category) {
        listProducts({ category: data.category, limit: 5 })
          .then(res => {
            setRelatedProducts(res.products.filter(p => (p._id || p.id) !== (data._id || data.id)).slice(0, 4));
          })
          .catch(console.error);
      }
      setLoading(false);
    } catch (error) {
      console.error("Failed to load product", error);
      setLoading(false);
    }
  }

  const images = useMemo(() => {
    if (!product?.images || product.images.length === 0) {
      return [product?.primaryImage?.url || '/placeholder.png'];
    }
    return product.images.map(img =>
      typeof img === 'string' ? img : (img as any).url || '/placeholder.png'
    );
  }, [product]);

  function addToCart() {
    if (!product) return;

    addToCartStorage({
      ...product,
      quantity,
      id: product._id || product.id,
      images: images
    }, user?.id || user?._id);

    // Optimistic sync - context/storage handles the event dispatch
    // We still sync to backend if needed, but storage util doesn't do API calls (yet).
    // Navbar will update via event.

    // Sync with backend immediately if logged in
    // Note: storage.ts doesn't call API. 
    // We can keep the syncCart call here for now or let CartContext handle it if we used it.
    // For now, let's keep direct sync for safety.
    const cart = JSON.parse(localStorage.getItem(user?.id ? `cart_${user.id}` : 'cart') || '[]');
    syncCart(cart).catch(console.error);

    const btn = document.getElementById('add-to-cart-btn');
    if (btn) {
      const originalText = btn.innerHTML;
      btn.innerHTML = 'Added!';
      btn.classList.add('bg-green-500', 'text-white');
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('bg-green-500', 'text-white');
      }, 2000);
    }
  }

  if (loading || !product) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-10">
      <div className="container mx-auto px-4 max-w-7xl">
        <button
          onClick={() => navigate('/buyer/browse')}
          className="group mb-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest"
        >
          <div className="p-2 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </div>
          Back to Browse
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Gallery */}
          <div className="space-y-6">
            <div className="aspect-square rounded-2xl overflow-hidden glass-dark border border-white/5 relative group">
              <img
                src={images[activeImage]}
                alt={product.title || product.name}
                className="w-full h-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://placehold.co/600x600/1e293b/white?text=No+Image';
                }}
              />

              <div className="absolute top-4 right-4 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentWishlist = getWishlist(user?.id || user?._id);
                    const isin = currentWishlist.some((p: any) => p.id === product._id || p._id === product._id);

                    if (isin) {
                      removeFromWishlist(product._id || product.id || '', user?.id || user?._id);
                      alert('Removed from wishlist');
                    } else {
                      addToWishlist(product, user?.id || user?._id);
                      alert('Added to wishlist');
                    }
                  }}
                  className="w-10 h-10 rounded-xl bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-pink-500 transition-all hover:scale-105"
                >
                  <Heart className="w-5 h-5" />
                </button>
                <button className="w-10 h-10 rounded-xl bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-indigo-500 transition-all hover:scale-105">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-5 gap-3">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(idx)}
                    className={`aspect-square rounded-xl overflow-hidden border transition-all ${activeImage === idx ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-white/10 hover:border-white/30 opacity-60 hover:opacity-100'}`}
                  >
                    <img
                      src={img}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/100x100/1e293b/white?text=Err';
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col h-full py-4">
            <div className="mb-auto space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {product.isNew && (
                    <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
                      Brand New
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <Star className="w-4 h-4 fill-amber-400" />
                    <span className="text-xs font-bold text-slate-300">
                      {product.averageRating || product.rating || 0}
                      <span className="text-slate-600 ml-1">
                        ({product.reviews?.length || product.reviewsCount || 0} reviews)
                      </span>
                    </span>
                  </div>
                </div>

                <h1 className="text-4xl md:text-5xl font-black text-white leading-tight tracking-tight">
                  {product.title || product.name}
                </h1>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <Coins className="w-4 h-4 text-indigo-400" />
                      </div>
                      <span className="text-4xl font-black text-white tracking-tighter">
                        {((product.price / mlcRate) * quantity).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xl text-indigo-400">MLC</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 border-l border-white/10 pl-6">
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-amber-500" />
                      </div>
                      <span className="text-2xl font-black text-slate-300 tracking-tight">
                        {((product.price / MP_RATE) * quantity).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-lg text-slate-500 font-bold uppercase tracking-widest">PTS</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest">
                    <span>Reference: KES {((product.price || 0) * quantity).toLocaleString()}</span>
                    {quantity > 1 && (
                      <span> • KES {(product.price || 0).toLocaleString()} each</span>
                    )}
                  </div>

                  {product.originalPrice && (
                    <span className="text-lg text-slate-600 line-through font-bold">
                      KES {((product.originalPrice || 0) * quantity).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl glass-dark border border-white/5 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-wider mb-1">Fast Delivery</p>
                    <p className="text-[10px] text-slate-500 font-bold">Ships in 24h</p>
                  </div>
                </div>
                <div className="p-4 rounded-2xl glass-dark border border-white/5 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white uppercase tracking-wider mb-1">Buyer Protection</p>
                    <p className="text-[10px] text-slate-500 font-bold">Money back guarantee</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="mt-10 pt-8 border-t border-white/5 flex flex-col sm:flex-row gap-4">
              <div className="flex items-center glass-dark rounded-xl p-1.5 border border-white/5 w-fit">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center text-sm font-black text-white">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                id="add-to-cart-btn"
                onClick={addToCart}
                className="flex-1 py-4 px-8 rounded-xl bg-white text-black font-black text-sm uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all flex items-center justify-center gap-3 shadow-xl active:scale-[0.98]"
              >
                <ShoppingCart className="w-5 h-5" />
                Add to Cart
              </button>
            </div>
          </div>
        </div>

        {/* Product Description & Reviews Tabs */}
        <div className="mt-20">
          <div className="flex items-center gap-8 border-b border-white/5 pb-4 mb-8">
            <button className="text-lg font-black text-white hover:text-indigo-400 transition-colors uppercase tracking-widest border-b-2 border-indigo-500 pb-4 -mb-4.5">
              Description
            </button>
            <button className="text-lg font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest pb-4">
              Reviews ({product.reviews?.length || 0})
            </button>
          </div>

          <div className="space-y-8 text-slate-400 leading-relaxed max-w-4xl">
            <p>{product.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
              <div className="space-y-6">
                <h3 className="text-xl font-black text-white uppercase tracking-wider">Specifications</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass-dark p-4 rounded-xl border border-white/5">
                    <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1">Condition</span>
                    <span className="font-bold text-white">{product.condition || 'New'}</span>
                  </div>
                  <div className="glass-dark p-4 rounded-xl border border-white/5">
                    <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1">Category</span>
                    <span className="font-bold text-white">{product.category || 'General'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        {product.reviews && product.reviews.length > 0 && (
          <div className="mt-20 border-t border-white/5 pt-12">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-8">Customer Reviews</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {product.reviews.map((review) => (
                <div key={review.id} className="glass-dark p-6 rounded-2xl border border-white/5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center font-bold text-indigo-400">
                        {review.userName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-white">{review.userName}</p>
                        <div className="flex items-center gap-1 text-amber-400">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-amber-400' : 'text-slate-700 fill-slate-700'}`} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">
                      {new Date(review.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed">{review.comment}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Products */}
        <div className="mt-20 border-t border-white/5 pt-12 pb-20">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Related Products</h2>
            <div className="flex gap-2">
              <button className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10">
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {relatedProducts.length > 0 ? (
              relatedProducts.map((related) => (
                <div
                  key={related._id || related.id}
                  onClick={() => {
                    setLoading(true);
                    navigate(`/buyer/product/${related._id || related.id}`);
                    window.scrollTo(0, 0);
                  }}
                  className="group cursor-pointer glass-dark border border-white/5 rounded-xl overflow-hidden hover:border-indigo-500/30 transition-all hover:-translate-y-1 duration-300"
                >
                  <div className="aspect-[3/4] bg-white/5 relative overflow-hidden">
                    <img
                      src={
                        (related.images && related.images.length > 0)
                          ? (typeof related.images[0] === 'string' ? related.images[0] : (related.images[0] as any).url)
                          : '/placeholder.png'
                      }
                      alt={related.title || related.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/300x400/1e293b/white?text=No+Image';
                      }}
                    />
                  </div>
                  <div className="p-3">
                    <h3 className="font-bold text-white text-xs mb-1 truncate group-hover:text-indigo-400 transition-colors uppercase tracking-wide">{related.title || related.name}</h3>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-white">{(related.price / mlcRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} MLC</p>
                      <p className="text-[10px] font-bold text-slate-500">{(related.price / MP_RATE).toLocaleString(undefined, { maximumFractionDigits: 0 })} PTS</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[3/4] glass-dark rounded-xl border border-white/5 animate-pulse relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                    <div className="w-3/4 h-4 bg-white/10 rounded mb-2"></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
