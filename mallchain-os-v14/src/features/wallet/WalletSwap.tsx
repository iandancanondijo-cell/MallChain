/**
 * Swap — real x/dex pools, real on-chain MsgSwap. The keeper
 * (CreatePool/AddLiquidity/RemoveLiquidity/Swap/EstimateSwap) was already
 * fully implemented and unit-tested on-chain; this page and its backing
 * services (dexApi.ts/dexProto.ts/dexTx.ts, routes/dex.js) are what
 * actually wire it up end to end for the first time.
 */
import { useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { listPools, estimateSwap, type DexPool } from '../../services/dexApi';
import { swap, DexTxError } from '../../services/dexTx';

const DECIMALS = 6;
const SLIPPAGE_BPS = 100; // 1% tolerance on the estimated output

function toBaseUnits(amount: string): string {
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return Math.floor(n * 10 ** DECIMALS).toString();
}

function fromBaseUnits(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0';
  return (n / 10 ** DECIMALS).toFixed(6).replace(/\.?0+$/, '');
}

export default function WalletSwap() {
  useStoreVersion();
  const st = store.state;

  const [pools, setPools] = useState<DexPool[] | null>(null);
  const [poolId, setPoolId] = useState<number | null>(null);
  const [direction, setDirection] = useState<'AtoB' | 'BtoA'>('AtoB');
  const [amountIn, setAmountIn] = useState('');
  const [estimate, setEstimate] = useState<{ tokenOut: string; fee: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [err, setErr] = useState('');
  const [txHash, setTxHash] = useState('');

  useEffect(() => {
    listPools().then(setPools).catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load pools'));
  }, []);

  useEffect(() => {
    if (pools && pools.length > 0 && poolId === null) setPoolId(pools[0].id);
  }, [pools, poolId]);

  const pool = pools?.find((p) => p.id === poolId) || null;
  const denomIn = pool ? (direction === 'AtoB' ? pool.tokenADenom : pool.tokenBDenom) : '';
  const denomOut = pool ? (direction === 'AtoB' ? pool.tokenBDenom : pool.tokenADenom) : '';

  useEffect(() => {
    setEstimate(null);
    setErr('');
    if (!pool || !amountIn || parseFloat(amountIn) <= 0) return;
    const amount = toBaseUnits(amountIn);
    if (amount === '0') return;

    let cancelled = false;
    setEstimating(true);
    const t = setTimeout(() => {
      estimateSwap(pool.id, { denom: denomIn, amount }, denomOut)
        .then((res) => {
          if (cancelled) return;
          setEstimate({ tokenOut: res.tokenOut.amount, fee: res.fee.amount });
        })
        .catch((e) => {
          if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to estimate swap');
        })
        .finally(() => {
          if (!cancelled) setEstimating(false);
        });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool?.id, amountIn, direction]);

  const doSwap = async () => {
    if (!pool || !estimate) return;
    setSwapping(true);
    setErr('');
    try {
      const mnemonic = await requestMnemonic();
      if (!mnemonic) { setSwapping(false); return; }

      const minTokenOut = Math.floor(Number(estimate.tokenOut) * (10000 - SLIPPAGE_BPS) / 10000).toString();

      const result = await swap({
        mnemonic,
        fromAddress: st.wallet.address,
        poolId: pool.id,
        tokenIn: { denom: denomIn, amount: toBaseUnits(amountIn) },
        tokenOutDenom: denomOut,
        minTokenOut: { denom: denomOut, amount: minTokenOut },
      });

      setTxHash(result.txHash);
      setAmountIn('');
      setEstimate(null);
      toast('Swap broadcast', true);
    } catch (e) {
      setErr(e instanceof DexTxError || e instanceof Error ? e.message : 'Swap failed');
    } finally {
      setSwapping(false);
    }
  };

  if (loadError) {
    return (
      <div>
        <div className="view-head"><h1>Swap</h1></div>
        <div className="card" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <h2 style={{ margin: '8px 0' }}>Couldn't load pools</h2>
            <p className="muted">{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (pools && pools.length === 0) {
    return (
      <div>
        <div className="view-head"><h1>Swap</h1><span className="sub">no pools yet</span></div>
        <div className="card" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 40 }}>🔄</div>
            <h2 style={{ margin: '8px 0' }}>No liquidity pools exist yet</h2>
            <p className="muted">Once a pool is created on-chain, it'll show up here to swap against.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="view-head"><h1>Swap</h1></div>
      <div className="card" style={{ maxWidth: 520 }}>
        {!pools && <div className="tiny" style={{ padding: 20 }}>Loading pools…</div>}

        {pools && pool && (
          <>
            <div className="field mb">
              <label>Pool</label>
              <select className="input" value={pool.id} onChange={(e) => { setPoolId(Number(e.target.value)); setAmountIn(''); setEstimate(null); }}>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>#{p.id} · {p.tokenADenom} / {p.tokenBDenom} · {(Number(p.fee) * 100).toFixed(2)}% fee</option>
                ))}
              </select>
            </div>

            <div className="field mb">
              <label>Direction</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn btn-sm ${direction === 'AtoB' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setDirection('AtoB'); setAmountIn(''); setEstimate(null); }}>
                  {pool.tokenADenom} → {pool.tokenBDenom}
                </button>
                <button className={`btn btn-sm ${direction === 'BtoA' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setDirection('BtoA'); setAmountIn(''); setEstimate(null); }}>
                  {pool.tokenBDenom} → {pool.tokenADenom}
                </button>
              </div>
            </div>

            <div className="field mb">
              <label>Amount ({denomIn})</label>
              <input className="input" inputMode="decimal" placeholder="0.00" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} disabled={swapping} />
            </div>

            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div className="tiny">You receive (est.)</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {estimating ? '…' : estimate ? `${fromBaseUnits(estimate.tokenOut)} ${denomOut}` : '—'}
              </div>
              {estimate && <div className="tiny muted">Fee: {fromBaseUnits(estimate.fee)} {denomIn} · min received (1% slippage): {fromBaseUnits(Math.floor(Number(estimate.tokenOut) * (10000 - SLIPPAGE_BPS) / 10000).toString())} {denomOut}</div>}
            </div>

            {err && <div className="error-message mb">{err}</div>}
            {txHash && <div className="tiny mb">✓ Broadcast — tx <span className="mono">{txHash}</span></div>}

            <button className="btn btn-primary btn-block" onClick={doSwap} disabled={swapping || !estimate || !amountIn}>
              {swapping ? 'Swapping…' : 'Swap'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
