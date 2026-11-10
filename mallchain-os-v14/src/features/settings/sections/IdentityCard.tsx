import { useState } from 'react';
import { Modal, toast } from '../../../components/ui';
import { kycApi } from '../../../services/kycApi';
import { Card } from './Shell';
import { kycChip } from './status';
import type { SettingsData } from '../hooks/useSettingsData';

/**
 * Step 03 — what the identity reviewers hold, read back from the server.
 *
 * Read-only on purpose: these are the answers from a submitted application
 * (backend/src/routes/kyc.js), and the app has no route that edits them, so
 * every box here is a fact being reported, not a field that looks editable and
 * silently discards typing. To change any of it a person re-submits.
 */

function Detail({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <div className="tiny">{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{value || '—'}</div>
    </div>
  );
}

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : undefined);

export function IdentityCard({ data }: { data: SettingsData }) {
  const kyc = data.kyc;
  const [doc, setDoc] = useState<{ blobUrl: string; loading: boolean } | null>(null);

  const viewDocument = async () => {
    if (!kyc?.kycId) return;
    setDoc({ blobUrl: '', loading: true });
    const res = await kycApi.fetchDocumentBlobUrl(kyc.kycId);
    if (res.ok && res.data) setDoc({ blobUrl: res.data, loading: false });
    else {
      toast(res.error || 'Failed to load document', false);
      setDoc(null);
    }
  };

  // The blob outlives the modal, not the page: keeping it alive pins the
  // document image in memory for the rest of the session.
  const closeDoc = () => {
    if (doc?.blobUrl) URL.revokeObjectURL(doc.blobUrl);
    setDoc(null);
  };

  const chip = kycChip(kyc?.status);

  return (
    <Card
      title="Identity details"
      hint="Exactly what your submitted application contains. Nothing here is editable from this page — a correction means re-submitting."
      state={<span className="chip" style={{ color: chip.color, borderColor: chip.color, marginLeft: 'auto' }}>{chip.label}</span>}
      missing={data.has('kyc') ? undefined : 'the identity verification record'}
      onRetry={data.reload}
      busy={data.loading}
    >
      {!kyc || kyc.status === 'not_submitted' ? (
        <p className="ps-note">
          No application has been submitted on this account. Verification is completed as part of signing up.
        </p>
      ) : (
        <>
          <p className="ps-note" style={{ marginTop: 0, marginBottom: 4 }}>
            Submitted {day(kyc.submittedAt) || '—'}
            {kyc.reviewedAt ? ` · reviewed ${day(kyc.reviewedAt)}` : ''}
            {kyc.status === 'rejected' && kyc.notes ? ` · reason: ${kyc.notes}` : ''}
          </p>

          <div className="ps-sub">Personal</div>
          <div className="ps-grid">
            <Detail label="First name" value={kyc.personal?.firstName} />
            <Detail label="Last name" value={kyc.personal?.lastName} />
            <Detail label="Date of birth" value={day(kyc.personal?.dateOfBirth)} />
            <Detail label="Nationality" value={kyc.personal?.nationality} />
          </div>

          <div className="ps-sub">Address</div>
          <div className="ps-grid">
            <Detail label="Address" value={kyc.address?.address} />
            <Detail label="City" value={kyc.address?.city} />
            <Detail label="Country" value={kyc.address?.country} />
            <Detail label="Postal code" value={kyc.address?.postalCode} />
            <Detail label="Phone on the application" value={kyc.address?.phoneNumber} />
          </div>

          <div className="ps-sub">Document</div>
          <div className="ps-grid">
            <Detail label="Type" value={kyc.identity?.idType?.replace('_', ' ')} />
            <Detail label="Number" value={kyc.identity?.idNumber} />
            <Detail label="Expires" value={day(kyc.identity?.idExpiry)} />
            <div>
              <div className="tiny">Scan on file</div>
              {kyc.hasDocument ? (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 2 }} onClick={viewDocument}>View document</button>
              ) : (
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--txt-3)' }}>Not uploaded</div>
              )}
            </div>
          </div>

          <div className="ps-sub">Financial</div>
          <div className="ps-grid">
            <Detail label="Occupation" value={kyc.financial?.occupation} />
            <Detail label="Source of funds" value={kyc.financial?.sourceOfFunds} />
            <Detail label="Annual income" value={kyc.financial?.annualIncome} />
            <Detail label="Politically exposed" value={kyc.financial?.politicalExposure ? 'Yes' : 'No'} />
          </div>
        </>
      )}

      {doc && (
        <Modal title="Submitted ID document" onClose={closeDoc}>
          {doc.loading ? (
            <div className="tiny" style={{ padding: 20 }}>Loading…</div>
          ) : (
            <img src={doc.blobUrl} alt="ID document" style={{ maxWidth: '100%', borderRadius: 8 }} onError={() => window.open(doc.blobUrl, '_blank')} />
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => window.open(doc.blobUrl, '_blank')}>Open in new tab</button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
