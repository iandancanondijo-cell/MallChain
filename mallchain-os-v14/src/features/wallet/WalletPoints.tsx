import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Lock, Unlock, Coins, ArrowRight, CheckCircle2, Loader2, Wallet, RefreshCw } from 'lucide-react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { mallpointsApi, type MallpointsBalance } from '../../services/mallpointsApi';
import { walletApi } from '../../services/walletApi';
import { useLivePrice } from '../../hooks/useLivePrice';
import { requestMnemonic } from '../../services/mnemonicAccess';

/** Mallpoints balance + convert-to-Mallcoin (real API, gated by the on-chain conversion window). */
export default function WalletPoints({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [data, setData] = useState<MallpointsBalance | null>(null);
  const { buyKes: mlcnsPriceKes } = useLivePrice();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  // Persistent receipt of the last successful conversion — shown after the
  // toast disappears so the user can see exactly what they received and the
  // credit reference (tx hash).
  const [success, setSuccess] = useState<{ points: number; mallcoins: number; reference: string } | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    const result = await mallpointsApi.getBalance(address);
    if (result.ok && result.data) {
      setData(result.data);
    } else {
      setError(result.error || 'Failed to load Mallpoints balance');
    }
    setLoading(false);
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshWalletAmounts = useCallback(async () => {
    if (!address) return;
    // The credit is already broadcast by the time /convert returns, but the
    // block containing it may not be queryable yet — refetch now and again
    // after the next block or two so TopBar + Wallet Hub amounts never stay
    // stale within the session.
    const bal = await walletApi.getBalance(address);
    if (bal.ok && bal.data) {
      store.state.balances = {
        MALL: bal.data.MALL || 0,
        MLPTS: bal.data.MLPTS || 0,
        USD_M: bal.data.USD_M || 0,
        KES: bal.data.KES || 0,
        EUR: bal.data.EUR || 0,
        GBP: bal.data.GBP || 0,
      };
      store.commit();
    }
  }, [address]);

  // The MLCNS credit lands on-chain a block or two AFTER /convert responds,
  // so one immediate refetch can still read the pre-conversion balance. Poll
  // until the shared store actually shows a different MALL amount (max ~30s).
  const waitForCredit = useCallback(async (prevMall: number) => {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      await refreshWalletAmounts();
      if (store.state.balances.MALL !== prevMall) return;
    }
  }, [refreshWalletAmounts]);

  const doConvert = async () => {
    if (!address) return;
    if (!st.wallet.pinEncryptedMnemonic) {
      toast('Unlock your wallet to sign this conversion');
      return;
    }
    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;
    setConverting(true);
    setSuccess(null);
    try {
      const result = await mallpointsApi.convert(address, mnemonic);
      if (result.ok && result.data) {
        const reference =
          (result.data.credit as { transfer?: { txHash?: string } } | null | undefined)?.transfer?.txHash ?? 'pending';
        setSuccess({
          points: result.data.convertedPoints,
          mallcoins: result.data.mallcoins,
          reference,
        });
        toast(`Converted ${fmtNum(result.data.convertedPoints)} Mallpoints → ${fmtNum(result.data.mallcoins)} Mallcoin`);
        const prevMall = store.state.balances.MALL;
        await refreshWalletAmounts();
        void waitForCredit(prevMall);
      } else {
        toast(result.error || 'Conversion failed', false);
      }
    } catch (err) {
      toast((err as Error).message || 'Conversion failed', false);
    } finally {
      setConverting(false);
      load();
    }
  };

  if (!address) {
    return (
      <div>
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(34, 211, 238, 0.1)', color: 'var(--cyan)' }}>
            <Sparkles size={22} />
          </div>
          <div className="wo-hero-body">
            <div className="wo-hero-title text-gradient">Mallpoints</div>
            <div className="wo-hero-sub">Earned from marketplace interactions · convert to Mallcoin</div>
          </div>
        </div>
        <div className="wo-card" style={{ maxWidth: 560 }}>
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34, 211, 238, 0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Wallet size={24} style={{ color: 'var(--cyan)', opacity: 0.5 }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No wallet connected</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>Connect a wallet to view your Mallpoints.</div>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => navigate('/auth')}>
              Connect a wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  const status = data?.conversionStatus;

  return (
    <div>
      {/* ── hero ── */}
      <div className="wo-hero">
        <div className="wo-hero-icon" style={{ background: 'rgba(34, 211, 238, 0.1)', color: 'var(--cyan)' }}>
          <Sparkles size={22} />
        </div>
        <div className="wo-hero-body">
          <div className="wo-hero-title text-gradient">Mallpoints</div>
          <div className="wo-hero-sub">Earned from marketplace interactions · convert to Mallcoin on the eligible window</div>
        </div>
      </div>

      {/* ── error ── */}
      {error && (
        <div className="wo-card wo-card--error" style={{ maxWidth: 560, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Lock size={14} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: 'var(--red)', flex: 1 }}>{error}</div>
          <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', background: 'none', border: 'none', padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      {/* ── stat cards ── */}
      <div className="wo-points-grid" style={{ marginBottom: 16, maxWidth: 560 }}>
        <div className="wo-points-stat card-hover">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Sparkles size={13} style={{ color: 'var(--cyan)' }} />
            <span className="wo-points-stat-label">Total</span>
          </div>
          <div className="wo-points-stat-value" style={{ color: 'var(--cyan)' }}>{loading ? '—' : fmtNum(data?.balance ?? 0)}</div>
          <div className="wo-points-stat-sub">{data ? `≈ ${data.pointPrice} KES / point` : ''}</div>
        </div>

        <div className="wo-points-stat card-hover">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <CheckCircle2 size={13} style={{ color: 'var(--green)' }} />
            <span className="wo-points-stat-label">On-chain</span>
          </div>
          <div className="wo-points-stat-value">{loading ? '—' : fmtNum(data?.chainPoints ?? 0)}</div>
          <div className="wo-points-stat-sub">confirmed on Mallchain</div>
        </div>

        <div className="wo-points-stat card-hover">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Loader2 size={13} style={{ color: 'var(--gold)' }} />
            <span className="wo-points-stat-label">Pending</span>
          </div>
          <div className="wo-points-stat-value">{loading ? '—' : fmtNum(data?.dbPoints ?? 0)}</div>
          <div className="wo-points-stat-sub">not yet synced on-chain</div>
        </div>
      </div>

      {/* ── Convert section ── */}
      <div className="wo-card card-glow bg-gradient-card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'color-mix(in srgb, var(--section-accent) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Coins size={15} style={{ color: 'var(--section-accent)' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Convert to Mallcoin</div>
            <div style={{ fontSize: 11.5, color: 'var(--txt-3)' }}>Exchange your Mallpoints for MLCNS</div>
          </div>
        </div>

        {/* ── Conversion window status ── */}
        {status && (
          <div className={`wo-conversion-window ${status.canConvert ? 'open' : 'closed'}`} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {status.canConvert ? (
                <div className="wo-conversion-icon"><Unlock size={16} /></div>
              ) : (
                <div className="wo-conversion-icon"><Lock size={16} /></div>
              )}
              <span style={{ fontSize: 13, fontWeight: 600, color: status.canConvert ? 'var(--green)' : 'var(--txt-2)' }}>
                {status.canConvert ? 'Conversion window is open' : 'Conversion window is closed'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)', marginLeft: 22 }}>{status.windowRule}</div>
            {status.reason && (
              <div style={{ fontSize: 12, color: 'var(--txt-2)', marginLeft: 22, marginTop: 4 }}>{status.reason}</div>
            )}
            {status.nextAllowedConversionAt && !status.canConvert && (
              <div style={{ fontSize: 12, color: 'var(--txt-3)', marginLeft: 22, marginTop: 4 }}>
                Next eligible: {new Date(status.nextAllowedConversionAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: 12.5, color: 'var(--txt-3)', lineHeight: 1.6, marginBottom: 16 }}>
          Converting exchanges your full Mallpoints balance for Mallcoin at the live MLCNS/KES rate
          {data && mlcnsPriceKes ? (
            <> — ≈ <b style={{ color: 'var(--gold)' }}>{fmtNum((data.convertiblePoints * data.pointPrice) / mlcnsPriceKes)} MLCNS</b> at
            current rates</>
          ) : null}. This can only be done once per eligibility window (monthly for badge holders, yearly otherwise).
        </p>

        <button
          className="btn btn-primary btn-block"
          onClick={doConvert}
          disabled={converting || loading || !data || !status?.canConvert || (data?.convertiblePoints ?? 0) <= 0}
          style={{ gap: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {converting ? (
            <><span className="wo-spinner" /> Converting…</>
          ) : (
            <><Sparkles size={14} /> Convert {data ? fmtNum(data.convertiblePoints) : ''} Mallpoints <ArrowRight size={14} /> Mallcoin</>
          )}
        </button>

        {success && (
          <div
            style={{
              marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '12px 14px', borderRadius: 'var(--radius-sm, 10px)',
              background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)',
            }}
          >
            <CheckCircle2 size={16} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--green)' }}>
                {fmtNum(success.mallcoins)} MLCNS received
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt-2)', marginTop: 3 }}>
                {fmtNum(success.points)} Mallpoints converted at the live rate and credited to{' '}
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{address.slice(0, 12)}…{address.slice(-6)}</span>.
                Your wallet balance and Mallpoints amount above are updated.
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 4, fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>
                Reference: {success.reference}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
