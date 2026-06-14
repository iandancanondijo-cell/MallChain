import { useState } from 'react';
import { submitTask } from '../../api';
import type { ApiError } from '../../types';

export default function SubmitTask() {
  const [file, setFile] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!file) return alert('Attach proof');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('proof', file);
      await submitTask(fd);
      alert('Submitted. Await verification.');
    } catch (e) {
      const error = e as ApiError;
      alert(error.message || 'Submit failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Submit Task Proof</h1>

      <input type="file" accept="image/*,video/*" onChange={(e: any) => setFile(e.target.files && e.target.files[0])} className="border p-2 w-full" />

      <button onClick={submit} disabled={loading} className="bg-green-600 text-white w-full py-2 rounded">{loading ? 'Submitting...' : 'Submit & Earn'}</button>
    </div>
  );
}
