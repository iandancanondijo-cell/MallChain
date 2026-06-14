import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getProduct, createProduct, updateProduct } from '../../api';
import type { ApiError } from '../../types';
import {
  Package,
  Upload,
  DollarSign,
  Tag,
  FileText,
  Image as ImageIcon,
  Loader2,
  Save,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  condition: z.enum(['New', 'Pre-owned']).default('New'),
  price: z.preprocess((v) => Number(v), z.number().positive('Price must be > 0')),
  totalUnits: z.preprocess((v) => Number(v), z.number().int().positive('Total units required')),
  images: z.any().refine((v) => v && v.length >= 1, { message: 'Please upload at least 1 product image' })
});

export default function AddProduct() {
  const nav = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState<any[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', condition: 'New', price: '', totalUnits: '', images: null }
  });

  useEffect(() => { if (id) { loadProduct(); } }, [id]);

  async function loadProduct() {
    try {
      const p = await getProduct(id!);
      setValue('name', p.name || p.title || '');
      setValue('description', p.description || '');
      // Normalize condition
      const condition = p.condition === 'new' ? 'New' : p.condition === 'pre-owned' ? 'Pre-owned' : (p.condition || 'New');
      setValue('condition', condition as 'New' | 'Pre-owned');
      setValue('price', p.price || '');
      setValue('totalUnits', p.totalUnits || p.stockQty || '');
      if (Array.isArray(p.images) && p.images.length) {
        setPreviews(p.images.map((img: any) => typeof img === 'string' ? img : img.url || img.filename));
      }
    } catch (e) {
      toast.error('Failed to load product details');
    }
  }

  // generate previews when images change
  useEffect(() => {
    const imgs = watch('images');
    if (!imgs || (imgs.length === 0 && previews.length > 0)) { return; } // Keep existing previews if editing

    // Only update previews if we have FILE objects (new uploads)
    // If we are just loading from DB, previews are set manually in loadProduct
    if (imgs instanceof FileList || Array.isArray(imgs)) {
      const arr = Array.from(imgs);
      // Clean up old object URLs
      const newUrls = arr.map((f: any) => URL.createObjectURL(f));
      setPreviews(newUrls);
      return () => newUrls.forEach(u => URL.revokeObjectURL(u));
    }
  }, [watch('images')]);

  function handleFiles(e: any) {
    const files = e.target.files;
    if (files && files.length > 0) {
      setValue('images', files, { shouldValidate: true, shouldDirty: true });
    }
  }

  const handleDrag = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setValue('images', e.dataTransfer.files, { shouldValidate: true, shouldDirty: true });
    }
  };

  async function onSubmit(data: any) {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', data.name);
      fd.append('description', data.description || '');
      fd.append('condition', data.condition);
      fd.append('price', String(data.price));
      fd.append('totalUnits', String(data.totalUnits));

      const imgs = data.images;
      if (imgs instanceof FileList || Array.isArray(imgs)) {
        Array.from(imgs).forEach((f: any) => fd.append('images', f));
      }

      if (id) {
        await updateProduct(id, fd);
        toast.success("Product updated successfully");
      } else {
        await createProduct(fd);
        toast.success("Product published successfully");
      }
      nav('/seller/products');
    } catch (e) {
      const err = e as ApiError;
      toast.error(err.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pb-20 animate-fade-in space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={() => nav(-1)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">{id ? 'Edit Product' : 'Add New Product'}</h1>
          <p className="text-slate-400 font-medium">List your item for sale on the marketplace.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-8 space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-500" />
              Product Details
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Product Name</label>
              <div className="relative">
                <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input {...register('name')} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-medium focus:border-indigo-500/50 outline-none transition-all" placeholder="e.g. Vintage Leather Jacket" />
              </div>
              {errors.name && <p className="text-red-400 text-xs font-bold ml-1">{String(errors.name.message)}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Description</label>
              <div className="relative">
                <FileText className="absolute left-4 top-4 w-4 h-4 text-slate-500" />
                <textarea {...register('description')} rows={5} className="w-full bg-white/5 border border-white/10 rounded-xl p-4 pl-12 text-white text-sm font-medium focus:border-indigo-500/50 outline-none transition-all resize-none" placeholder="Describe your product in detail..." />
              </div>
            </div>
          </div>

          {/* Pricing & Inventory */}
          <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-8 space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              Pricing & Inventory
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Price (KES)</label>
                <input {...register('price')} type="number" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm font-medium focus:border-green-500/50 outline-none transition-all" placeholder="0.00" />
                {errors.price && <p className="text-red-400 text-xs font-bold ml-1">{String(errors.price.message)}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Stock Quantity</label>
                <input {...register('totalUnits')} type="number" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm font-medium focus:border-indigo-500/50 outline-none transition-all" placeholder="1" />
                {errors.totalUnits && <p className="text-red-400 text-xs font-bold ml-1">{String(errors.totalUnits.message)}</p>}
              </div>

              <div className="sm:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Condition</label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="cursor-pointer">
                    <input type="radio" {...register('condition')} value="New" className="peer hidden" />
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 peer-checked:bg-indigo-500/20 peer-checked:border-indigo-500 transition-all text-center">
                      <span className="text-sm font-bold text-white">Brand New</span>
                    </div>
                  </label>
                  <label className="cursor-pointer">
                    <input type="radio" {...register('condition')} value="Pre-owned" className="peer hidden" />
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 peer-checked:bg-indigo-500/20 peer-checked:border-indigo-500 transition-all text-center">
                      <span className="text-sm font-bold text-white">Pre-owned</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar / Media */}
        <div className="space-y-6">
          <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-8 space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-purple-500" />
              Media
            </h3>

            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-upload')?.click()}
              className={`aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all group ${dragActive ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}`}
            >
              <input id="file-upload" type="file" multiple accept="image/*" onChange={handleFiles} className="hidden" />
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm font-bold text-white">Click or Drag images</p>
              <p className="text-xs text-slate-500 mt-1">JPG, PNG up to 5MB</p>
            </div>

            {errors.images && <p className="text-red-400 text-xs font-bold text-center">{String((errors.images as any).message)}</p>}

            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((src, idx) => (
                  <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-white/10 relative group">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#0a0a0a] border border-white/5 rounded-[2rem] p-6 space-y-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-white text-black rounded-xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {id ? 'Save Changes' : 'Publish Product'}
            </button>
            <button
              type="button"
              onClick={() => nav('/seller/products')}
              className="w-full py-4 bg-white/5 text-white rounded-xl font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
