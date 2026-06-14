import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const navigate = useNavigate();

  const API_URL = import.meta.env.VITE_EXPLORER_API_URL || 'http://localhost:5000/api/explorer';

  async function handleSearch(searchQuery) {
    if (!searchQuery.trim()) return;

    try {
      const response = await axios.get(`${API_URL}/search/${searchQuery}`);
      const data = response.data.data;

      // Auto-navigate if single result
      if (data.blocks.length === 1 && data.transactions.length === 0 && data.validators.length === 0) {
        navigate(`/explorer/block/${data.blocks[0].height}`);
      } else if (data.transactions.length === 1 && data.blocks.length === 0 && data.validators.length === 0) {
        navigate(`/explorer/tx/${data.transactions[0].hash}`);
      } else if (data.validators.length === 1 && data.blocks.length === 0 && data.transactions.length === 0) {
        navigate(`/explorer/validator/${data.validators[0].address}`);
      } else {
        // Navigate to search results
        navigate(`/explorer/search?q=${encodeURIComponent(searchQuery)}`);
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  }

  async function handleInputChange(e) {
    const value = e.target.value;
    setQuery(value);

    if (value.length < 2) {
      setSuggestions(null);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/search/${value}`);
      setSuggestions(response.data.data);
      setShowSuggestions(true);
    } catch (err) {
      console.error('Suggestion error:', err);
    }
  }

  function handleSuggestionClick(type, item) {
    if (type === 'block') {
      navigate(`/explorer/block/${item.height}`);
    } else if (type === 'tx') {
      navigate(`/explorer/tx/${item.hash}`);
    } else if (type === 'validator') {
      navigate(`/explorer/validator/${item.address}`);
    }
    setQuery('');
    setSuggestions(null);
  }

  return (
    <div className='relative'>
      <div className='flex gap-2'>
        <input
          type='text'
          value={query}
          onChange={handleInputChange}
          onKeyPress={e => e.key === 'Enter' && handleSearch(query)}
          placeholder='Search block height, tx hash, or validator address...'
          className='flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500'
        />
        <button
          onClick={() => handleSearch(query)}
          className='px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition'
        >
          Search
        </button>
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions && (
        <div className='absolute top-full left-0 right-0 mt-2 bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-10 max-h-96 overflow-y-auto'>
          {suggestions.blocks.length > 0 && (
            <div className='p-3 border-b border-slate-600'>
              <p className='text-xs font-semibold text-gray-400 mb-2'>BLOCKS</p>
              {suggestions.blocks.map(block => (
                <div
                  key={block.height}
                  onClick={() => handleSuggestionClick('block', block)}
                  className='p-2 hover:bg-slate-600 cursor-pointer rounded text-sm text-white mb-1'
                >
                  Block #{block.height}
                </div>
              ))}
            </div>
          )}

          {suggestions.transactions.length > 0 && (
            <div className='p-3 border-b border-slate-600'>
              <p className='text-xs font-semibold text-gray-400 mb-2'>TRANSACTIONS</p>
              {suggestions.transactions.map(tx => (
                <div
                  key={tx.hash}
                  onClick={() => handleSuggestionClick('tx', tx)}
                  className='p-2 hover:bg-slate-600 cursor-pointer rounded text-sm text-white mb-1 font-mono truncate'
                >
                  {tx.hash.slice(0, 20)}...
                </div>
              ))}
            </div>
          )}

          {suggestions.validators.length > 0 && (
            <div className='p-3'>
              <p className='text-xs font-semibold text-gray-400 mb-2'>VALIDATORS</p>
              {suggestions.validators.map(val => (
                <div
                  key={val.address}
                  onClick={() => handleSuggestionClick('validator', val)}
                  className='p-2 hover:bg-slate-600 cursor-pointer rounded text-sm text-white mb-1'
                >
                  {val.moniker || 'Unknown'} ({val.address.slice(0, 10)}...)
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
