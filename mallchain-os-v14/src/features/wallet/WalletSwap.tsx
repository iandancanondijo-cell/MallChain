/**
 * Swap — real x/dex pools, real on-chain MsgSwap. The keeper
 * (CreatePool/AddLiquidity/RemoveLiquidity/Swap/EstimateSwap) was already
 * fully implemented and unit-tested on-chain; this page and its backing
 * services (dexApi.ts/dexProto.ts/dexTx.ts, routes/dex.js) are what
 * actually wire it up end to end for the first time.
 */
import { useEffect, useMemo, useState } from 'react';
import { store, type Balance } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { listPools, estimateSwap, type DexPool } from '../../services/dexApi';
import { swap, DexTxError } from '../../services/dexTx';
import { Tooltip } from '../../components/Tooltip';
import { useWalletData } from '../../hooks/useWalletData';

const DECIMALS = 6;
const SLIPPAGE_PRESETS_BPS = [10, 50, 100]; // 0.1% / 0.5% / 1%
const DEFAULT_SLIPPAGE_BPS = 100;

const DENOM_TO_STORE: Record<string, keyof Balance | undefined> = {
  umall: 'MALL',
  umallcoin: 'MALL',
  umallpoints: 'MLPTS',
  umallpoint: 'MLPTS',
  uusd_m: 'USD_M',
  uusdm: 'USD_M',
  ukes: 'KES',
  ueur: 'EUR',
  ugbp: 'GBP',
};

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
  useWalletData(st.wallet.address || null);

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
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [customSlippage, setCustomSlippage] = useState('');

  useEffect(() => {
    listPools().then(setPools).catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load pools'));
  }, []);

  useEffect(() => {
    if (pools && pools.length > 0 && poolId === null) setPoolId(pools[0].id);
  }, [pools, poolId]);

  const pool = pools?.find((p) => p.id === poolId) || null;
  const denomIn = pool ? (direction === 'AtoB' ? pool.tokenADenom : pool.tokenBDenom) : '';
  const denomOut = pool ? (direction === 'AtoB' ? pool.tokenBDenom : pool.tokenADenom) : '';
  const reserveIn = pool ? Number((direction === 'AtoB' ? pool.tokenAReserve : pool.tokenBReserve).amount) : 0;
  const reserveOut = pool ? Number((direction === 'AtoB' ? pool.tokenBReserve : pool.tokenAReserve).amount) : 0;

  const assetIn = useMemo<keyof Balance | null>(() => {
    if (!denomIn) return null;
    return DENOM_TO_STORE[denomIn.toLowerCase()] ?? null;
  }, [denomIn]);
  const assetOut = useMemo<keyof Balance | null>(() => {
    if (!denomOut) return null;
    return DENOM_TO_STORE[denomOut.toLowerCase()] ?? null;
  }, [denomOut]);

  const balanceIn = assetIn ? st.balances[assetIn] : null;
  const amtInNum = parseFloat(amountIn);
  const feeNum = estimate ? Number(fromBaseUnits(estimate.fee)) : 0;
  const balanceInsufficient =
    balanceIn !== null && Number.isFinite(amtInNum) && amtInNum + feeNum > balanceIn;

  const priceImpactPct = (() => {
    if (!estimate || reserveIn <= 0 || reserveOut <= 0) return null;
    const amountInBase = Number(toBaseUnits(amountIn));
    if (amountInBase <= 0) return null;
    const spotPrice = reserveOut / reserveIn;
    const executionPrice = Number(estimate.tokenOut) / amountInBase;
    if (!Number.isFinite(spotPrice) || !Number.isFinite(executionPrice) || spotPrice <= 0) return null;
    return Math.max(0, (1 - executionPrice / spotPrice) * 100);
  })();

  const effectiveSlippageBps = customSlippage
    ? Math.round(Math.max(0, Math.min(5000, parseFloat(customSlippage) || 0)) * 100)
    : slippageBps;

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
    if (balanceInsufficient) {
      const have = balanceIn !== null ? balanceIn.toFixed(2) : '?';
      setErr(`Insufficient balance — you have ${have} ${assetIn || denomIn}. This swap needs ${(amtInNum + feeNum).toFixed(2)} (including fee).`);
      return;
    }
    setSwapping(true);
    setErr('');
    try {
      const mnemonic = await requestMnemonic();
      if (!mnemonic) { setSwapping(false); return; }

      const minTokenOut = Math.floor(Number(estimate.tokenOut) * (10000 - effectiveSlippageBps) / 10000).toString();

      const result = await swap({
        mnemonic,
        fromAddress: st.wallet.address,
        poolId: pool.id,
        tokenIn: { denom: denomIn, amount: toBaseUnits(amountIn) },
        tokenOutDenom: denomOut,
        minTokenOut: { denom: denomOut, amount: minTokenOut },
      });

      const amountDisplay = Number.isFinite(amtInNum) ? amtInNum : 0;
      const amountOutDisplay = estimate ? Number(fromBaseUnits(estimate.tokenOut)) : 0;

      if (assetIn && amountDisplay > 0) {
        store.applyTx({
          type: 'swap',
          amount: amountDisplay + feeNum,
          asset: assetIn,
          kind: 'debit',
          fee: feeNum,
          note: `Swapped ${amountDisplay} ${assetIn} for ${amountOutDisplay.toFixed(6)} ${assetOut || denomOut} on pool #${pool.id}`,
          notifTitle: `Swapped ${amountDisplay} ${assetIn || denomIn}`,
          notifKind: 'tx',
          activityText: `Swapped ${amountDisplay} ${assetIn || denomIn} → ${amountOutDisplay.toFixed(6)} ${assetOut || denomOut}`,
          status: 'pending',
        });
      }
      if (assetOut && amountOutDisplay > 0) {
        store.applyTx({
          type: 'swap',
          amount: amountOutDisplay,
          asset: assetOut,
          kind: 'credit',
          note: `Received from swap on pool #${pool.id}`,
          status: 'pending',
        });
      }

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
              <label>
                Amount ({denomIn})
                {balanceIn !== null && (
                  <span className="tiny muted" style={{ float: 'right', fontWeight: 400 }}>
                    Available: {balanceIn.toFixed(2)} {assetIn || denomIn}
                  </span>
                )}
              </label>
              <input
                className="input"
                inputMode="decimal"
                placeholder="0.00"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                disabled={swapping}
                style={balanceInsufficient ? { borderColor: 'var(--red)' } : undefined}
              />
              {balanceInsufficient && (
                <div className="tiny" style={{ color: 'var(--red)', marginTop: 4 }}>
                  Insufficient balance — required {(amtInNum + feeNum).toFixed(2)}, you have {balanceIn?.toFixed(2) ?? '—'}
                </div>
              )}
            </div>

            <div className="field mb">
              <label>
                Slippage tolerance
                <Tooltip text="The most the price can move against you between quote and execution before the swap is cancelled. A higher tolerance is less likely to fail but may fill at a worse rate." />
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {SLIPPAGE_PRESETS_BPS.map((bps) => (
                  <button
                    key={bps}
                    type="button"
                    className={`btn btn-sm ${!customSlippage && slippageBps === bps ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setSlippageBps(bps); setCustomSlippage(''); }}
                  >
                    {(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%
                  </button>
                ))}
                <input
                  className="input"
                  style={{ width: 90 }}
                  inputMode="decimal"
                  placeholder="Custom %"
                  aria-label="Custom slippage tolerance percent"
                  value={customSlippage}
                  onChange={(e) => setCustomSlippage(e.target.value)}
                />
              </div>
            </div>

            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div className="tiny">You receive (est.)</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {estimating ? '…' : estimate ? `${fromBaseUnits(estimate.tokenOut)} ${denomOut}` : '—'}
              </div>
              {estimate && (
                <div className="tiny muted">
                  Fee: {fromBaseUnits(estimate.fee)} {denomIn} · min received ({(effectiveSlippageBps / 100).toFixed(2)}% slippage): {fromBaseUnits(Math.floor(Number(estimate.tokenOut) * (10000 - effectiveSlippageBps) / 10000).toString())} {denomOut}
                </div>
              )}
              {priceImpactPct !== null && (
                <div
                  className="tiny"
                  style={{
                    marginTop: 6,
                    color: priceImpactPct >= 10 ? 'var(--red)' : priceImpactPct >= 3 ? 'var(--gold-2)' : undefined,
                    fontWeight: priceImpactPct >= 3 ? 600 : undefined,
                  }}
                >
                  Price impact
                  <Tooltip text="How much this swap's size moves the pool's price away from the current spot rate. Larger trades relative to pool depth cause bigger impact." />
                  : {priceImpactPct.toFixed(2)}%
                  {priceImpactPct >= 10 && ' — very high impact, you may receive significantly less than expected'}
                  {priceImpactPct >= 3 && priceImpactPct < 10 && ' — high impact for this pool'}
                </div>
              )}
            </div>

            {err && <div className="error-message mb">{err}</div>}
            {txHash && <div className="tiny mb">✓ Broadcast — tx <span className="mono">{txHash}</span></div>}

            <button className="btn btn-primary btn-block" onClick={doSwap} disabled={swapping || !estimate || !amountIn || balanceInsufficient}>
              {swapping ? 'Swapping…' : balanceInsufficient ? 'Insufficient balance' : 'Swap'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
