import { useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { buyApi, type BuyConfig, type SellPreview, type SellResult, type SellStatus } from '../../services/buyApi';
import { withdrawalAmlApi, NATIVE_EARNINGS_SOURCES, type FundsSource } from '../../services/withdrawalAmlApi';
import { buildSignedTxBytes, MallcoinTxError } from '../../services/mallcoinTx';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { Tooltip } from '../../components/Tooltip';

type Step = 'form' | 'aml-declare' | 'confirm' | 'processing' | 'done';

const FALLBACK_SELL_KES_PER_MLCNS = 0.58; // used only until /api/buy/config's live rate loads

const FUNDS_SOURCE_OPTIONS: { value: FundsSource; label: string }[] = [
  { value: 'mining_staking_rewards', label: 'Mining / Staking rewards' },
  { value: 'mallpoints_conversion', label: 'Mallpoints conversion' },
  { value: 'referral_bonus', label: 'Referral bonus' },
  { value: 'salary', label: 'Salary / employment income' },
  { value: 'business_income', label: 'Business / trade income' },
  { value: 'gift', label: 'Gift' },
  { value: 'asset_sale', label: 'Sale of an asset' },
  { value: 'other', label: 'Other' },
];

/** Withdraw (cash-out) — sell MLCNS on-chain for M-Pesa KES: amount+phone → fee/payout preview → sign & broadcast → poll settlement. */
export default function WalletWithdraw() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;
  const balance = st.balances.MALL;

  const [config, setConfig] = useState<BuyConfig | null>(null);
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [preview, setPreview] = useState<SellPreview | null>(null);
  const [result, setResult] = useState<SellResult | null>(null);
  const [status, setStatus] = useState<SellStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // AML declare-first sub-flow state
  const [amlReviewStatus, setAmlReviewStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [fundsSource, setFundsSource] = useState<FundsSource>('mining_staking_rewards');
  const [narrative, setNarrative] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [declareBusy, setDeclareBusy] = useState(false);
  const isNativeEarnings = NATIVE_EARNINGS_SOURCES.includes(fundsSource);

  const sellRateKes = config?.rates?.sellPriceKes || FALLBACK_SELL_KES_PER_MLCNS;
  const payoutConfigured = config?.configured?.b2cPayout ?? false;

  useEffect(() => {
    buyApi.getConfig().then((r) => {
      if (r.ok && r.data) setConfig(r.data);
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const goToConfirm = async () => {
    setErr('');
    const mlcns = parseFloat(amount);
    if (!mlcns || mlcns <= 0) {
      toast('Enter a valid MLCNS amount', false);
      return;
    }
    if (mlcns > balance) {
      toast(`Insufficient balance — you have ${balance.toFixed(2)} MALL.`, false);
      return;
    }
    if (!/^254\d{9}$/.test(phone)) {
      toast('Enter phone as 254XXXXXXXXX', false);
      return;
    }
    if (!payoutConfigured) {
      toast('M-Pesa payouts are not configured in this environment — cash-out is unavailable.', false);
      return;
    }
    if (!config?.chainSettlement?.cashoutReceiverAddress) {
      toast('Cash-out receiving address is not configured — try again later.', false);
      return;
    }

    setBusy(true);
    const res = await buyApi.sellPreview(mlcns, address);
    setBusy(false);
    if (!res.ok || !res.data) {
      toast(res.error || 'Failed to preview this cash-out', false);
      return;
    }
    const p = res.data;

    if (!p.minimum.ok) {
      toast(`Minimum withdrawal is ${p.minimum.minimumKes} KES-equivalent — you're short by ${p.minimum.shortfallKes} KES.`, false);
      return;
    }
    if (!p.rateLimit.ok) {
      const when = p.rateLimit.nextAvailableAt ? new Date(p.rateLimit.nextAvailableAt).toLocaleString() : 'later this week';
      toast(`You've reached the limit of ${p.rateLimit.limit} withdrawals this week. Next one available ${when}.`, false);
      return;
    }

    setPreview(p);

    if (p.aml.required && p.aml.reviewStatus !== 'approved') {
      if (!p.aml.walletLinked) {
        toast('Link your account to a wallet (Settings → Security) before a withdrawal this size — a short compliance check is required.', false);
        return;
      }
      setAmlReviewStatus(p.aml.reviewStatus);
      setStep('aml-declare');
      return;
    }

    setStep('confirm');
  };

  const submitAmlDeclaration = async () => {
    if (!preview) return;
    if (narrative.trim().length < 20) {
      toast('Please give a bit more detail (at least 20 characters) about where these funds came from.', false);
      return;
    }
    if (!isNativeEarnings && !documentFile) {
      toast('Please upload a supporting document for this source of funds.', false);
      return;
    }

    setDeclareBusy(true);
    try {
      let documentRef: string | undefined;
      if (documentFile) {
        const up = await withdrawalAmlApi.uploadDocument(documentFile);
        if (!up.ok || !up.data) {
          toast(up.error || 'Document upload failed', false);
          setDeclareBusy(false);
          return;
        }
        documentRef = up.data.documentRef;
      }

      const res = await withdrawalAmlApi.declare({
        fundsSource,
        narrative: narrative.trim(),
        documentRef,
        estimatedKes: preview.estimatedKes,
      });
      setDeclareBusy(false);
      if (!res.ok) {
        toast(res.error || 'Verification submission failed', false);
        return;
      }
      setAmlReviewStatus('pending');
      toast('Verification submitted — we\'ll review it shortly.');
    } catch (e) {
      setDeclareBusy(false);
      toast(e instanceof Error ? e.message : 'Verification submission failed', false);
    }
  };

  const checkAmlStatus = async () => {
    setDeclareBusy(true);
    const res = await withdrawalAmlApi.getStatus();
    setDeclareBusy(false);
    if (!res.ok || !res.data) {
      toast(res.error || 'Failed to check status', false);
      return;
    }
    setAmlReviewStatus(res.data.reviewStatus);
    if (res.data.reviewStatus === 'approved') {
      toast('Verification approved — you can continue.');
      setStep('confirm');
    } else if (res.data.reviewStatus === 'pending') {
      toast('Still pending review — check back shortly.');
    } else if (res.data.reviewStatus === 'rejected') {
      toast(res.data.reviewNotes || 'Verification was not approved. You can submit again with more detail.', false);
    }
  };

  const confirmAndSell = async () => {
    if (!preview || !config?.chainSettlement?.cashoutReceiverAddress) return;
    setBusy(true);
    setErr('');
    try {
      const mnemonic = await requestMnemonic();
      if (!mnemonic) { setBusy(false); return; }

      const txBytes = await buildSignedTxBytes({
        mnemonic,
        fromAddress: address,
        toAddress: config.chainSettlement.cashoutReceiverAddress,
        amountMlcns: preview.amount,
        memo: 'Mallchain cash-out',
      });

      setStep('processing');

      const sellRes = await buyApi.sell({
        sellerAddress: address,
        amount: preview.amount,
        txBytes,
        phone,
      });

      if (!sellRes.ok || !sellRes.data) {
        // A race since /sell/preview (rate-limit filled up, or an AML
        // review that was approved moments ago got consumed by another
        // request) — route back to the right step instead of a dead end.
        toast(sellRes.error || 'Cash-out failed', false);
        setStep('confirm');
        setBusy(false);
        return;
      }

      setResult(sellRes.data);
      setStep('done');
      setBusy(false);
      toast(sellRes.data.queued ? 'Withdrawal queued — waiting for pool liquidity' : 'Cash-out submitted — payout is being processed');

      pollRef.current = setInterval(async () => {
        const st2 = await buyApi.getSellStatus(sellRes.data!.saleId);
        if (st2.ok && st2.data) {
          setStatus(st2.data);
          if (['completed', 'failed', 'resign_required', 'aml_rejected'].includes(st2.data.overallStatus)) {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      }, 3000);
    } catch (e) {
      setErr(e instanceof MallcoinTxError || e instanceof Error ? e.message : 'Cash-out failed');
      setStep('confirm');
      setBusy(false);
    }
  };

  const resignAndResubmit = async () => {
    if (!result || !config?.chainSettlement?.cashoutReceiverAddress || !preview) return;
    setBusy(true);
    try {
      const mnemonic = await requestMnemonic();
      if (!mnemonic) { setBusy(false); return; }
      // buildSignedTxBytes re-fetches the account's *current* sequence —
      // that's exactly what going stale means, so a fresh call fixes it.
      const txBytes = await buildSignedTxBytes({
        mnemonic,
        fromAddress: address,
        toAddress: config.chainSettlement.cashoutReceiverAddress,
        amountMlcns: preview.amount,
        memo: 'Mallchain cash-out (re-signed)',
      });
      const res = await buyApi.resign(result.saleId, txBytes);
      setBusy(false);
      if (!res.ok) {
        toast(res.error || 'Re-sign failed', false);
        return;
      }
      toast('Re-signed — back in the queue.');
      pollRef.current = setInterval(async () => {
        const st2 = await buyApi.getSellStatus(result.saleId);
        if (st2.ok && st2.data) {
          setStatus(st2.data);
          if (['completed', 'failed', 'resign_required'].includes(st2.data.overallStatus)) {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      }, 3000);
    } catch (e) {
      setBusy(false);
      toast(e instanceof MallcoinTxError || e instanceof Error ? e.message : 'Re-sign failed', false);
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setAmount('');
    setPhone('');
    setPreview(null);
    setResult(null);
    setStatus(null);
    setErr('');
    setNarrative('');
    setDocumentFile(null);
    setAmlReviewStatus('none');
    setStep('form');
  };

  if (!address) {
    return (
      <div>
        <div className="view-head"><h1>Withdraw</h1></div>
        <div className="card">
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>
            Connect a wallet to withdraw to M-Pesa.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="view-head">
        <h1>Withdraw</h1>
        <span className="sub">Sell MLCNS on-chain · paid out via M-Pesa</span>
      </div>

      {config && !payoutConfigured && (
        <div className="card" style={{ backgroundColor: 'var(--bg-2)', borderLeft: '4px solid var(--gold)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13 }}>
            ⚠ M-Pesa payouts aren't configured in this environment (missing Safaricom B2C credentials).
            Cash-out can't be completed here.
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 480 }}>
        {step === 'form' && (
          <>
            <div className="field">
              <label>Amount (MLCNS) — balance {balance.toFixed(2)}</label>
              <input className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
              <div className="hint">Rate ≈ {sellRateKes.toFixed(2)} KES / MLCNS (estimate only, confirmed on next step).</div>
            </div>
            <div className="field">
              <label>M-Pesa phone number</label>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                placeholder="254712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
              />
            </div>
            {err && <div className="error-message mb">{err}</div>}
            <button className="btn btn-primary btn-block" onClick={goToConfirm} disabled={busy}>
              {busy && <span className="spin" />} Review cash-out
            </button>
          </>
        )}

        {step === 'aml-declare' && preview && (
          <>
            <h2 style={{ margin: '0 0 8px' }}>Quick verification for this withdrawal</h2>
            <p className="tiny muted" style={{ marginBottom: 16, lineHeight: 1.5 }}>
              Withdrawals of {preview.aml.thresholdKes} KES or more go through this check for every user — it's part of
              Mallchain's standard anti-money-laundering policy, not a sign that anything looks wrong with your account.
              Mallchain is built on transparency and does not tolerate money laundering in any form; this same short check
              applies to everyone who crosses this threshold, and it usually takes under a minute.
            </p>

            {amlReviewStatus === 'pending' && (
              <>
                <div className="card" style={{ padding: 12, marginBottom: 12, textAlign: 'center' }}>
                  <div className="spin" style={{ margin: '0 auto 8px' }} />
                  <div>Your verification is being reviewed. This is usually quick.</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setStep('form')} disabled={declareBusy}>Back</button>
                  <button className="btn btn-primary btn-block" onClick={checkAmlStatus} disabled={declareBusy}>
                    {declareBusy && <span className="spin" />} Check status
                  </button>
                </div>
              </>
            )}

            {(amlReviewStatus === 'none' || amlReviewStatus === 'rejected') && (
              <>
                {amlReviewStatus === 'rejected' && (
                  <div className="error-message mb">Your previous verification wasn't approved — please submit again with more detail.</div>
                )}
                <div className="field">
                  <label>What is this withdrawal funded by?</label>
                  <select className="input" value={fundsSource} onChange={(e) => setFundsSource(e.target.value as FundsSource)} disabled={declareBusy}>
                    {FUNDS_SOURCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {!isNativeEarnings && (
                  <div className="field">
                    <label>Upload a document showing this income</label>
                    <input
                      className="input"
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                      disabled={declareBusy}
                    />
                    <div className="hint">e.g. a payslip, bank statement, business receipt, or sale agreement.</div>
                  </div>
                )}
                {isNativeEarnings && (
                  <div className="hint" style={{ marginBottom: 12 }}>
                    No document needed — Mallchain rewards and conversions are already on record.
                  </div>
                )}
                <div className="field">
                  <label>In a sentence or two, tell us where these funds came from.</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    disabled={declareBusy}
                  />
                </div>
                <div className="tiny muted" style={{ marginBottom: 12 }}>
                  By submitting, you confirm the funds you're withdrawing were obtained lawfully, and understand this
                  information is reviewed only to meet anti-money-laundering requirements.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setStep('form')} disabled={declareBusy}>Back</button>
                  <button className="btn btn-primary btn-block" onClick={submitAmlDeclaration} disabled={declareBusy}>
                    {declareBusy && <span className="spin" />} Submit for review
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'confirm' && preview && (
          <>
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div className="tiny">You send</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{preview.amount} MLCNS</div>
              <div className="tiny" style={{ marginTop: 8 }}>You'll receive (est.)</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{preview.estimatedKes.toFixed(2)} KES</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>to {phone} · rate {preview.sellPriceKes.toFixed(2)} KES/MLCNS</div>
            </div>

            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div className="tiny muted">
                Network detail — doesn't reduce your payout
                <Tooltip text="Mallchain's tokenomics burn a share of every MLCNS sold for cash (deflationary) and route the rest to the protocol treasury. This is separate from — and doesn't reduce — the KES you receive." />
              </div>
              <div className="tiny" style={{ marginTop: 4 }}>
                {preview.burnPercentage}% of the sold MLCNS ({preview.burnAmount}) is burned on-chain; the
                remaining {preview.treasuryAmount} goes to treasury reserves.
              </div>
            </div>

            {preview.liquidity.wouldQueue && (
              <div className="card" style={{ padding: 12, marginBottom: 12, borderLeft: '4px solid var(--gold)' }}>
                <div className="tiny">Pool liquidity is temporarily insufficient — this withdrawal will be queued and
                  processed automatically once it recovers. Your MLCNS stays in your wallet until then.</div>
              </div>
            )}

            {err && <div className="error-message mb">{err}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setStep('form')} disabled={busy}>Back</button>
              <button className="btn btn-primary btn-block" onClick={confirmAndSell} disabled={busy}>
                {busy && <span className="spin" />} Sign & submit cash-out
              </button>
            </div>
          </>
        )}

        {step === 'processing' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div className="spin" style={{ margin: '0 auto 12px' }} />
            <h2 style={{ margin: '8px 0' }}>Broadcasting…</h2>
            <div className="muted">Submitting your signed transaction and starting the M-Pesa payout.</div>
          </div>
        )}

        {step === 'done' && result && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 40 }}>
              {status?.overallStatus === 'resign_required' ? '⚠' : result.queued && !status ? '⏳' : '✓'}
            </div>
            <h2 style={{ margin: '8px 0' }}>
              {status ? `Status: ${status.overallStatus}` : result.queued ? 'Withdrawal queued' : 'Cash-out submitted'}
            </h2>
            <div className="muted">
              {status?.overallStatus === 'resign_required'
                ? 'Your account made another transaction while this was queued, so the held signature is now stale — please re-sign to continue.'
                : status?.payoutStatus === 'succeeded'
                  ? 'M-Pesa payout completed.'
                  : status?.overallStatus === 'queued_liquidity' || (result.queued && !status)
                    ? 'Pool liquidity is temporarily insufficient — this will process automatically once it recovers. No action needed.'
                    : 'Your M-Pesa payout is being processed — this can take a few minutes.'}
            </div>
            {result.txHash && <div className="mono" style={{ fontSize: 11, marginTop: 12, opacity: 0.6 }}>tx {result.txHash}</div>}
            {result.saleId && <div className="mono" style={{ fontSize: 11, opacity: 0.6 }}>sale {result.saleId}</div>}
            {status?.overallStatus === 'resign_required' && (
              <div className="modal-actions" style={{ justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={resignAndResubmit} disabled={busy}>
                  {busy && <span className="spin" />} Re-sign
                </button>
              </div>
            )}
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={reset}>New withdrawal</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
