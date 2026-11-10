import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, Modal, toast, fmtNum } from '../../components/ui';
import { validatorsApi, type ValidatorApplication, type ValidatorLeaderboardEntry } from '../../services/validatorsApi';
import { minesApi, type ReviewerProfile } from '../../services/minesApi';
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

/**
 * The chain record this page names is keyed by the operator address, so the
 * derivation runs on every render. Wallet state can hold a string that is not
 * bech32 at all (an older or hand-written account), and that has to show up as
 * an unreadable row rather than taking the section down with it.
 */
function safeValoper(accountAddress: string): string | null {
  try {
    return toValoperAddress(accountAddress);
  } catch {
    return null;
  }
}

/** My validator application status — real GET /api/validators/my-application lookup. */
export default function ValidatorsProfile() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [application, setApplication] = useState<ValidatorApplication | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onChain, setOnChain] = useState<ValidatorLeaderboardEntry | null>(null);
  const [bonded, setBonded] = useState<boolean | null>(null);
  const [reviewer, setReviewer] = useState<ReviewerProfile | null>(null);

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
      // onChainBonded is the backend's own read of BOND_STATUS_BONDED for the
      // address on the application — the only figure here that says what the
      // chain actually holds, as opposed to what an admin ticked.
      setBonded(typeof result.data.onChainBonded === 'boolean' ? result.data.onChainBonded : null);
      if (result.data.application) {
        const valoper = safeValoper(address);
        if (valoper) {
          const detail = await validatorsApi.getDetail(valoper);
          setOnChain(detail.ok && detail.data ? detail.data.validator : null);
        }
      }
    } else {
      setError(result.error || 'Failed to load application status');
    }
    // The reviewer bond is the other half of "staked" for review duties, and
    // this page is where a user decides what to do next — reading it here keeps
    // both halves of the rule on one screen instead of split across Mines.
    const prof = await minesApi.getReviewerProfile();
    setReviewer(prof.ok && prof.data ? prof.data : null);
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
        <div className="view-head"><h1 className="text-gradient">My Application</h1></div>
        <div className="card card-glow bg-gradient-card"><div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>Connect a wallet to view your validator application.</div></div>
      </div>
    );
  }

  const statusColor = application?.status === 'approved' ? 'var(--green)' : application?.status === 'rejected' ? 'var(--red-2)' : 'var(--gold)';
  const valoper = safeValoper(address);
  const reviewedOn = application?.reviewedAt ? new Date(application.reviewedAt).toLocaleDateString() : null;
  const bondState = bonded === null ? '—' : bonded ? 'Bonded' : onChain ? onChain.status : 'Not created';
  const eligible = reviewer ? reviewer.review_eligible ?? null : null;

  return (
    <div>
      <div className="view-head"><h1 className="text-gradient">My Application</h1><span className="sub">{address}</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      {application !== undefined && (
        <div className="earn-grid" style={{ marginBottom: 14 }}>
          <div className="card earn-card">
            <div className="lbl">Allowed by review</div>
            <div className="num" style={{ fontSize: 16, color: statusColor }}>{application ? application.status : 'none on file'}</div>
            <div className="def">
              {application
                ? application.status === 'approved'
                  ? 'An admin has approved this application, so this account may hold review duties — once it is also staked. Approval by itself creates nothing on the chain.'
                  : application.status === 'rejected'
                    ? 'An admin rejected this application, so no amount of staking makes this account a validator here.'
                    : 'Awaiting an admin decision. Nothing at all is granted until one is recorded.'
                : 'No application on file, so nothing has been allowed. Staking MLPTS without an approval gets you no review work.'}
            </div>
            <div className="src">validator_applications · status{reviewedOn ? `, reviewed ${reviewedOn}` : ', not yet reviewed'}</div>
          </div>

          <div className="card earn-card">
            <div className="lbl">Staked on-chain</div>
            <div className="num" style={{ fontSize: 16 }}>{bondState}</div>
            <div className="def">
              {bonded === null
                ? 'The chain was not reachable, so this says nothing yet — it is not a "no".'
                : bonded
                  ? 'Your own signed MsgCreateValidator self-bond is in the bonded set, so the chain counts this validator.'
                  : onChain
                    ? `The chain has this validator as ${onChain.status}${onChain.jailed ? ', and jailed for missing blocks' : ''} — it is recorded, but not validating.`
                    : application?.status === 'approved'
                      ? 'No self-bond has landed for this address, so the chain does not know this validator exists yet. Use Activate below to sign one from your own wallet.'
                      : application
                        ? application.status === 'rejected'
                          ? 'The chain has no validator for this address, and an approval is needed before anything can be signed.'
                          : 'No self-bond has landed for this address, and none can be signed while the application is still awaiting an admin decision.'
                        : 'There is no application on file, so there is nothing here to bond — apply first.'}
            </div>
            <div className="src">cosmos/staking v1beta1 validators · {valoper ?? 'operator address not derived'}</div>
          </div>

          <div className="card earn-card">
            <div className="lbl">Reviewer bond</div>
            <div className="num">{reviewer ? `${fmtNum(reviewer.stakedAmount)} ` : '—'}{reviewer && <span className="unit" style={{ fontSize: 11 }}>MLPTS</span>}</div>
            <div className="def">
              {reviewer
                ? reviewer.stakeStatus === 'active'
                  ? `At or above the ${reviewer.minRequiredStake} MLPTS minimum, so the staked half of the rule is met. Off-chain deposit, separate from the on-chain self-bond above.`
                  : reviewer.stakeStatus === 'suspended'
                    ? `Suspended for missed votes, so nothing is assigned to you until it is rebuilt — ${reviewer.stakedAmount} MLPTS held.`
                    : `Below the ${reviewer.minRequiredStake} MLPTS minimum needed to be assigned reviews — you hold ${reviewer.stakedAmount}.`
                : 'Not loaded yet.'}
            </div>
            <div className="src">mines_reviewers · stakedAmount, stakeStatus</div>
          </div>

          <div className="card earn-card">
            <div className="lbl">Both halves together</div>
            <div className="num" style={{ fontSize: 16, color: eligible === true ? 'var(--green)' : eligible === false ? 'var(--gold)' : undefined }}>{eligible === null ? '—' : eligible ? 'Validator' : 'Not yet'}</div>
            <div className="def">
              {eligible === null
                ? 'The server could not read the approval list, so it is not known whether an approved application plus an active bond are both present.'
                : eligible
                  ? 'Approved and staked, which is what assignment, voting and reviewer rewards check.'
                  : 'Assignment requires an approved application AND an active reviewer bond. One of the two above is missing, so no task will reach you.'}
            </div>
            <div className="src">validatorEligibility.js · allowed AND staked</div>
          </div>
        </div>
      )}

      <div className="card card-glow bg-gradient-card" style={error ? { opacity: 0.65 } : undefined}>
        {loading && application === undefined && <div className="tiny">Loading…</div>}
        {error && !loading && (
          <div className="empty-state">
            <div className="es-ico">⚠️</div>
            <div className="es-t">Application data unavailable</div>
            <div className="es-m">Couldn't load your validator application status — try reloading the page or contact support if this persists.</div>
          </div>
        )}
        {!error && !loading && application === null && (
          <div className="empty-state"><div className="es-ico">📝</div><div className="es-t">No application on file</div><div className="es-m">Apply from the Validators home page.</div></div>
        )}
        {(!error && application) && (
          <table className="tbl">
            <tbody>
              <tr><td className="muted">Status</td><td className="num"><b style={{ color: statusColor }}>{application.status}</b></td></tr>
              <tr><td className="muted">Moniker</td><td className="num">{application.moniker}</td></tr>
              <tr><td className="muted">Validator address</td><td className="num">{valoper ?? 'not derived'}</td></tr>
              <tr><td className="muted">Self-delegation</td><td className="num">{application.selfDelegationAmount} {application.denom}</td></tr>
              <tr><td className="muted">Submitted</td><td className="num">{new Date(application.submittedAt).toLocaleString()}</td></tr>
              {application.reviewedAt && <tr><td className="muted">Reviewed</td><td className="num">{new Date(application.reviewedAt).toLocaleString()} by {application.reviewer}</td></tr>}
              {application.reviewNotes && <tr><td className="muted">Notes</td><td className="num">{application.reviewNotes}</td></tr>}
            </tbody>
          </table>
        )}

        {valoper && application?.status === 'approved' && bonded === false && !onChain && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div className="tiny muted mb">
              Your application is approved. Activating creates a real on-chain validator self-bonded from your own wallet. This is a single-node
              devnet — there's no separate machine running a live consensus process for your validator, so it will show as jailed for missing
              blocks shortly after activation unless you run your own node with the generated key.
            </div>
            <button className="btn btn-primary" onClick={openActivate}>Activate validator</button>
          </div>
        )}

        {application?.status === 'approved' && bonded === false && onChain && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div className="tiny muted">
              The chain already has a validator at {valoper} and reports it as {onChain.status}{onChain.jailed ? ', jailed for missed blocks' : ''}.
              MsgCreateValidator cannot be sent twice for the same address, so there is nothing left to broadcast here — running your node, then
              unjailing it, is what moves it into the bonded set.
            </div>
          </div>
        )}

        {bonded === true && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <span className="chip green">Bonded on-chain</span>
          </div>
        )}

        {bonded === null && application !== undefined && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div className="tiny muted mb">
              The chain node was unreachable, so whether this validator is bonded is unknown — not a "no". Nothing below was withheld because of a
              verdict; there simply was not one to read.
            </div>
            <button className="btn btn-ghost" onClick={load}>Re-check chain state</button>
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
