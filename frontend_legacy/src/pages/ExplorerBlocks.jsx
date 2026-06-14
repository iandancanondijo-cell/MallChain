import { useEffect, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';

export default function Blocks() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);

  const API_URL = import.meta.env.VITE_EXPLORER_API_URL || 'http://localhost:5000/api/explorer';

  useEffect(() => {
    fetchBlocks();
  }, [page]);

  async function fetchBlocks() {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/blocks?limit=20&offset=${page * 20}`);
      setBlocks(response.data.data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching blocks:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6'>
      <div className='max-w-7xl mx-auto'>
        <h1 className='text-4xl font-bold text-white mb-8'>Blocks</h1>

        {error && (
          <div className='bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-lg mb-6'>
            Error: {error}
          </div>
        )}

        {loading ? (
          <div className='text-center py-12'>
            <div className='inline-block animate-spin'>⏳</div>
            <p className='text-gray-400 mt-4'>Loading blocks...</p>
          </div>
        ) : (
          <>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-slate-700'>
                    <th className='text-left py-3 px-4 font-semibold text-gray-300'>Height</th>
                    <th className='text-left py-3 px-4 font-semibold text-gray-300'>Hash</th>
                    <th className='text-left py-3 px-4 font-semibold text-gray-300'>Transactions</th>
                    <th className='text-left py-3 px-4 font-semibold text-gray-300'>Proposer</th>
                    <th className='text-left py-3 px-4 font-semibold text-gray-300'>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map(block => (
                    <tr key={block.height} className='border-b border-slate-700 hover:bg-slate-700/30 transition'>
                      <td className='py-3 px-4 text-white font-mono'>{block.height}</td>
                      <td className='py-3 px-4 text-gray-400 font-mono text-xs'>
                        {block.hash.slice(0, 16)}...
                      </td>
                      <td className='py-3 px-4 text-blue-400'>{block.tx_count}</td>
                      <td className='py-3 px-4 text-gray-400 font-mono text-xs'>
                        {block.proposer.slice(0, 12)}...
                      </td>
                      <td className='py-3 px-4 text-gray-400'>
                        {block.timestamp ? format(new Date(block.timestamp), 'MMM dd, yyyy HH:mm:ss') : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className='flex justify-between items-center mt-6'>
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition'
              >
                ← Previous
              </button>
              <span className='text-gray-400'>Page {page + 1}</span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={blocks.length < 20}
                className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition'
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
