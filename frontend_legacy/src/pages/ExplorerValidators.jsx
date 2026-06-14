import { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Validators() {
  const [validators, setValidators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedValidator, setSelectedValidator] = useState(null);
  const [metrics, setMetrics] = useState([]);

  const API_URL = import.meta.env.VITE_EXPLORER_API_URL || 'http://localhost:5000/api/explorer';

  useEffect(() => {
    fetchValidators();
  }, []);

  async function fetchValidators() {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/validators?orderBy=voting_power&order=desc`);
      setValidators(response.data.data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching validators:', err);
    } finally {
      setLoading(false);
    }
  }

  async function selectValidator(address) {
    try {
      setSelectedValidator(address);
      const response = await axios.get(`${API_URL}/validators/${address}/metrics`);
      setMetrics(response.data.data);
    } catch (err) {
      console.error('Error fetching validator metrics:', err);
    }
  }

  const totalVotingPower = validators.reduce((sum, v) => sum + parseInt(v.voting_power || 0), 0);

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6'>
      <div className='max-w-7xl mx-auto'>
        <h1 className='text-4xl font-bold text-white mb-8'>Validators</h1>

        {error && (
          <div className='bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-lg mb-6'>
            Error: {error}
          </div>
        )}

        {loading ? (
          <div className='text-center py-12'>
            <div className='inline-block animate-spin'>⏳</div>
            <p className='text-gray-400 mt-4'>Loading validators...</p>
          </div>
        ) : (
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
            {/* Validators List */}
            <div className='lg:col-span-1 space-y-2 max-h-96 overflow-y-auto'>
              <h2 className='text-xl font-semibold text-white mb-4'>Active Validators ({validators.length})</h2>
              {validators.map(validator => (
                <div
                  key={validator.address}
                  onClick={() => selectValidator(validator.address)}
                  className={`p-4 rounded-lg cursor-pointer transition ${
                    selectedValidator === validator.address
                      ? 'bg-blue-600 border border-blue-400'
                      : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
                  }`}
                >
                  <p className='font-semibold text-white text-sm truncate'>
                    {validator.moniker || 'Unknown'}
                  </p>
                  <p className='text-gray-300 text-xs font-mono truncate'>{validator.address}</p>
                  <p className='text-gray-400 text-xs mt-1'>
                    Power: {((parseInt(validator.voting_power || 0) / totalVotingPower) * 100).toFixed(2)}%
                  </p>
                </div>
              ))}
            </div>

            {/* Validator Details */}
            <div className='lg:col-span-2 space-y-6'>
              {selectedValidator ? (
                <>
                  {validators
                    .filter(v => v.address === selectedValidator)
                    .map(validator => (
                      <div key={validator.address} className='space-y-6'>
                        {/* Stats Cards */}
                        <div className='grid grid-cols-2 gap-4'>
                          <div className='bg-slate-700 p-4 rounded-lg border border-slate-600'>
                            <p className='text-gray-400 text-sm'>Voting Power</p>
                            <p className='text-2xl font-bold text-blue-400'>{validator.voting_power}</p>
                            <p className='text-gray-500 text-xs mt-1'>
                              {((parseInt(validator.voting_power || 0) / totalVotingPower) * 100).toFixed(2)}% of total
                            </p>
                          </div>
                          <div className='bg-slate-700 p-4 rounded-lg border border-slate-600'>
                            <p className='text-gray-400 text-sm'>Uptime</p>
                            <p className='text-2xl font-bold text-green-400'>{(validator.uptime || 0).toFixed(2)}%</p>
                          </div>
                          <div className='bg-slate-700 p-4 rounded-lg border border-slate-600'>
                            <p className='text-gray-400 text-sm'>Commission</p>
                            <p className='text-2xl font-bold text-yellow-400'>{(validator.commission || 0).toFixed(2)}%</p>
                          </div>
                          <div className='bg-slate-700 p-4 rounded-lg border border-slate-600'>
                            <p className='text-gray-400 text-sm'>Status</p>
                            <p className={`text-2xl font-bold ${validator.jailed ? 'text-red-400' : 'text-green-400'}`}>
                              {validator.jailed ? 'Jailed' : 'Active'}
                            </p>
                          </div>
                        </div>

                        {/* Metrics Chart */}
                        {metrics.length > 0 && (
                          <div className='bg-slate-700 p-6 rounded-lg border border-slate-600'>
                            <h3 className='text-lg font-semibold text-white mb-4'>Uptime History</h3>
                            <ResponsiveContainer width='100%' height={300}>
                              <LineChart data={metrics.slice(-30)}>
                                <CartesianGrid stroke='#475569' />
                                <XAxis stroke='#94a3b8' />
                                <YAxis stroke='#94a3b8' />
                                <Tooltip />
                                <Legend />
                                <Line
                                  type='monotone'
                                  dataKey='uptime'
                                  stroke='#3b82f6'
                                  dot={false}
                                  name='Uptime %'
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    ))}
                </>
              ) : (
                <div className='text-center py-12 bg-slate-700 rounded-lg border border-slate-600'>
                  <p className='text-gray-400'>Select a validator to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
