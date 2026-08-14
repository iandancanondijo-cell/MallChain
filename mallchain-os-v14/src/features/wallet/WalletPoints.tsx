import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { mallpointsApi, type MallpointsBalance } from '../../services/mallpointsApi';

/** Mallpoints balance + convert-to-Mallcoin (real API, gated by the on-chain conversion window). */
export default function WalletPoints() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [data, setData] = useState<MallpointsBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

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

  const doConvert = async () => {
    if (!address) return;
    setConverting(true);
    const result = await mallpointsApi.convert(address);
    setConverting(false);

    if (result.ok && result.data) {
      toast(`Converted ${fmtNum(result.data.convertedPoints)} Mallpoints → ${fmtNum(result.data.mallcoins)} Mallcoin`);
      load();
    } else {
      toast(result.error || 'Conversion failed', false);
      load();
    }
  };

  if (!address) {
    return (
      <div>
        <div className="view-head"><h1>Mallpoints</h1></div>
        <div className="card">
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>
            Connect a wallet to view your Mallpoints.
          </div>
        </div>
      </div>
    );
  }

  const status = data?.conversionStatus;

  return (
    <div>
      <div className="view-head">
        <h1>Mallpoints</h1>
        <span className="sub">Earned from marketplace interactions · convert to Mallcoin on the eligible window</span>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button
              onClick={load}
              style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}
            >
              [Retry]
            </button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="card">
          <div className="card-label">Total Mallpoints</div>
          <div className="card-value" style={{ color: 'var(--cyan)' }}>{loading ? '—' : fmtNum(data?.balance ?? 0)}</div>
          <div className="card-sub">{data ? `≈ ${data.pointPrice} KES / point` : ''}</div>
        </div>
        <div className="card">
          <div className="card-label">On-chain points</div>
          <div className="card-value">{loading ? '—' : fmtNum(data?.chainPoints ?? 0)}</div>
          <div className="card-sub">confirmed on Mallchain</div>
        </div>
        <div className="card">
          <div className="card-label">Pending (off-chain)</div>
          <div className="card-value">{loading ? '—' : fmtNum(data?.dbPoints ?? 0)}</div>
          <div className="card-sub">not yet synced on-chain</div>
        </div>
      </div>

      <div className="card mb">
        <div className="sec-title"><h2>Convert to Mallcoin</h2></div>

        {status && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              background: status.canConvert ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-2)',
              border: `1px solid ${status.canConvert ? 'rgba(34, 197, 94, 0.2)' : 'var(--line-1)'}`,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: status.canConvert ? 'var(--green)' : 'var(--txt-2)' }}>
              {status.canConvert ? '✓ Conversion window is open' : '🔒 Conversion window is closed'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 4 }}>{status.windowRule}</div>
            {status.reason && (
              <div style={{ fontSize: 12, color: 'var(--txt-2)', marginTop: 4 }}>{status.reason}</div>
            )}
            {status.nextAllowedConversionAt && !status.canConvert && (
              <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 4 }}>
                Next eligible: {new Date(status.nextAllowedConversionAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        <p className="muted" style={{ fontSize: 12.5 }}>
          Converting exchanges your full Mallpoints balance for Mallcoin at a 1:1 rate. This can only be
          done once per eligibility window (monthly for badge holders, yearly otherwise).
        </p>

        <button
          className="btn btn-primary btn-block"
          onClick={doConvert}
          disabled={converting || loading || !data || !status?.canConvert || (data?.convertiblePoints ?? 0) <= 0}
        >
          {converting && <span className="spin" />} Convert {data ? fmtNum(data.convertiblePoints) : ''} Mallpoints → Mallcoin
        </button>
      </div>
    </div>
  );
}
