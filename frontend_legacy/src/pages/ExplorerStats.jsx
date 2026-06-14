import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function ChainStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [blocks, setBlocks] = useState([]);

  const API_URL = import.meta.env.VITE_EXPLORER_API_URL || 'http://localhost:5000/api/explorer';

  useEffect(() => {
    const socket = io(import.meta.env.VITE_EXPLORER_WS_URL || 'http://localhost:5000', {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('subscribe_blocks');
      socket.emit('subscribe_validators');
      console.log('Explorer socket connected:', socket.id);
    });

    socket.on('new_block', (block) => {
      setBlocks((prev) => [block, ...prev].slice(0, 30));
    });

    socket.on('validator_update', () => {
      fetchStats();
    });

    socket.on('disconnect', () => {
      console.warn('Explorer socket disconnected');
    });

    fetchStats();
    const interval = setInterval(fetchStats, 5000);

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  async function fetchStats() {
    try {
      const [statsRes, blocksRes] = await Promise.all([
        axios.get(`${API_URL}/stats`),
        axios.get(`${API_URL}/blocks?limit=30`)
      ]);
      setStats(statsRes.data.data);
      setBlocks(blocksRes.data.data.reverse());
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6'>
      <div className='max-w-7xl mx-auto'>
        <h1 className='text-4xl font-bold text-white mb-8'>Chain Statistics</h1>

        {error && (
          <div className='bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-lg mb-6'>
            Error: {error}
          </div>
        )}

        {loading ? (
          <div className='text-center py-12'>
            <div className='inline-block animate-spin'>⏳</div>
            <p className='text-gray-400 mt-4'>Loading chain statistics...</p>
          </div>
        ) : stats ? (
          <div className='space-y-6'>
            {/* Key Metrics */}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
              <div className='bg-gradient-to-br from-blue-900 to-blue-800 p-6 rounded-lg border border-blue-700'>
                <p className='text-gray-300 text-sm'>Total Blocks</p>
                <p className='text-4xl font-bold text-blue-300 mt-2'>{stats.total_blocks}</p>
              </div>
              <div className='bg-gradient-to-br from-purple-900 to-purple-800 p-6 rounded-lg border border-purple-700'>
                <p className='text-gray-300 text-sm'>Total Transactions</p>
                <p className='text-4xl font-bold text-purple-300 mt-2'>{stats.total_transactions}</p>
              </div>
              <div className='bg-gradient-to-br from-green-900 to-green-800 p-6 rounded-lg border border-green-700'>
                <p className='text-gray-300 text-sm'>Active Validators</p>
                <p className='text-4xl font-bold text-green-300 mt-2'>{stats.total_validators}</p>
              </div>
              <div className='bg-gradient-to-br from-orange-900 to-orange-800 p-6 rounded-lg border border-orange-700'>
                <p className='text-gray-300 text-sm'>Latest Block</p>
                <p className='text-4xl font-bold text-orange-300 mt-2'>{stats.latest_block_height}</p>
              </div>
            </div>

            {/* Additional Stats */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <div className='bg-slate-700 p-6 rounded-lg border border-slate-600'>
                <p className='text-gray-300 text-sm'>Total Voting Power</p>
                <p className='text-3xl font-bold text-white mt-2'>{stats.total_voting_power}</p>
              </div>
              <div className='bg-slate-700 p-6 rounded-lg border border-slate-600'>
                <p className='text-gray-300 text-sm'>Average Validator Uptime</p>
                <p className='text-3xl font-bold text-white mt-2'>
                  {stats.average_uptime ? `${(stats.average_uptime).toFixed(2)}%` : 'N/A'}
                </p>
              </div>
            </div>

            {/* Block Height Chart */}
            {blocks.length > 0 && (
              <div className='bg-slate-700 p-6 rounded-lg border border-slate-600'>
                <h2 className='text-xl font-semibold text-white mb-4'>Block Height Trend</h2>
                <ResponsiveContainer width='100%' height={300}>
                  <LineChart data={blocks}>
                    <CartesianGrid stroke='#475569' />
                    <XAxis 
                      stroke='#94a3b8' 
                      dataKey='height'
                      label={{ value: 'Block Height', position: 'insideBottomRight', offset: -5 }}
                    />
                    <YAxis stroke='#94a3b8' />
                    <Tooltip />
                    <Line
                      type='monotone'
                      dataKey='tx_count'
                      stroke='#3b82f6'
                      dot={false}
                      name='Transactions per Block'
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Transaction Distribution */}
            {blocks.length > 0 && (
              <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                <div className='bg-slate-700 p-6 rounded-lg border border-slate-600'>
                  <h2 className='text-xl font-semibold text-white mb-4'>Transactions per Block (Last 30)</h2>
                  <ResponsiveContainer width='100%' height={300}>
                    <BarChart data={blocks}>
                      <CartesianGrid stroke='#475569' />
                      <XAxis stroke='#94a3b8' dataKey='height' />
                      <YAxis stroke='#94a3b8' />
                      <Tooltip />
                      <Bar dataKey='tx_count' fill='#3b82f6' name='TX Count' />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className='bg-slate-700 p-6 rounded-lg border border-slate-600'>
                  <h2 className='text-xl font-semibold text-white mb-4'>Network Overview</h2>
                  <div className='space-y-3 text-sm'>
                    <div className='flex justify-between'>
                      <span className='text-gray-400'>Blocks/min:</span>
                      <span className='text-white font-semibold'>
                        {blocks.length > 1 ? ((blocks.length * 60) / (blocks[blocks.length - 1].height - blocks[0].height + 1)).toFixed(2) : 'N/A'}
                      </span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-gray-400'>Avg TX/block:</span>
                      <span className='text-white font-semibold'>
                        {blocks.length > 0 ? (blocks.reduce((sum, b) => sum + b.tx_count, 0) / blocks.length).toFixed(2) : 'N/A'}
                      </span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-gray-400'>Network Status:</span>
                      <span className='text-green-400 font-semibold'>Healthy</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
