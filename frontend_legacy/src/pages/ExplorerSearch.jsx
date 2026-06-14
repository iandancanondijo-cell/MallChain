import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function ExplorerSearch() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search).get('q') || '';

  const API_URL = import.meta.env.VITE_EXPLORER_API_URL || 'http://localhost:5000/api/explorer';

  useEffect(() => {
    if (!query) {
      setLoading(false);
      setResults(null);
      return;
    }

    async function fetchSearch() {
      setLoading(true);
      try {
        const response = await axios.get(`${API_URL}/search/${encodeURIComponent(query)}`);
        setResults(response.data.data || {});
        setError(null);
      } catch (err) {
        setError(err.message || 'Search failed');
      } finally {
        setLoading(false);
      }
    }

    fetchSearch();
  }, [query]);

  function openResult(type, id) {
    switch (type) {
      case 'transaction':
        navigate(`/explorer/tx/${id}`);
        break;
      case 'block':
        navigate('/explorer/blocks');
        break;
      case 'validator':
        navigate(`/explorer/validators`);
        break;
      default:
        break;
    }
  }

  return (
    <div className='min-h-screen bg-slate-950 text-slate-100 p-6'>
      <div className='max-w-6xl mx-auto'>
        <h1 className='text-3xl font-bold mb-4'>Explorer Search</h1>
        <p className='text-slate-400 mb-6'>Query: <span className='text-white'>{query || 'None'}</span></p>

        {!query ? (
          <div className='bg-slate-800 rounded-lg p-6 border border-slate-700'>
            <p className='text-slate-300'>Enter a block height, transaction hash, or validator address to begin searching.</p>
          </div>
        ) : loading ? (
          <div className='bg-slate-800 rounded-lg p-6 border border-slate-700'>
            <p className='text-slate-300'>Searching...</p>
          </div>
        ) : error ? (
          <div className='bg-red-700/20 rounded-lg p-6 border border-red-600'>
            <p className='text-red-200'>Error: {error}</p>
          </div>
        ) : (
          <div className='space-y-6'>
            {results.blocks?.length > 0 && (
              <div className='bg-slate-800 rounded-lg p-6 border border-slate-700'>
                <h2 className='text-xl font-semibold mb-4'>Blocks</h2>
                <div className='space-y-2'>
                  {results.blocks.map((block) => (
                    <button
                      key={block.height}
                      className='w-full text-left p-4 bg-slate-900 rounded-lg border border-slate-700 hover:bg-slate-700'
                      onClick={() => openResult('block', block.height)}
                    >
                      <div className='flex justify-between'>
                        <span>Height {block.height}</span>
                        <span className='text-slate-400'>{new Date(block.timestamp).toLocaleString()}</span>
                      </div>
                      <p className='text-slate-400 mt-1'>Tx Count: {block.tx_count}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {results.transactions?.length > 0 && (
              <div className='bg-slate-800 rounded-lg p-6 border border-slate-700'>
                <h2 className='text-xl font-semibold mb-4'>Transactions</h2>
                <div className='space-y-2'>
                  {results.transactions.map((tx) => (
                    <button
                      key={tx.hash}
                      className='w-full text-left p-4 bg-slate-900 rounded-lg border border-slate-700 hover:bg-slate-700'
                      onClick={() => openResult('transaction', tx.hash)}
                    >
                      <div className='flex justify-between'>
                        <span>{tx.hash}</span>
                        <span className='text-slate-400'>{tx.status}</span>
                      </div>
                      <p className='text-slate-400 mt-1'>Block {tx.block_height}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {results.validators?.length > 0 && (
              <div className='bg-slate-800 rounded-lg p-6 border border-slate-700'>
                <h2 className='text-xl font-semibold mb-4'>Validators</h2>
                <div className='space-y-2'>
                  {results.validators.map((validator) => (
                    <div
                      key={validator.address}
                      className='p-4 bg-slate-900 rounded-lg border border-slate-700'
                    >
                      <p className='text-white font-medium'>{validator.moniker || validator.address}</p>
                      <p className='text-slate-400 mt-1'>Address: {validator.address}</p>
                      <p className='text-slate-400 mt-1'>Voting Power: {validator.voting_power}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!results.blocks?.length && !results.transactions?.length && !results.validators?.length && (
              <div className='bg-slate-800 rounded-lg p-6 border border-slate-700'>
                <p className='text-slate-300'>No results found for this query.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
