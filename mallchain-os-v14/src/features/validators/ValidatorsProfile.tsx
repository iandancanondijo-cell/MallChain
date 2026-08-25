import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, Modal, toast } from '../../components/ui';
import { validatorsApi, type ValidatorApplication, type ValidatorLeaderboardEntry } from '../../services/validatorsApi';
import {
  generateConsensusKeypair,
  createValidatorSelfBond,
  toValoperAddress,
  ValidatorCreateTxError,
  type GeneratedConsensusKey,
} from '../../services/validatorCreateTx';
import { requestMnemonic } from '../../services/mnemonicAccess';

const STAKE_DECIMALS = 6;
const toBaseUnits = (display: string) => Math.floor(Number(display || '0') * 10 ** STAKE_DECIMALS).toString();

/** My validator application status — real GET /api/validators/my-application lookup. */
export default function ValidatorsProfile() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [application, setApplication] = useState<ValidatorApplication | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onChain, setOnChain] = useState<ValidatorLeaderboardEntry | null>(null);

  const [activateOpen, setActivateOpen] = useState(false);
  const [genKey, setGenKey] = useState<GeneratedConsensusKey | null>(null);
  const [activating, setActivating] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    const result = await validatorsApi.myApplication(address);
    if (result.ok && result.data) {
      setApplication(result.data.application);
      if (result.data.application?.status === 'approved') {
        const valoper = toValoperAddress(address);
        const detail = await validatorsApi.getDetail(valoper);
        setOnChain(detail.ok && detail.data ? detail.data.validator : null);
      }
    } else {
      setError(result.error || 'Failed to load application status');
    }
    setLoading(false);
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const openActivate = async () => {
    setGenKey(await generateConsensusKeypair());
    setKeySaved(false);
    setActivateOpen(true);
  };

  const downloadKey = () => {
    if (!genKey) return;
    const blob = new Blob([JSON.stringify(genKey, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validator-consensus-key-${application?.moniker || 'mallchain'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setKeySaved(true);
  };

  const activate = async () => {
    if (!application || !genKey || !address) return;
    if (!st.wallet.pinEncryptedMnemonic) return toast('Wallet not connected', false);
    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;
    setActivating(true);
    try {
      const result = await createValidatorSelfBond({
        mnemonic,
        fromAddress: address,
        moniker: application.moniker,
        website: application.website || '',
        details: application.details || '',
        selfDelegationAmount: toBaseUnits(application.selfDelegationAmount),
        denom: 'stake',
        consensusPubkeyBase64: genKey.pubkeyBase64,
      });
      toast(`Validator created — tx ${result.txHash.slice(0, 10)}…`);
      setActivateOpen(false);
      load();
    } catch (e) {
      toast(e instanceof ValidatorCreateTxError || e instanceof Error ? e.message : 'Validator creation failed', false);
    } finally {
      setActivating(false);
    }
  };

  if (!address) {
    return (
      <div>
        <div className="view-head"><h1>My Application</h1></div>
        <div className="card"><div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>Connect a wallet to view your validator application.</div></div>
      </div>
    );
  }

  const statusColor = application?.status === 'approved' ? 'var(--green)' : application?.status === 'rejected' ? 'var(--red-2)' : 'var(--gold)';

  return (
    <div>
      <div className="view-head"><h1>My Application</h1><span className="sub">{address}</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      <div className="card">
        {loading && application === undefined && <div className="tiny">Loading…</div>}
        {!loading && application === null && (
          <div className="empty-state"><div className="es-ico">📝</div><div className="es-t">No application on file</div><div className="es-m">Apply from the Validators home page.</div></div>
        )}
        {application && (
          <table className="tbl">
            <tbody>
              <tr><td className="muted">Status</td><td className="num"><b style={{ color: statusColor }}>{application.status}</b></td></tr>
              <tr><td className="muted">Moniker</td><td className="num">{application.moniker}</td></tr>
              <tr><td className="muted">Validator address</td><td className="num">{toValoperAddress(address)}</td></tr>
              <tr><td className="muted">Self-delegation</td><td className="num">{application.selfDelegationAmount} {application.denom}</td></tr>
              <tr><td className="muted">Submitted</td><td className="num">{new Date(application.submittedAt).toLocaleString()}</td></tr>
              {application.reviewedAt && <tr><td className="muted">Reviewed</td><td className="num">{new Date(application.reviewedAt).toLocaleString()} by {application.reviewer}</td></tr>}
              {application.reviewNotes && <tr><td className="muted">Notes</td><td className="num">{application.reviewNotes}</td></tr>}
              {onChain && <tr><td className="muted">On-chain status</td><td className="num">{onChain.jailed ? <span className="red">Jailed (no live node — not producing blocks)</span> : onChain.status}</td></tr>}
            </tbody>
          </table>
        )}

        {application?.status === 'approved' && !onChain && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div className="tiny muted mb">
              Your application is approved. Activating creates a real on-chain validator self-bonded from your own wallet. This is a single-node
              devnet — there's no separate machine running a live consensus process for your validator, so it will show as jailed for missing
              blocks shortly after activation unless you run your own node with the generated key.
            </div>
            <button className="btn btn-primary" onClick={openActivate}>Activate validator</button>
          </div>
        )}

        {application?.status === 'approved' && onChain && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <span className="chip green">Validator active on-chain</span>
          </div>
        )}
      </div>

      {activateOpen && genKey && (
        <Modal title="Activate validator" onClose={() => setActivateOpen(false)} wide>
          <div className="tiny muted mb">
            A fresh consensus key was generated in your browser and has not been sent anywhere. Save it now if you intend to run a real validator
            node under this identity later — without a matching live node, this key isn't needed again and the validator simply won't produce
            blocks.
          </div>
          <div className="card" style={{ padding: 12, marginBottom: 12, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
            <div className="muted">Consensus pubkey</div>
            <div>{genKey.pubkeyBase64}</div>
          </div>
          <button className="btn btn-ghost mb" onClick={downloadKey}>Download key file</button>
          {!keySaved && <div className="tiny red mb">You haven't downloaded the key yet — once broadcast, it can't be retrieved again.</div>}
          <button className="btn btn-primary" disabled={activating} onClick={activate}>
            {activating && <span className="spin" />} Broadcast MsgCreateValidator
          </button>
        </Modal>
      )}
    </div>
  );
}
