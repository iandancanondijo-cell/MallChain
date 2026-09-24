import { useEffect, useRef, useState } from 'react';
import { Building2, Phone, Coins, CheckCircle2, Loader2, Shield, FileText, AlertTriangle, ArrowRight, Flame, Landmark, Clock, Upload } from 'lucide-react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { buyApi, type BuyConfig, type SellPreview, type SellResult, type SellStatus } from '../../services/buyApi';
import { withdrawalAmlApi, NATIVE_EARNINGS_SOURCES, type FundsSource } from '../../services/withdrawalAmlApi';
import { buildSignedTxBytes, MallcoinTxError } from '../../services/mallcoinTx';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { Tooltip } from '../../components/Tooltip';

type Step = 'form' | 'aml-declare' | 'confirm' | 'processing' | 'done';

const FALLBACK_SELL_KES_PER_MLCNS = 0.58;

const STEP_META: { label: string; icon: typeof Building2 }[] = [
  { label: 'Amount', icon: Coins },
  { label: 'Verify', icon: Shield },
  { label: 'Review', icon: FileText },
  { label: 'Sign', icon: Loader2 },
  { label: 'Done', icon: CheckCircle2 },
];

const STEP_INDEX: Record<Step, number> = { form: 0, 'aml-declare': 1, confirm: 2, processing: 3, done: 4 };

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
    if (!mlcns || mlcns <= 0) { toast('Enter a valid MLCNS amount', false); return; }
    if (mlcns > balance) { toast(`Insufficient balance — you have ${balance.toFixed(2)} MALL.`, false); return; }
    if (!/^254\d{9}$/.test(phone)) { toast('Enter phone as 254XXXXXXXXX', false); return; }
    if (!payoutConfigured) { toast('M-Pesa payouts are not configured in this environment — cash-out is unavailable.', false); return; }
    if (!config?.chainSettlement?.cashoutReceiverAddress) { toast('Cash-out receiving address is not configured — try again later.', false); return; }

    setBusy(true);
    const res = await buyApi.sellPreview(mlcns, address);
    setBusy(false);
    if (!res.ok || !res.data) { toast(res.error || 'Failed to preview this cash-out', false); return; }
    const p = res.data;

    if (!p.minimum.ok) { toast(`Minimum withdrawal is ${p.minimum.minimumKes} KES-equivalent — you're short by ${p.minimum.shortfallKes} KES.`, false); return; }
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
    if (narrative.trim().length < 20) { toast('Please give a bit more detail (at least 20 characters) about where these funds came from.', false); return; }
    if (!isNativeEarnings && !documentFile) { toast('Please upload a supporting document for this source of funds.', false); return; }

    setDeclareBusy(true);
    try {
      let documentRef: string | undefined;
      if (documentFile) {
        const up = await withdrawalAmlApi.uploadDocument(documentFile);
        if (!up.ok || !up.data) { toast(up.error || 'Document upload failed', false); setDeclareBusy(false); return; }
        documentRef = up.data.documentRef;
      }

      const res = await withdrawalAmlApi.declare({ fundsSource, narrative: narrative.trim(), documentRef, estimatedKes: preview.estimatedKes });
      setDeclareBusy(false);
      if (!res.ok) { toast(res.error || 'Verification submission failed', false); return; }
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
    if (!res.ok || !res.data) { toast(res.error || 'Failed to check status', false); return; }
    setAmlReviewStatus(res.data.reviewStatus);
    if (res.data.reviewStatus === 'approved') { toast('Verification approved — you can continue.'); setStep('confirm'); }
    else if (res.data.reviewStatus === 'pending') { toast('Still pending review — check back shortly.'); }
    else if (res.data.reviewStatus === 'rejected') { toast(res.data.reviewNotes || 'Verification was not approved. You can submit again with more detail.', false); }
  };

  const confirmAndSell = async () => {
    if (!preview || !config?.chainSettlement?.cashoutReceiverAddress) return;
    setBusy(true);
    setErr('');
    try {
      const mnemonic = await requestMnemonic();
      if (!mnemonic) { setBusy(false); return; }

      const txBytes = await buildSignedTxBytes({
        mnemonic, fromAddress: address, toAddress: config.chainSettlement.cashoutReceiverAddress,
        amountMlcns: preview.amount, memo: 'Mallchain cash-out',
      });

      setStep('processing');

      const sellRes = await buyApi.sell({ sellerAddress: address, amount: preview.amount, txBytes, phone });

      if (!sellRes.ok || !sellRes.data) {
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
      const txBytes = await buildSignedTxBytes({
        mnemonic, fromAddress: address, toAddress: config.chainSettlement.cashoutReceiverAddress,
        amountMlcns: preview.amount, memo: 'Mallchain cash-out (re-signed)',
      });
      const res = await buyApi.resign(result.saleId, txBytes);
      setBusy(false);
      if (!res.ok) { toast(res.error || 'Re-sign failed', false); return; }
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
    setAmount(''); setPhone(''); setPreview(null); setResult(null); setStatus(null);
    setErr(''); setNarrative(''); setDocumentFile(null); setAmlReviewStatus('none'); setStep('form');
  };

  if (!address) {
    return (
      <div>
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(167, 139, 250, 0.1)', color: 'var(--purple)' }}>
            <Building2 size={22} />
          </div>
          <div className="wo-hero-body">
            <div className="wo-hero-title">Withdraw</div>
            <div className="wo-hero-sub">Sell MLCNS on-chain — paid out via M-Pesa</div>
          </div>
        </div>
        <div className="wo-card" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(167, 139, 250, 0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Building2 size={24} style={{ color: 'var(--purple)', opacity: 0.5 }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No wallet connected</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>Connect a wallet to withdraw to M-Pesa.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── hero ── */}
      <div className="wo-hero">
        <div className="wo-hero-icon" style={{ background: 'rgba(167, 139, 250, 0.1)', color: 'var(--purple)' }}>
          <Building2 size={22} />
        </div>
        <div className="wo-hero-body">
          <div className="wo-hero-title">Withdraw</div>
          <div className="wo-hero-sub">Sell MLCNS on-chain — paid out via M-Pesa to your phone</div>
        </div>
      </div>

      {/* ── step indicator ── */}
      <div className="wo-steps">
        {STEP_META.map((s, i) => {
          const cur = STEP_INDEX[step];
          const cls = i < cur ? 'done' : i === cur ? 'active' : '';
          return (
            <div key={s.label} className={`wo-step ${cls}`}>
              <div className="wo-step-dot"><s.icon size={12} /></div>
              <span>{s.label}</span>
              {i < STEP_META.length - 1 && <div className={`wo-step-line ${i < cur ? 'done' : ''}`} />}
            </div>
          );
        })}
      </div>

      {/* ── payout warning ── */}
      {config && !payoutConfigured && (
        <div className="wo-card wo-info--warning" style={{ maxWidth: 520, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertTriangle size={16} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: 'var(--txt-2)', lineHeight: 1.5 }}>
              M-Pesa payouts aren't configured in this environment (missing Safaricom B2C credentials). Cash-out can't be completed here.
            </div>
          </div>
        </div>
      )}

      {/* ── main card ── */}
      <div className="wo-card" style={{ maxWidth: 520 }}>
        {/* ── Step: form ── */}
        {step === 'form' && (
          <>
            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Coins size={13} style={{ color: 'var(--gold)' }} /> Amount (MLCNS)
                <span className="tiny muted" style={{ marginLeft: 'auto', fontWeight: 400 }}>Balance: {balance.toFixed(2)}</span>
              </label>
              <input className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
              <div className="hint" style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 4 }}>
                Rate ≈ {sellRateKes.toFixed(2)} KES / MLCNS (estimate, confirmed on next step)
              </div>
            </div>

            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Phone size={13} style={{ color: 'var(--cyan)' }} /> M-Pesa phone number
              </label>
              <input className="input" type="tel" inputMode="tel" placeholder="254712345678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
            </div>

            {err && <div className="wo-card wo-card--error" style={{ padding: 12, marginBottom: 12 }}>{err}</div>}

            <button className="btn btn-primary btn-block" onClick={goToConfirm} disabled={busy} style={{ gap: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {busy ? <><span className="wo-spinner" /> Processing…</> : <><ArrowRight size={14} /> Review cash-out</>}
            </button>
          </>
        )}

        {/* ── Step: AML declaration ── */}
        {step === 'aml-declare' && preview && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(167, 139, 250, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={16} style={{ color: 'var(--purple)' }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Quick verification</div>
                <div style={{ fontSize: 11.5, color: 'var(--txt-3)' }}>Required for withdrawals of {preview.aml.thresholdKes} KES+</div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'var(--txt-3)', lineHeight: 1.6, marginBottom: 16 }}>
              Withdrawals of {preview.aml.thresholdKes} KES or more go through this check for every user — it's part of
              Mallchain's standard anti-money-laundering policy. This same short check applies to everyone who crosses
              this threshold, and it usually takes under a minute.
            </p>

            {amlReviewStatus === 'pending' && (
              <>
                <div className="wo-status" style={{ textAlign: 'center', padding: 20, marginBottom: 12 }}>
                  <Loader2 size={28} className="wo-spinner" style={{ color: 'var(--purple)', marginBottom: 8 }} />
                  <div className="wo-status-title">Verification under review</div>
                  <div className="wo-status-text">This is usually quick. Check back in a moment.</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setStep('form')} disabled={declareBusy}>Back</button>
                  <button className="btn btn-primary btn-block" onClick={checkAmlStatus} disabled={declareBusy} style={{ gap: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {declareBusy ? <span className="wo-spinner" /> : <CheckCircle2 size={13} />} Check status
                  </button>
                </div>
              </>
            )}

            {(amlReviewStatus === 'none' || amlReviewStatus === 'rejected') && (
              <>
                {amlReviewStatus === 'rejected' && (
                  <div className="wo-card wo-card--error" style={{ padding: 12, marginBottom: 12 }}>
                    Your previous verification wasn't approved — please submit again with more detail.
                  </div>
                )}

                <div className="field mb">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Coins size={13} style={{ color: 'var(--gold)' }} /> Source of funds
                  </label>
                  <select className="input" value={fundsSource} onChange={(e) => setFundsSource(e.target.value as FundsSource)} disabled={declareBusy}>
                    {FUNDS_SOURCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {!isNativeEarnings && (
                  <div className="field mb">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Upload size={13} style={{ color: 'var(--cyan)' }} /> Supporting document
                    </label>
                    <input className="input" type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} disabled={declareBusy} />
                    <div className="hint" style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 4 }}>e.g. a payslip, bank statement, business receipt, or sale agreement</div>
                  </div>
                )}

                {isNativeEarnings && (
                  <div className="wo-info--tip" style={{ padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                    No document needed — Mallchain rewards and conversions are already on record.
                  </div>
                )}

                <div className="field mb">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={13} style={{ color: 'var(--txt-2)' }} /> Describe the source of these funds
                  </label>
                  <textarea className="input" rows={3} value={narrative} onChange={(e) => setNarrative(e.target.value)} disabled={declareBusy} />
                </div>

                <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginBottom: 12, lineHeight: 1.5 }}>
                  By submitting, you confirm the funds were obtained lawfully and understand this information is reviewed only to meet anti-money-laundering requirements.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setStep('form')} disabled={declareBusy}>Back</button>
                  <button className="btn btn-primary btn-block" onClick={submitAmlDeclaration} disabled={declareBusy} style={{ gap: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {declareBusy ? <span className="wo-spinner" /> : <><Shield size={13} /> Submit for review</>}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Step: confirm ── */}
        {step === 'confirm' && preview && (
          <>
            <div className="wo-amount-display" style={{ marginBottom: 16 }}>
              <div className="wo-amount-label">You send</div>
              <div className="wo-amount-num" style={{ color: 'var(--purple)' }}>{preview.amount}</div>
              <div className="wo-amount-unit">MLCNS</div>
            </div>

            <div className="wo-summary" style={{ marginBottom: 16 }}>
              <div className="wo-summary-row total">
                <span className="wo-summary-label">You receive (est.)</span>
                <span className="wo-summary-value" style={{ color: 'var(--green-2)', fontWeight: 700 }}>{preview.estimatedKes.toFixed(2)} KES</span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label"><Phone size={11} style={{ marginRight: 4, verticalAlign: -1 }} /> To</span>
                <span className="wo-summary-value mono">{phone}</span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label">Rate</span>
                <span className="wo-summary-value">{preview.sellPriceKes.toFixed(2)} KES / MLCNS</span>
              </div>
            </div>

            {/* Burn / treasury detail */}
            <div className="wo-card" style={{ padding: 12, marginBottom: 12, background: 'var(--bg-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>Network detail</span>
                <Tooltip text="Mallchain's tokenomics burn a share of every MLCNS sold for cash (deflationary) and route the rest to the protocol treasury. This is separate from — and doesn't reduce — the KES you receive." />
                <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>— doesn't reduce your payout</span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Flame size={12} style={{ color: 'var(--red-2)' }} />
                  <span style={{ color: 'var(--txt-2)' }}>{preview.burnPercentage}% ({preview.burnAmount}) burned</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Landmark size={12} style={{ color: 'var(--purple)' }} />
                  <span style={{ color: 'var(--txt-2)' }}>{preview.treasuryAmount} to treasury</span>
                </div>
              </div>
            </div>

            {preview.liquidity.wouldQueue && (
              <div className="wo-card wo-card--warning" style={{ padding: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Clock size={14} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.5 }}>
                    Pool liquidity is temporarily insufficient — this withdrawal will be queued and processed automatically once it recovers. Your MLCNS stays in your wallet until then.
                  </div>
                </div>
              </div>
            )}

            {err && <div className="wo-card wo-card--error" style={{ padding: 12, marginBottom: 12 }}>{err}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setStep('form')} disabled={busy}>Back</button>
              <button className="btn btn-primary btn-block" onClick={confirmAndSell} disabled={busy} style={{ gap: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {busy ? <><span className="wo-spinner" /> Signing…</> : <><Shield size={14} /> Sign & submit cash-out</>}
              </button>
            </div>
          </>
        )}

        {/* ── Step: processing ── */}
        {step === 'processing' && (
          <div className="wo-status" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(167, 139, 250, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={24} className="wo-spinner" style={{ color: 'var(--purple)' }} />
              </div>
            </div>
            <div className="wo-status-title">Broadcasting…</div>
            <div className="wo-status-text">Submitting your signed transaction and starting the M-Pesa payout.</div>
          </div>
        )}

        {/* ── Step: done ── */}
        {step === 'done' && result && (
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: status?.overallStatus === 'resign_required' ? 'rgba(243, 186, 47, 0.1)' : status?.payoutStatus === 'succeeded' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(167, 139, 250, 0.1)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              {status?.overallStatus === 'resign_required' ? <AlertTriangle size={24} style={{ color: 'var(--gold)' }} /> :
               status?.payoutStatus === 'succeeded' ? <CheckCircle2 size={24} style={{ color: 'var(--green)' }} /> :
               <Loader2 size={24} style={{ color: 'var(--purple)' }} />}
            </div>

            <div className="wo-status-title">
              {status ? `Status: ${status.overallStatus}` : result.queued ? 'Withdrawal queued' : 'Cash-out submitted'}
            </div>
            <div className="wo-status-text" style={{ maxWidth: 360, margin: '8px auto 0' }}>
              {status?.overallStatus === 'resign_required'
                ? 'Your account made another transaction while this was queued, so the held signature is now stale — please re-sign to continue.'
                : status?.payoutStatus === 'succeeded'
                  ? 'M-Pesa payout completed.'
                  : status?.overallStatus === 'queued_liquidity' || (result.queued && !status)
                    ? 'Pool liquidity is temporarily insufficient — this will process automatically once it recovers. No action needed.'
                    : 'Your M-Pesa payout is being processed — this can take a few minutes.'}
            </div>

            {result.txHash && <div className="wo-hash" style={{ marginTop: 12 }}>tx {result.txHash}</div>}
            {result.saleId && <div className="wo-hash">sale {result.saleId}</div>}

            {status?.overallStatus === 'resign_required' && (
              <button className="btn btn-primary" onClick={resignAndResubmit} disabled={busy} style={{ marginTop: 16, gap: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {busy ? <span className="wo-spinner" /> : <><Shield size={13} /> Re-sign</>}
              </button>
            )}

            <button className="btn btn-ghost" onClick={reset} style={{ marginTop: 12 }}>New withdrawal</button>
          </div>
        )}
      </div>
    </div>
  );
}
