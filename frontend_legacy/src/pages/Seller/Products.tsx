import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getSellerInventory, deleteProduct } from '../../api/product.api';
import type { Product } from '../../types';
import {
  Package,
  PlusCircle,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Search,
  Grid3x3,
  List,
  TrendingUp,
  DollarSign,
  ShoppingCart
} from 'lucide-react';
import { toast } from 'sonner';

export default function SellerProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    try {
      const data = await getSellerInventory();
      setProducts(data);
    } catch (error: any) {
      toast.error('Failed to load products');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      await deleteProduct(id);
      toast.success('Product deleted successfully');
      fetchProducts();
    } catch (error: any) {
      toast.error('Failed to delete product');
    }
  }

  const filteredProducts = products.filter(product =>
    product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: products.length,
    active: products.filter(p => p.isActive !== false).length,
    totalValue: products.reduce((sum, p) => sum + (p.price * (p.stock || 0)), 0),
    lowStock: products.filter(p => (p.stock || 0) < 10).length
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="pb-20 animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">My Products</h1>
          <p className="text-slate-400 font-medium">Manage your product inventory</p>
        </div>
        <Link
          to="/seller/products/new"
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-black hover:bg-indigo-500 hover:text-white transition-all"
        >
          <PlusCircle className="w-5 h-5" />
          Add Product
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Total Products</p>
              <p className="text-3xl font-black text-white mt-2">{stats.total}</p>
            </div>
            <Package className="w-6 h-6 text-indigo-400" />
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Active</p>
              <p className="text-3xl font-black text-white mt-2">{stats.active}</p>
            </div>
            <Eye className="w-6 h-6 text-green-400" />
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Inventory Value</p>
              <p className="text-2xl font-black text-white mt-2">KES {stats.totalValue.toLocaleString()}</p>
            </div>
            <DollarSign className="w-6 h-6 text-amber-400" />
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Low Stock</p>
              <p className="text-3xl font-black text-white mt-2">{stats.lowStock}</p>
            </div>
            <TrendingUp className="w-6 h-6 text-red-400" />
          </div>
        </div>
      </div>

      {/* Search and View Toggle */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-medium focus:border-indigo-500/50 outline-none transition-all"
          />
        </div>
        <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`}
          >
            <Grid3x3 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`}
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Products Display */}
      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
            <Package className="w-8 h-8 text-slate-600" />
          </div>
          <h3 className="text-xl font-black text-white">No products found</h3>
          <p className="text-slate-500 mt-2 max-w-xs">
            {searchQuery ? 'Try adjusting your search' : 'Add your first product to start selling'}
          </p>
          {!searchQuery && (
            <Link
              to="/seller/products/new"
              className="mt-6 px-6 py-3 rounded-xl bg-indigo-500 text-white font-bold hover:bg-indigo-600 transition-all"
            >
              Add Product
            </Link>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product._id || product.id}
              className="group bg-[#0a0a0a] border border-white/5 rounded-[2rem] overflow-hidden hover:border-indigo-500/30 transition-all"
            >
              {/* Product Image */}
              <div className="aspect-square bg-white/5 relative overflow-hidden">
                {product.images && product.images.length > 0 ? (
                  <img
                    src={typeof product.images[0] === 'string' ? product.images[0] : product.images[0].url}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-12 h-12 text-slate-600" />
                  </div>
                )}
                {product.isActive === false && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-black uppercase">
                      Inactive
                    </span>
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-white mb-1 line-clamp-2">{product.name}</h3>
                  <p className="text-xs text-slate-500">{product.category}</p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Price</p>
                    <p className="text-lg font-black text-white">KES {product.price.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Stock</p>
                    <p className={`text-lg font-black ${(product.stock || 0) < 10 ? 'text-red-400' : 'text-white'}`}>
                      {product.stock || 0}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => navigate(`/seller/products/${product._id || product.id}/edit`)}
                    className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(product._id || product.id!)}
                    className="py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProducts.map((product) => (
            <div
              key={product._id || product.id}
              className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6 hover:border-indigo-500/30 transition-all"
            >
              <div className="flex items-center gap-6">
                {/* Product Image */}
                <div className="w-24 h-24 rounded-xl bg-white/5 overflow-hidden flex-shrink-0">
                  {product.images && product.images.length > 0 ? (
                    <img
                      src={typeof product.images[0] === 'string' ? product.images[0] : product.images[0].url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-slate-600" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-white text-lg">{product.name}</h3>
                      <p className="text-sm text-slate-500">{product.category}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${product.isActive !== false
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                      {product.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-slate-500">Price: </span>
                      <span className="font-black text-white">KES {product.price.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Stock: </span>
                      <span className={`font-black ${(product.stock || 0) < 10 ? 'text-red-400' : 'text-white'}`}>
                        {product.stock || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/seller/products/${product._id || product.id}/edit`)}
                    className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center transition-all"
                  >
                    <Edit className="w-5 h-5 text-slate-400" />
                  </button>
                  <button
                    onClick={() => handleDelete(product._id || product.id!)}
                    className="w-10 h-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 flex items-center justify-center transition-all"
                  >
                    <Trash2 className="w-5 h-5 text-red-400" />
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
