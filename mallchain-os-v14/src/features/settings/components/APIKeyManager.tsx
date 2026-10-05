import { useCallback, useEffect, useState } from 'react';
import { apiKeyApi, type APIKey, type CreateKeyRequest } from '../../../services/apiKeyApi';
import { useStoreVersion, toast } from '../../../components/ui';
import './APIKeyManager.css';

export function APIKeyManager() {
  useStoreVersion();
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyResponse, setNewKeyResponse] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Create form state
  const [formData, setFormData] = useState<CreateKeyRequest>({
    name: '',
    scope: ['read:profile'],
    expiresInDays: 30,
    environment: 'development',
    rateLimitPerMinute: 60,
    ipWhitelist: [],
  });

  const [ipInput, setIpInput] = useState('');

  // Load API keys
  const loadKeys = useCallback(async () => {
    setLoading(true);
    const res = await apiKeyApi.listKeys();
    if (res.ok && res.data) {
      setKeys(res.data);
    } else {
      toast(res.error || 'Failed to load API keys', false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreateKey = async () => {
    if (!formData.name.trim()) {
      toast('Key name is required', false);
      return;
    }

    if (formData.scope.length === 0) {
      toast('At least one scope is required', false);
      return;
    }

    setLoading(true);
    const res = await apiKeyApi.generateKey(formData);
    setLoading(false);

    if (res.ok && res.data) {
      setNewKeyResponse(res.data);
      setFormData({
        name: '',
        scope: ['read:profile'],
        expiresInDays: 30,
        environment: 'development',
        rateLimitPerMinute: 60,
        ipWhitelist: [],
      });
      setIpInput('');
      toast('API key created successfully');
      await loadKeys();
    } else {
      toast(res.error || 'Failed to create API key', false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!window.confirm('Are you sure you want to revoke this API key? It cannot be undone.')) {
      return;
    }

    const res = await apiKeyApi.revokeKey(keyId);
    if (res.ok) {
      toast('API key revoked');
      await loadKeys();
    } else {
      toast(res.error || 'Failed to revoke API key', false);
    }
  };

  const handleRotateKey = async (keyId: string) => {
    if (!window.confirm('This will revoke the old key and generate a new one. Continue?')) {
      return;
    }

    const res = await apiKeyApi.rotateKey(keyId);
    if (res.ok && res.data) {
      setNewKeyResponse(res.data);
      toast('API key rotated');
      await loadKeys();
    } else {
      toast(res.error || 'Failed to rotate API key', false);
    }
  };

  const handleCopyKey = () => {
    if (newKeyResponse?.key) {
      navigator.clipboard.writeText(newKeyResponse.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleScope = (scope: string) => {
    setFormData((prev) => ({
      ...prev,
      scope: prev.scope.includes(scope)
        ? prev.scope.filter((s) => s !== scope)
        : [...prev.scope, scope],
    }));
  };

  const addIpToWhitelist = () => {
    if (!ipInput.trim()) return;
    setFormData((prev) => ({
      ...prev,
      ipWhitelist: [...(prev.ipWhitelist || []), ipInput.trim()],
    }));
    setIpInput('');
  };

  const removeIpFromWhitelist = (ip: string) => {
    setFormData((prev) => ({
      ...prev,
      ipWhitelist: (prev.ipWhitelist || []).filter((i) => i !== ip),
    }));
  };

  const scopeCategories = {
    'Read Operations': ['read:wallet', 'read:transactions', 'read:profile', 'read:notifications'],
    'Write Operations': ['write:transactions', 'write:profile', 'write:notifications', 'write:security'],
    'Admin Operations': ['admin:audit', 'admin:users'],
  };

  if (loading && keys.length === 0) {
    return <div className="tiny">Loading API keys…</div>;
  }

  return (
    <div className="card mb">
      <div className="sec-title">
        <h2>API Keys</h2>
        <span className="sub">Programmatic access for integrations</span>
      </div>

      {/* Key List */}
      {keys.length > 0 ? (
        <div className="api-key-list">
          {keys.map((key) => (
            <div key={key._id} className="api-key-item">
              <div className="api-key-header">
                <div>
                  <div className="api-key-name">{key.name}</div>
                  <div className="api-key-prefix">
                    {key.keyPrefix}**** · {key.environment}
                  </div>
                </div>
                <div
                  className="api-key-status"
                  style={{
                    backgroundColor:
                      key.status === 'active'
                        ? 'rgba(34,197,94,0.15)'
                        : key.status === 'expired'
                          ? 'rgba(239,68,68,0.15)'
                          : 'rgba(156,163,175,0.15)',
                    color:
                      key.status === 'active'
                        ? 'var(--green)'
                        : key.status === 'expired'
                          ? 'var(--red)'
                          : 'var(--txt-3)',
                  }}
                >
                  {key.status === 'active' ? '✓ Active' : key.status === 'expired' ? '⏱ Expired' : '✕ Revoked'}
                </div>
              </div>

              <div className="api-key-details">
                <div className="detail">
                  <span className="label">Scopes:</span>
                  <span className="value">
                    {key.scope.join(', ') || 'None'}
                  </span>
                </div>
                <div className="detail">
                  <span className="label">Expires:</span>
                  <span className="value">
                    {new Date(key.expiresAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="detail">
                  <span className="label">Usage:</span>
                  <span className="value">
                    {key.usageCount} requests
                  </span>
                </div>
                {key.lastUsedAt && (
                  <div className="detail">
                    <span className="label">Last used:</span>
                    <span className="value">
                      {new Date(key.lastUsedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="api-key-actions">
                {key.status === 'active' && (
                  <>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleRotateKey(key._id)}
                      title="Rotate this key if compromised"
                    >
                      🔄 Rotate
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleRevokeKey(key._id)}
                      style={{ color: 'var(--red)' }}
                    >
                      ✕ Revoke
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="tiny" style={{ padding: 20, textAlign: 'center', color: 'var(--txt-3)' }}>
          No API keys created yet. Create one to enable programmatic access.
        </div>
      )}

      {/* Create Key Button */}
      <button
        className="btn btn-primary btn-block"
        onClick={() => setShowCreateModal(true)}
        style={{ marginTop: 16 }}
      >
        + Create New API Key
      </button>

      {/* New Key Modal */}
      {(showCreateModal || newKeyResponse) && (
        <div className="modal-overlay" onClick={() => !newKeyResponse && setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {newKeyResponse ? (
              <>
                <h2>🎉 API Key Created</h2>
                <div style={{ marginTop: 16, padding: 16, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
                  <div className="tiny" style={{ marginBottom: 8, color: 'var(--txt-3)' }}>
                    Save this key in a secure location. You will not be able to see it again.
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: 12,
                      backgroundColor: 'var(--surface)',
                      borderRadius: 6,
                      border: '1px solid var(--outline)',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      wordBreak: 'break-all',
                    }}
                  >
                    <span style={{ flex: 1 }}>{newKeyResponse.key}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleCopyKey}
                      title="Copy to clipboard"
                    >
                      {copied ? '✓ Copied' : '📋'}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 16, padding: 12, backgroundColor: 'var(--surface-alt)', borderRadius: 8 }}>
                  <div className="tiny" style={{ fontWeight: 600 }}>Key Details</div>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <div>Name: {newKeyResponse.name}</div>
                    <div>Environment: {newKeyResponse.environment}</div>
                    <div>Expires: {new Date(newKeyResponse.expiresAt).toLocaleDateString()}</div>
                    <div>Scopes: {newKeyResponse.scope.join(', ')}</div>
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    setNewKeyResponse(null);
                    setShowCreateModal(false);
                  }}
                  style={{ marginTop: 16 }}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h2>Create API Key</h2>

                <div className="field" style={{ marginTop: 16 }}>
                  <label>Key Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g., Mobile App, GitHub Actions"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="field">
                  <label>Environment</label>
                  <select
                    className="input"
                    value={formData.environment}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        environment: e.target.value as any,
                      }))
                    }
                  >
                    <option value="development">Development</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </select>
                </div>

                <div className="field">
                  <label>Expiration (days)</label>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    max="365"
                    value={formData.expiresInDays}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        expiresInDays: Math.max(1, Math.min(365, parseInt(e.target.value) || 30)),
                      }))
                    }
                  />
                </div>

                <div className="field">
                  <label>Rate Limit (requests/minute)</label>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    max="10000"
                    value={formData.rateLimitPerMinute}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        rateLimitPerMinute: Math.max(1, Math.min(10000, parseInt(e.target.value) || 60)),
                      }))
                    }
                  />
                </div>

                <div className="field">
                  <label>Scopes</label>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {Object.entries(scopeCategories).map(([category, scopes]) => (
                      <div key={category}>
                        <div className="tiny" style={{ fontWeight: 600, marginBottom: 6, color: 'var(--txt-3)' }}>
                          {category}
                        </div>
                        <div style={{ display: 'grid', gap: 4, marginLeft: 8 }}>
                          {scopes.map((scope) => (
                            <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={formData.scope.includes(scope)}
                                onChange={() => toggleScope(scope)}
                              />
                              <span className="tiny">{scope}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>IP Whitelist (optional)</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g., 192.168.1.0 or 10.0.0.*"
                      value={ipInput}
                      onChange={(e) => setIpInput(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-ghost" onClick={addIpToWhitelist}>
                      Add
                    </button>
                  </div>
                  {(formData.ipWhitelist || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {formData.ipWhitelist!.map((ip) => (
                        <div key={ip} className="chip" style={{ fontSize: 11 }}>
                          {ip}
                          <button
                            style={{
                              marginLeft: 6,
                              background: 'none',
                              border: 'none',
                              color: 'inherit',
                              cursor: 'pointer',
                            }}
                            onClick={() => removeIpFromWhitelist(ip)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={handleCreateKey} disabled={loading}>
                    {loading ? <span className="spin" /> : ''}
                    Create Key
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="tiny" style={{ marginTop: 16, padding: 10, backgroundColor: 'var(--surface-alt)', borderRadius: 6, color: 'var(--txt-3)' }}>
        <strong>💡 Tips:</strong> API keys grant access to your account. Treat them like passwords. Use separate keys for
        different apps. Rotate compromised keys immediately. Always use HTTPS. Never commit keys to version control.
      </div>
    </div>
  );
}
