import { useCallback, useEffect, useState } from 'react';
import { config } from '../../services/config';
import { api } from '../../services/api';
import { validatorsApi, type ChainValidator } from '../../services/validatorsApi';
import { useStoreVersion, fmtNum } from '../../components/ui';
import { Server, Shield, Download, Eye, Copy, RefreshCw, AlertTriangle, Terminal } from 'lucide-react';

/**
 * Run a Node — public guide for operating marketplaced infrastructure on your
 * own hardware (anywhere in the world). Live "network status" comes from our
 * backend's read-only proxy to the chain (GET /api/blockchain/stats and
 * /api/validators/list); it is *convenience data only*: everything shown here
 * is independently verifiable by running your own node (that is the point of
 * this page). Never take our REST on trust — see docs/VALIDATOR_TRUST_MODEL.md.
 */

interface ChainStats {
  height: number;
  chainId: string;
  nodeVersion: string;
  averageBlockTime: number;
  totalTxs: number | null;
  time: string;
}

// Bundles are served by the backend (scripts/build-validator-bundle.sh stages them;
// backend/src/routes/downloads.js serves this whitelist), so dev and production
// both resolve to the same live URLs the landing page links.
const DOWNLOAD_BASE = `${config.apiBaseUrl.replace(/\/$/, '')}/downloads/node`;

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div className="lbl">{label}</div>
      <div className="num" style={{ fontSize: 22 }}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export default function RunANode({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [validators, setValidators] = useState<ChainValidator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [s, v] = await Promise.all([api.get<ChainStats>('/api/blockchain/stats'), validatorsApi.list()]);
    if (s.ok && s.data) setStats(s.data); else setError(s.error || 'Chain stats unavailable — node or backend proxy down');
    if (v.ok && v.data) setValidators(v.data.validators);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const copy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  };

  const bonded = (validators || []).filter((x) => x.status === 'BOND_STATUS_BONDED').length;

  return (
    <div>
      <div className="mc-hero">
        <h1 className="text-gradient">Run a Node</h1>
        <p>
          Mallchain is a Cosmos-SDK blockchain. Anybody, anywhere can run its software and verify its
          history themselves — no permission, no account on our site, no trust in our servers required.
          This page is the start of that door being open.
        </p>
        <div className="mc-hero-btns">
          <button className="btn btn-primary" onClick={() => navigate('/validators')}><Shield size={14} /> Become a Validator</button>
          <button className="btn btn-ghost" onClick={() => copy(`${DOWNLOAD_BASE}/`)}><Copy size={14} /> Copy download base URL</button>
        </div>
      </div>

      {/* ---------- live network status ---------- */}
      <div className="sec-title">Network status — live (via our public API proxy)</div>
      {error && (
        <div className="wallet-error-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span>{error} — our backend (API proxy) may be restarting; retry below or verify directly from your own node.</span>
        </div>
      )}
      <div className="mc-stats-grid stagger">
        <StatBox label="Chain ID" value={stats?.chainId ?? '—'} sub="live network identity" />
        <StatBox label="Block Height" value={stats ? fmtNum(stats.height) : '—'} sub={stats ? `last block ${new Date(stats.time).toLocaleTimeString()}` : ''} />
        <StatBox label="Bonded Validators" value={validators ? `${bonded}` : '—'} sub={validators ? `${validators.length} known in set (max 100)` : ''} />
        <StatBox label="Avg Block Time" value={stats && stats.averageBlockTime ? `${stats.averageBlockTime.toFixed(2)}s` : '—'} sub="measured on-chain" />
        <StatBox label="Node Version" value={stats?.nodeVersion ?? '—'} sub="CometBFT / marketplaced" />
      </div>
      <p className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <RefreshCw size={12} /> {refreshing ? 'refreshing…' : 'auto-refreshes every 15s'} — these numbers come from
        our reference node. <b>Independence means you stop needing them:</b> run your own node and read
        <code> /status</code> locally.
      </p>

      {/* ---------- why ---------- */}
      <div className="sec-title">Why run your own node?</div>
      <div className="card card-glow" style={{ padding: 18, display: 'grid', gap: 10 }}>
        <p>
          Our website and backend are one convenient view of the chain — not the truth. The truth is the
          replicated state that validators produce. When you run a node you re-download and <b>re-execute every
          block</b>: balances, stakes, emissions, governance. If our database ever disagreed with the chain,
          your node would simply be right and we would be visibly wrong. That is the trust model we want —
          "don't trust, verify" (<code>docs/VALIDATOR_TRUST_MODEL.md</code>).
        </p>
        <p>
          What you do <b>not</b> get (and don't need): our marketplace backend and MongoDB. They contain user
          PII/KYC and an off-chain ledger that is itself reconciled <i>from</i> the chain (hourly job + hash-chained
          audit trail being added now). Chain state travels; private ledgers don't. The block explorer UI,
          however, is self-hostable against your node (see the repo's <code>explorer/</code>).
        </p>
      </div>

      {/* ---------- node types ---------- */}
      <div className="sec-title">Which node do you want?</div>
      <div className="mc-stats-grid stagger">
        <div className="card" style={{ padding: 16 }}>
          <Server size={18} /> <b>Full node</b>
          <p className="sub">Stores + validates every block, serves RPC/P2P. The default choice: verify everything, no rewards, low maintenance.</p>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <Eye size={18} /> <b>RPC node</b>
          <p className="sub">A full node with the REST API (1317) enabled and fronted by a reverse proxy — serves wallets/dapps (like mallwallet or your own tooling). Keep RPC on localhost unless you proxy it.</p>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <Shield size={18} /> <b>Validator</b>
          <p className="sub">A full node that signs blocks with bonded <code>stake</code> and earns commission. Requires uptime; downtime beyond the signing window jails you. Apply on the Validators page, then run CREATE_VALIDATOR.sh.</p>
        </div>
      </div>

      {/* ---------- download ---------- */}
      <div className="sec-title">Download &amp; install</div>
      <div className="card card-glow bg-gradient-card" style={{ padding: 18, display: 'grid', gap: 12 }}>
        <div className="t"><Download size={16} /> Node bundles</div>
        <p className="sub">
          Served by the network API at <code>{DOWNLOAD_BASE}/</code> — per-architecture bundles
          (<code>amd64.zip</code>, <code>arm64.zip</code>), the combined bundle (<code>full.zip</code>),
          <code> sha256sums.txt</code> and the setup guide (<code>docs</code>).
          Each bundle contains the binary, a <code>gen-node-home</code> helper, <b>genesis.json exported live from
          the running chain</b>, example configs, and a step-by-step INSTALL.md.
        </p>
        <ol className="sub" style={{ paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li>Verify: <code>sha256sum -c sha256sums.txt</code> — do not run an unverified binary.</li>
          <li>Create the node home — <b>the binary has NO <code>init</code> command</b>; use the bundled
            <code> gen-node-home &lt;home-dir&gt;</code>.</li>
          <li>Copy <code>genesis.json</code> + configs, set <code>moniker</code> and <code>persistent_peers</code>.</li>
          <li>Start: <code>marketplaced start --home ~/.mallchain</code>, wait for <code>catching_up:false</code>.</li>
          <li>Optional: <code>./CREATE_VALIDATOR.sh</code> — it refuses to run until your node is synced and tells you
            if your consensus key is already a validator (idempotent).</li>
        </ol>
        <div className="wallet-error-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <span>Two known traps the bundle respects: never enable gRPC on port 9090 (it silently kills the REST API
            on 1317 in this stack), and <code>marketplaced tendermint show-node-id</code> prints to <b>stderr</b>.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a className="btn btn-primary" href={`${DOWNLOAD_BASE}/amd64.zip`} download><Download size={14} /> amd64 bundle</a>
          <a className="btn btn-primary" href={`${DOWNLOAD_BASE}/arm64.zip`} download><Download size={14} /> arm64 bundle</a>
          <a className="btn btn-ghost" href={`${DOWNLOAD_BASE}/docs`} target="_blank" rel="noreferrer"><Eye size={14} /> Setup guide</a>
          <button className="btn btn-ghost" onClick={() => copy(`${DOWNLOAD_BASE}/sha256sums.txt`)}><Copy size={14} /> Copy checksums URL</button>
          <button className="btn btn-ghost" onClick={() => copy('marketplaced start --home $HOME/.mallchain')}><Terminal size={14} /> Copy start command</button>
        </div>
      </div>

      {/* ---------- peers, honest ---------- */}
      <div className="sec-title">Getting peers — current honest state</div>
      <div className="card" style={{ padding: 18, display: 'grid', gap: 10 }}>
        <p className="sub">
          Our reference node (moniker <b>AvastaIan</b>) runs on a Starlink residential connection, which is
          CGNAT: the P2P port is bound on <code>0.0.0.0:26656</code> but inbound traffic cannot reach the
          machine (verified — no router to configure, no static IP, external dials fail), and the HTTP-only
          tunnel that serves our API cannot carry raw TCP. <b>There is no stable public peer address
          yet.</b> Outbound dials from the reference node do work, so the fast path today is: open 26656 on
          your node, share your <code>node_id@&lt;public-ip&gt;:26656</code> with the operators (DevHub
          contact), and we add it to <code>persistent_peers</code> — the connection is bidirectional and you
          sync normally. A node on a public VPS with <code>external_address = "&lt;public-ip&gt;:26656"</code>
          set is what this network needs most — it would become the seed everyone joins self-service.
        </p>
        <p className="sub">
          Chain facts (verified live via <code>/cosmos/staking/v1beta1/params</code>): bond denom <b>stake</b>,
          max validators 100, unbonding 21 days, min commission 0.
        </p>
      </div>

      {/* ---------- verify independence ---------- */}
      <div className="sec-title">Verify our claims yourself</div>
      <div className="card" style={{ padding: 18 }}>
        <p className="sub">
          Once synced, compare your node's <code>latest_app_hash</code> at a given height with anyone else's.
          Equal hashes across independent machines mean identical state — that single check dissolves any dispute
          about balances or history, without our backend in the loop.
        </p>
      </div>
    </div>
  );
}
