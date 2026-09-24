/**
 * Swap — real x/dex pools, real on-chain MsgSwap. The keeper
 * (CreatePool/AddLiquidity/RemoveLiquidity/Swap/EstimateSwap) was already
 * fully implemented and unit-tested on-chain; this page and its backing
 * services (dexApi.ts/dexProto.ts/dexTx.ts, routes/dex.js) are what
 * actually wire it up end to end for the first time.
 */
import { useEffect, useMemo, useState } from 'react';
import { Repeat, ArrowDownUp, AlertTriangle, CheckCircle2, Loader2, Droplets, Zap, Info, TrendingDown } from 'lucide-react';
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
  umall: 'MALL', umallcoin: 'MALL',
  umallpoints: 'MLPTS', umallpoint: 'MLPTS',
  uusd_m: 'USD_M', uusdm: 'USD_M',
  ukes: 'KES', ueur: 'EUR', ugbp: 'GBP',
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
  const balanceInsufficient = balanceIn !== null && Number.isFinite(amtInNum) && amtInNum + feeNum > balanceIn;

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
        .finally(() => { if (!cancelled) setEstimating(false); });
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
          type: 'swap', amount: amountDisplay + feeNum, asset: assetIn, kind: 'debit', fee: feeNum,
          note: `Swapped ${amountDisplay} ${assetIn} for ${amountOutDisplay.toFixed(6)} ${assetOut || denomOut} on pool #${pool.id}`,
          notifTitle: `Swapped ${amountDisplay} ${assetIn || denomIn}`, notifKind: 'tx',
          activityText: `Swapped ${amountDisplay} ${assetIn || denomIn} → ${amountOutDisplay.toFixed(6)} ${assetOut || denomOut}`,
          status: 'pending',
        });
      }
      if (assetOut && amountOutDisplay > 0) {
        store.applyTx({ type: 'swap', amount: amountOutDisplay, asset: assetOut, kind: 'credit', note: `Received from swap on pool #${pool.id}`, status: 'pending' });
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
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(52, 211, 153, 0.1)', color: 'var(--emerald)' }}>
            <Repeat size={22} />
          </div>
          <div className="wo-hero-body">
            <div className="wo-hero-title">Swap</div>
            <div className="wo-hero-sub">Trade tokens on Mallchain DEX pools</div>
          </div>
        </div>
        <div className="wo-card wo-card--error" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <AlertTriangle size={32} style={{ color: 'var(--red)', marginBottom: 8 }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Couldn't load pools</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>{loadError}</div>
          </div>
        </div>
      </div>
    );
  }

  if (pools && pools.length === 0) {
    return (
      <div>
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(52, 211, 153, 0.1)', color: 'var(--emerald)' }}>
            <Repeat size={22} />
          </div>
          <div className="wo-hero-body">
            <div className="wo-hero-title">Swap</div>
            <div className="wo-hero-sub">No liquidity pools yet</div>
          </div>
        </div>
        <div className="wo-card" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(52, 211, 153, 0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Droplets size={24} style={{ color: 'var(--emerald)', opacity: 0.5 }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No liquidity pools exist yet</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>Once a pool is created on-chain, it'll show up here to swap against.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── hero ── */}
      <div className="wo-hero">
        <div className="wo-hero-icon" style={{ background: 'rgba(52, 211, 153, 0.1)', color: 'var(--emerald)' }}>
          <Repeat size={22} />
        </div>
        <div className="wo-hero-body">
          <div className="wo-hero-title">Swap</div>
          <div className="wo-hero-sub">Trade tokens on Mallchain DEX pools</div>
        </div>
      </div>

      <div className="wo-card" style={{ maxWidth: 520 }}>
        {!pools && <div style={{ textAlign: 'center', padding: 20, color: 'var(--txt-3)', fontSize: 13 }}>Loading pools…</div>}

        {pools && pool && (
          <>
            {/* ── Pool selector ── */}
            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Droplets size={13} style={{ color: 'var(--emerald)' }} /> Pool
              </label>
              <select className="input" value={pool.id} onChange={(e) => { setPoolId(Number(e.target.value)); setAmountIn(''); setEstimate(null); }}>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>#{p.id} · {p.tokenADenom} / {p.tokenBDenom} · {(Number(p.fee) * 100).toFixed(2)}% fee</option>
                ))}
              </select>
            </div>

            {/* ── Direction toggle ── */}
            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowDownUp size={13} style={{ color: 'var(--cyan)' }} /> Direction
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn btn-sm ${direction === 'AtoB' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setDirection('AtoB'); setAmountIn(''); setEstimate(null); }}>
                  {pool.tokenADenom} → {pool.tokenBDenom}
                </button>
                <button className={`btn btn-sm ${direction === 'BtoA' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setDirection('BtoA'); setAmountIn(''); setEstimate(null); }}>
                  {pool.tokenBDenom} → {pool.tokenADenom}
                </button>
              </div>
            </div>

            {/* ── Amount in ── */}
            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={13} style={{ color: 'var(--gold)' }} /> Amount ({denomIn})
                {balanceIn !== null && (
                  <span className="tiny muted" style={{ marginLeft: 'auto', fontWeight: 400 }}>
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
                <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={11} /> Insufficient — required {(amtInNum + feeNum).toFixed(2)}, you have {balanceIn?.toFixed(2) ?? '—'}
                </div>
              )}
            </div>

            {/* ── Slippage ── */}
            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={13} style={{ color: 'var(--txt-3)' }} /> Slippage tolerance
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

            {/* ── Estimate card ── */}
            <div className="wo-estimate" style={{ marginBottom: 14 }}>
              <div className="wo-estimate-label">You receive (est.)</div>
              <div className="wo-estimate-value" style={{ color: 'var(--emerald)' }}>
                {estimating ? '…' : estimate ? `${fromBaseUnits(estimate.tokenOut)} ${denomOut}` : '—'}
              </div>
              {estimate && (
                <div className="wo-estimate-detail">
                  Fee: {fromBaseUnits(estimate.fee)} {denomIn} · min received ({(effectiveSlippageBps / 100).toFixed(2)}% slippage): {fromBaseUnits(Math.floor(Number(estimate.tokenOut) * (10000 - effectiveSlippageBps) / 10000).toString())} {denomOut}
                </div>
              )}
              {priceImpactPct !== null && (
                <div
                  style={{
                    fontSize: 11.5, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4,
                    color: priceImpactPct >= 10 ? 'var(--red)' : priceImpactPct >= 3 ? 'var(--gold-2)' : 'var(--txt-3)',
                    fontWeight: priceImpactPct >= 3 ? 600 : undefined,
                  }}
                >
                  <TrendingDown size={12} /> Price impact
                  <Tooltip text="How much this swap's size moves the pool's price away from the current spot rate. Larger trades relative to pool depth cause bigger impact." />
                  : {priceImpactPct.toFixed(2)}%
                  {priceImpactPct >= 10 && ' — very high impact'}
                  {priceImpactPct >= 3 && priceImpactPct < 10 && ' — high for this pool'}
                </div>
              )}
            </div>

            {err && <div className="wo-card wo-card--error" style={{ padding: 12, marginBottom: 12 }}>{err}</div>}
            {txHash && (
              <div className="wo-card wo-card--success" style={{ padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
                <span style={{ fontSize: 12 }}>Broadcast — tx <span className="mono">{txHash}</span></span>
              </div>
            )}

            <button className="btn btn-primary btn-block" onClick={doSwap} disabled={swapping || !estimate || !amountIn || balanceInsufficient} style={{ gap: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {swapping ? <><span className="wo-spinner" /> Swapping…</> : balanceInsufficient ? 'Insufficient balance' : <><Repeat size={14} /> Swap</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
