import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart, ArrowRight, Trash2 } from 'lucide-react';
import type { Product } from "../../types";

export default function Wishlist() {
    const [wishlist, setWishlist] = useState<Product[]>([]);

    useEffect(() => {
        // For now, using local storage. In a real app, this should be an API call.
        const saved = localStorage.getItem('wishlist');
        if (saved) {
            setWishlist(JSON.parse(saved));
        }
    }, []);

    function removeFromWishlist(id: string) {
        const newStats = wishlist.filter(p => (p._id || p.id) !== id);
        setWishlist(newStats);
        localStorage.setItem('wishlist', JSON.stringify(newStats));
    }

    return (
        <div className="pb-20 animate-fade-in text-white">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-8 flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
                    <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
                </div>
                My Wishlist
                <span className="text-slate-500 text-lg ml-2 font-medium">({wishlist.length})</span>
            </h1>

            {wishlist.length === 0 ? (
                <div className="text-center py-20 bg-[#0a0a0a] rounded-[2rem] border border-white/5">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Heart className="w-10 h-10 text-slate-600" />
                    </div>
                    <h3 className="text-xl font-black text-white mb-2">Your wishlist is empty</h3>
                    <p className="text-slate-500 mb-8 max-w-xs mx-auto">Save items you love here for later.</p>
                    <Link
                        to="/buyer/browse"
                        className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-pink-500 text-white font-black hover:bg-pink-600 transition-all uppercase tracking-widest text-xs shadow-lg shadow-pink-500/20"
                    >
                        Explore Items <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {wishlist.map(product => (
                        <div key={product._id || product.id} className="group relative bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden hover:border-pink-500/30 transition-all hover:-translate-y-1 duration-300">
                            <div className="aspect-[3/4] bg-white/5 relative overflow-hidden">
                                <Link to={`/buyer/product/${product._id || product.id}`}>
                                    <img
                                        src={
                                            (product.images && product.images.length > 0)
                                                ? (typeof product.images[0] === 'string' ? product.images[0] : (product.images[0] as any).url)
                                                : '/placeholder.png'
                                        }
                                        alt={product.title || product.name}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                    />
                                </Link>

                                <button
                                    onClick={(e) => { e.preventDefault(); removeFromWishlist(product._id || product.id!); }}
                                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-red-500 transition-colors z-10 opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-3">
                                <Link to={`/buyer/product/${product._id || product.id}`}>
                                    <h3 className="font-bold text-white text-xs mb-1 truncate group-hover:text-pink-400 transition-colors uppercase tracking-wide">{product.title || product.name}</h3>
                                </Link>
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-base font-black text-white">KES {(product.price || 0).toLocaleString()}</p>
                                    <button
                                        onClick={() => {
                                            // Add to cart logic would go here
                                            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
                                            cart.push({ ...product, quantity: 1 });
                                            localStorage.setItem('cart', JSON.stringify(cart));
                                            window.dispatchEvent(new Event('cart-updated'));
                                            removeFromWishlist(product._id || product.id!);
                                        }}
                                        className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center hover:bg-pink-500 hover:text-white transition-all"
                                        title="Move to Cart"
                                    >
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
