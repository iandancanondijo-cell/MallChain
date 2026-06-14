import { useState } from 'react';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { createShop } from '../../api';
import type { ApiError } from '../../types';

export default function CreateShop() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [previews, setPreviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  function handleFiles(e: any) {
    const f = Array.from(e.target.files || []) as any[];
    setFiles(f);
    const p = f.map((file: any) => URL.createObjectURL(file));
    setPreviews(p);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    // validate
    try {
      z.object({ name: z.string().min(1, 'Shop name required') }).parse({ name });
    } catch (err: any) {
      if (err && err.errors) setErr(err.errors.map((e: any) => e.message).join(', '));
      else setErr(String(err));
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('location', location);
      files.forEach((file, i) => fd.append('images', file, file.name || `image${i}`));

      await createShop(fd);
      nav('/seller/shop-rent');
    } catch (e) {
      const error = e as ApiError;
      setErr(error.message || 'Failed to create shop');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">Create Your Shop</h1>

      {err && <div className="text-red-600">{err}</div>}

      <input value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded" placeholder="Shop Name" />
      <input value={location} onChange={e => setLocation(e.target.value)} className="w-full p-2 border rounded" placeholder="Location" />

      <label className="block text-sm">Upload shop front images (optional)</label>
      <input type="file" accept="image/*" multiple onChange={handleFiles} className="w-full" />
      <div className="flex gap-2 mt-2">
        {previews.map((src, i) => <img key={i} src={src} className="w-24 h-24 object-cover rounded" alt={`preview-${i}`} />)}
      </div>

      <button type="submit" className="w-full bg-black text-white py-2 rounded" disabled={loading}>{loading ? 'Creating...' : 'Create Shop'}</button>
    </form>
  );
}
