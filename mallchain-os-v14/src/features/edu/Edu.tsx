import { useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { eduApi, type EduResource, type EduCategory, type EduVerifyResponse } from '../../services/eduApi';

const CHAIN_LABEL: Record<EduResource['chain']['status'], string> = {
  registered: '⛓ Anchored on-chain',
  pending: '⏳ Anchoring…',
  failed: '⚠ Not anchored',
};
const CHAIN_COLOR: Record<EduResource['chain']['status'], string> = {
  registered: 'var(--green)',
  pending: 'var(--muted)',
  failed: 'var(--red)',
};

const CATEGORY_LABELS: Record<EduCategory, string> = {
  'blockchain-basics': 'Blockchain basics',
  tokenomics: 'Tokenomics',
  security: 'Security',
  governance: 'Governance',
  validators: 'Validators',
  general: 'General',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as EduCategory[];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** EDU — a real library of user-posted educational resources, browsable and downloadable by anyone. */
export default function Edu() {
  useStoreVersion();
  const st = store.state;

  const [resources, setResources] = useState<EduResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<EduCategory | ''>('');

  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EduCategory>('general');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newVersionOf, setNewVersionOf] = useState<EduResource | null>(null);

  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const [verifyResults, setVerifyResults] = useState<Record<string, EduVerifyResponse | null>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [historyData, setHistoryData] = useState<Record<string, EduResource[]>>({});

  const load = () => {
    setLoading(true);
    setError(null);
    eduApi.list({ category: categoryFilter || undefined, limit: 50 }).then((res) => {
      if (res.ok && res.data) setResources(res.data.resources);
      else setError(res.error || 'Failed to load resources');
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter]);

  const resetUploadForm = () => {
    setShowUpload(false);
    setNewVersionOf(null);
    setTitle('');
    setDescription('');
    setCategory('general');
    setFile(null);
  };

  const handleUpload = async () => {
    if (!file) { toast('Choose a file first', false); return; }
    if (title.trim().length < 3) { toast('Title must be at least 3 characters', false); return; }

    setUploading(true);
    const res = await eduApi.post({
      file,
      title: title.trim(),
      description: description.trim(),
      category,
      previousResourceId: newVersionOf?.id,
    });
    setUploading(false);

    if (res.ok) {
      toast(newVersionOf ? 'New version posted!' : 'Posted — thanks for contributing!');
      resetUploadForm();
      load();
    } else {
      toast(res.error || 'Upload failed', false);
    }
  };

  const startNewVersion = (r: EduResource) => {
    setNewVersionOf(r);
    setTitle(r.title);
    setDescription(r.description);
    setCategory(r.category);
    setFile(null);
    setShowUpload(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    const res = await eduApi.remove(id);
    if (res.ok) {
      toast('Removed');
      setResources((prev) => prev.filter((r) => r.id !== id));
    } else {
      toast(res.error || 'Failed to remove', false);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifying((prev) => ({ ...prev, [id]: true }));
    const res = await eduApi.verify(id);
    setVerifying((prev) => ({ ...prev, [id]: false }));
    if (res.ok && res.data) {
      setVerifyResults((prev) => ({ ...prev, [id]: res.data! }));
    } else {
      toast(res.error || 'Verification failed', false);
    }
  };

  const toggleHistory = async (id: string) => {
    const isOpen = historyOpen[id];
    setHistoryOpen((prev) => ({ ...prev, [id]: !isOpen }));
    if (!isOpen && !historyData[id]) {
      const res = await eduApi.history(id);
      if (res.ok && res.data) setHistoryData((prev) => ({ ...prev, [id]: res.data!.versions }));
    }
  };

  return (
    <div>
      <div className="view-head">
        <h1>EDU</h1>
        <span className="sub">Educational resources posted by the community — guides, decks, and short explainers anyone can download</span>
      </div>

      <div className="row" style={{ gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as EduCategory | '')}
          style={{ padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--txt)' }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        {st.user.authed ? (
          <button
            className="btn btn-primary"
            style={{ marginLeft: 'auto' }}
            onClick={() => (showUpload ? resetUploadForm() : setShowUpload(true))}
          >
            {showUpload ? 'Cancel' : '+ Post a resource'}
          </button>
        ) : (
          <span className="tiny muted" style={{ marginLeft: 'auto', alignSelf: 'center' }}>Sign in to post a resource</span>
        )}
      </div>

      {showUpload && (
        <div className="card mb">
          <div className="sec-title">
            <h2>{newVersionOf ? `New version of "${newVersionOf.title}"` : 'Post a new resource'}</h2>
          </div>
          {newVersionOf && (
            <div className="tiny muted" style={{ marginBottom: 8 }}>
              This will be linked on-chain as the next version of the existing document — its history stays intact.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ padding: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--txt)' }}
            />
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ padding: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--txt)', resize: 'vertical' }}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as EduCategory)}
              style={{ padding: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--txt)' }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.docx,.pptx,.mp4"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="tiny muted">PDF, image, text, Markdown, DOCX, PPTX, or MP4 — up to 50MB.</div>
            <button className="btn btn-primary" disabled={uploading} onClick={handleUpload}>
              {uploading ? 'Uploading…' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="empty-state"><div className="es-ico">⏳</div><div className="es-t">Loading resources…</div></div>
      )}

      {!loading && !error && resources.length === 0 && (
        <div className="empty-state">
          <div className="es-ico">📚</div>
          <div className="es-t">No resources yet</div>
          <div className="tiny muted">Be the first to post something in this category.</div>
        </div>
      )}

      {!loading && resources.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {resources.map((r) => {
            const isAuthor = st.user.authed && r.authorId === st.user.id;
            const vr = verifyResults[r.id];
            return (
              <div key={r.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 16 }}>{r.title}</h3>
                      <span className="chip tiny">{CATEGORY_LABELS[r.category]}</span>
                      <span className="tiny" style={{ color: CHAIN_COLOR[r.chain.status] }} title={r.chain.error}>
                        {CHAIN_LABEL[r.chain.status]}
                      </span>
                    </div>
                    {r.description && <div className="tiny muted" style={{ marginBottom: 6 }}>{r.description}</div>}
                    <div className="tiny muted">
                      by {r.authorName} · {fmtBytes(r.fileSizeBytes)} · {r.downloadCount} download{r.downloadCount === 1 ? '' : 's'} · {new Date(r.createdAt).toLocaleDateString()}
                      {r.chain.version > 1 && ` · v${r.chain.version}`}
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <button
                        className="tiny"
                        style={{ cursor: 'pointer', color: 'var(--cyan)', background: 'none', border: 'none', padding: 0 }}
                        onClick={() => handleVerify(r.id)}
                        disabled={verifying[r.id]}
                      >
                        {verifying[r.id] ? 'Verifying…' : 'Verify integrity'}
                      </button>
                      <button
                        className="tiny"
                        style={{ cursor: 'pointer', color: 'var(--cyan)', background: 'none', border: 'none', padding: 0 }}
                        onClick={() => toggleHistory(r.id)}
                      >
                        {historyOpen[r.id] ? 'Hide history' : 'Version history'}
                      </button>
                    </div>

                    {vr && (
                      <div className="tiny" style={{ marginTop: 8, color: vr.verified ? 'var(--green)' : 'var(--red)' }}>
                        {vr.verified
                          ? '✓ Matches the on-chain record — unmodified since upload.'
                          : vr.reason === 'not-anchored'
                            ? '⚠ Not yet anchored on-chain, so this can only be checked, not proven.'
                            : vr.reason === 'chain-unreachable'
                              ? '⚠ Could not reach the chain to verify right now — try again shortly.'
                              : vr.unmodifiedSinceUpload
                                ? '⚠ File matches its upload hash, but the on-chain record could not be confirmed.'
                                : '✗ File does NOT match its upload hash — it may have been altered.'}
                      </div>
                    )}

                    {historyOpen[r.id] && (
                      <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
                        {!historyData[r.id] ? (
                          <div className="tiny muted">Loading…</div>
                        ) : (
                          historyData[r.id].map((v) => (
                            <div key={v.id} className="tiny muted" style={{ marginBottom: 4 }}>
                              v{v.chain.version || 1} — {new Date(v.createdAt).toLocaleDateString()}
                              {v.id === r.id ? ' (this version)' : ''}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <a
                      className="btn btn-ghost"
                      href={eduApi.downloadUrl(r.id)}
                      download={r.fileName}
                    >
                      ⬇ Download
                    </a>
                    {isAuthor && (
                      <button className="btn btn-ghost" onClick={() => startNewVersion(r)}>New version</button>
                    )}
                    {st.user.authed && (isAuthor || st.user.role === 'admin' || st.user.role === 'superadmin') && (
                      <button className="btn btn-ghost" onClick={() => handleDelete(r.id)}>Remove</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
