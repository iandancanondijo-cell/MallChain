import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { listProducts, getFeaturedProducts, getTrendingProducts } from "../../api/product.api";
import type { Product } from "../../types";
import {
  ShoppingBag, Heart, Star, TrendingUp, Sparkles, Tag, ArrowRight, Loader2
} from 'lucide-react';
import { toast } from "sonner";

export default function Browse() {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [trending, setTrending] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    try {
      const [featuredData, trendingData, allData] = await Promise.all([
        getFeaturedProducts().catch(() => []),
        getTrendingProducts().catch(() => []),
        listProducts({}).then(res => res.products || [])
      ]);
      setFeatured(featuredData.slice(0, 6));
      setTrending(trendingData.slice(0, 8));
      setAllProducts(allData.slice(0, 12));
    } catch (e) {
      toast.error('Failed to load products');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const categories = [
    { name: "Electronics", icon: "💻" },
    { name: "Fashion", icon: "👔" },
    { name: "Home", icon: "🏠" },
    { name: "Beauty", icon: "💄" },
    { name: "Sports", icon: "⚽" },
    { name: "Toys", icon: "🎮" }
  ];

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="pb-20 animate-fade-in space-y-10">
      {/* Hero Header */}
      <div className="relative bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-8 md:p-10 overflow-hidden">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Marketplace</span>
          </div>
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-3 tracking-tight">
              Browse Products
            </h1>
            <p className="text-slate-400 font-medium max-w-2xl text-base">
              Explore thousands of products from trusted sellers. Find exactly what you need at the best prices.
            </p>
          </div>
          <Link
            to="/buyer/browse?featured=true"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-black text-sm uppercase tracking-wider hover:bg-indigo-500 transition-all"
          >
            Start Shopping
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Categories */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white uppercase tracking-tight">Shop by Category</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              to={`/buyer/browse?category=${cat.name.toLowerCase()}`}
              className="group relative bg-[#0a0a0a] border border-white/5 rounded-xl p-6 hover:border-indigo-500/30 transition-all hover:-translate-y-1"
            >
              <div className="text-center">
                <div className="text-3xl mb-2">{cat.icon}</div>
                <p className="font-black text-white text-xs uppercase tracking-wider">{cat.name}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Featured Products */}
      {featured.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Featured Products</h2>
            </div>
            <Link to="/buyer/browse?featured=true" className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider">
              View All
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {featured.map(product => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {/* Trending Now */}
      {trending.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Trending Now</h2>
            </div>
            <Link to="/buyer/browse?trending=true" className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider">
              View All
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6">
            {trending.map(product => (
              <ProductCard key={product._id || product.id} product={product} compact />
            ))}
          </div>
        </div>
      )}

      {/* Flash Deals Banner */}
      <div className="relative bg-[#0a0a0a] border border-red-500/20 rounded-[2rem] p-6 md:p-8 overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-red-400" />
              <span className="text-[10px] font-black text-red-400 uppercase tracking-[0.3em]">Limited Time</span>
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-white mb-1">Flash Deals</h3>
            <p className="text-slate-400 text-sm">Up to 70% off on selected items</p>
          </div>
          <Link
            to="/buyer/browse?deals=true"
            className="px-6 py-3 rounded-xl bg-red-500 text-white font-black text-sm uppercase tracking-wider hover:bg-red-600 transition-all"
          >
            Shop Deals
          </Link>
        </div>
      </div>

      {/* All Products */}
      {allProducts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-indigo-400" />
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">All Products</h2>
            </div>
            <Link to="/buyer/products" className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider">
              View All
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
            {allProducts.map(product => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  return (
    <Link
      to={`/buyer/product/${product._id || product.id}`}
      className="group relative bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden hover:border-indigo-500/30 transition-all hover:-translate-y-1 duration-300"
    >
      <div className={`${compact ? 'aspect-square' : 'aspect-[3/4]'} bg-white/5 relative overflow-hidden`}>
        <img
          src={
            product.images && product.images.length > 0
              ? (typeof product.images[0] === 'string'
                ? product.images[0]
                : (product.images[0] as any).url)
              : '/placeholder.png'
          }
          alt={product.title || product.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3C/svg%3E';
          }}
        />

        {/* Floating Heart */}
        <button className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-pink-500 transition-colors z-10 opacity-0 group-hover:opacity-100">
          <Heart className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3">
        <h3 className="font-bold text-white text-xs mb-1 truncate group-hover:text-indigo-400 transition-colors uppercase tracking-wide">
          {product.title || product.name}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <p className="text-base font-black text-white">KES {(product.price || 0).toLocaleString()}</p>
          {!compact && (
            <div className="flex items-center gap-1 text-xs">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="text-slate-500 font-bold">4.8</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
