import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import WalletHistory from '../components/WalletHistory';

export default function ExplorerBlockDetails() {
  const { height } = useParams();
  const [block, setBlock] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const API_URL = import.meta.env.VITE_EXPLORER_API_URL || 'http://localhost:5000/api/explorer';

  useEffect(() => {
    async function fetchBlock() {
      setLoading(true);
      try {
        const [blockRes, txRes] = await Promise.all([
          axios.get(`${API_URL}/blocks/${encodeURIComponent(height)}`),
          axios.get(`${API_URL}/blocks/${encodeURIComponent(height)}/transactions`)
        ]);
        setBlock(blockRes.data.data);
        setTxs(txRes.data.data || []);
      } catch (err) {
        console.error('Error fetching block details:', err.message);
      } finally {
        setLoading(false);
      }
    }

    if (height) fetchBlock();
  }, [height]);

  if (loading) return <div className="p-6">Loading block...</div>;
  if (!block) return <div className="p-6">Block not found</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Block {block.height}</h1>
        <div className="bg-slate-800 p-4 rounded-md border border-slate-700">
          <div className="text-sm text-slate-300">Hash: {block.hash}</div>
          <div className="text-sm text-slate-300">Proposer: {block.proposer}</div>
          <div className="text-sm text-slate-300">Timestamp: {new Date(block.timestamp).toLocaleString()}</div>
          <div className="text-sm text-slate-300">Tx Count: {block.tx_count}</div>
        </div>

        <div className="bg-slate-800 p-4 rounded-md border border-slate-700">
          <h2 className="text-lg font-semibold mb-3">Transactions</h2>
          {txs.length === 0 ? (
            <div className="text-slate-400">No transactions in this block</div>
          ) : (
            <WalletHistory txs={txs} />
          )}
        </div>
      </div>
    </div>
  );
}
