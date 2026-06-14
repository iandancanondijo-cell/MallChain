import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

export default function TransactionDetails() {
  const { hash } = useParams();
  const [tx, setTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_URL = import.meta.env.VITE_EXPLORER_API_URL || 'http://localhost:5000/api/explorer';

  useEffect(() => {
    fetchTransaction();
  }, [hash]);

  async function fetchTransaction() {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/tx/${hash}`);
      setTx(response.data.data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching transaction:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6'>
        <div className='max-w-4xl mx-auto text-center py-12'>
          <div className='inline-block animate-spin'>⏳</div>
          <p className='text-gray-400 mt-4'>Loading transaction...</p>
        </div>
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6'>
        <div className='max-w-4xl mx-auto'>
          <div className='bg-red-500/20 border border-red-500 text-red-200 p-6 rounded-lg'>
            <h2 className='text-lg font-semibold mb-2'>Error</h2>
            <p>{error || 'Transaction not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6'>
      <div className='max-w-4xl mx-auto'>
        <h1 className='text-4xl font-bold text-white mb-8'>Transaction Details</h1>

        <div className='space-y-6'>
          {/* Status Card */}
          <div className={`p-6 rounded-lg border ${
            tx.status === 'success'
              ? 'bg-green-900/20 border-green-500'
              : 'bg-red-900/20 border-red-500'
          }`}>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-gray-300 text-sm'>Transaction Status</p>
                <p className={`text-2xl font-bold ${
                  tx.status === 'success' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {tx.status === 'success' ? '✓ Success' : '✗ Failed'}
                </p>
              </div>
            </div>
          </div>

          {/* Transaction Details */}
          <div className='bg-slate-700 border border-slate-600 rounded-lg overflow-hidden'>
            <table className='w-full text-sm'>
              <tbody>
                <tr className='border-b border-slate-600'>
                  <td className='px-6 py-4 text-gray-400 font-semibold'>Hash</td>
                  <td className='px-6 py-4 text-white font-mono break-all'>{tx.hash}</td>
                </tr>
                <tr className='border-b border-slate-600 hover:bg-slate-600/30'>
                  <td className='px-6 py-4 text-gray-400 font-semibold'>Block Height</td>
                  <td className='px-6 py-4 text-blue-400 font-mono'>{tx.block_height}</td>
                </tr>
                {tx.sender && (
                  <tr className='border-b border-slate-600 hover:bg-slate-600/30'>
                    <td className='px-6 py-4 text-gray-400 font-semibold'>From</td>
                    <td className='px-6 py-4 text-white font-mono break-all'>{tx.sender}</td>
                  </tr>
                )}
                {tx.receiver && (
                  <tr className='border-b border-slate-600 hover:bg-slate-600/30'>
                    <td className='px-6 py-4 text-gray-400 font-semibold'>To</td>
                    <td className='px-6 py-4 text-white font-mono break-all'>{tx.receiver}</td>
                  </tr>
                )}
                {tx.amount && (
                  <tr className='border-b border-slate-600 hover:bg-slate-600/30'>
                    <td className='px-6 py-4 text-gray-400 font-semibold'>Amount</td>
                    <td className='px-6 py-4 text-white font-mono'>{tx.amount}</td>
                  </tr>
                )}
                {tx.fee && (
                  <tr className='border-b border-slate-600 hover:bg-slate-600/30'>
                    <td className='px-6 py-4 text-gray-400 font-semibold'>Fee</td>
                    <td className='px-6 py-4 text-white font-mono'>{tx.fee}</td>
                  </tr>
                )}
                <tr className='hover:bg-slate-600/30'>
                  <td className='px-6 py-4 text-gray-400 font-semibold'>Timestamp</td>
                  <td className='px-6 py-4 text-white'>
                    {new Date(tx.timestamp).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
