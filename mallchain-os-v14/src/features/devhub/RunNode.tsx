import { useEffect, useState } from 'react';
import { toast } from '../../components/ui';
import { config } from '../../services/config';

/**
 * Live bundle listing served by backend/src/routes/downloads.js at
 * /downloads/node/. The backend discovers the newest artifacts by mtime, so
 * this page must never hardcode a version string — after every
 * scripts/build-validator-bundle.sh run the names, sizes and checksums change.
 */
interface NodeDownloads {
  bundles?: Record<string, { fileName?: string; bytes?: number; sha256?: string }>;
  fullBundle?: { fileName?: string; bytes?: number };
}

const NODE_DOWNLOAD_BASE = `${config.apiBaseUrl.replace(/\/$/, '')}/downloads/node`;

const mb = (bytes?: number) => (bytes ? `${Math.round(bytes / 1024 / 1024)} MB` : '—');
const dirOf = (zip?: string) => (zip ? zip.replace(/\.zip$/, '') : 'the unpacked folder');

/** 'mallchain-node-v3cdd575d-pricing-band-linux-amd64.zip' → the middle part, which is what `marketplaced version` prints. */
const versionOf = (zip?: string) => {
  const m = /^mallchain-node-(.+)-linux-[a-z0-9]+\.zip$/.exec(zip || '');
  return m ? m[1] : 'live listing unavailable';
};

/** Run a node — the bundle listing is read from the backend, never hardcoded. */
export function RunNode() {
  const [nodeDl, setNodeDl] = useState<NodeDownloads | null>(null);
  const [listingFailed, setListingFailed] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    // Best-effort: the listing is public, but this tab must still render if the
    // backend is offline, so a failure only affects the bundle-name line.
    fetch(`${NODE_DOWNLOAD_BASE}/`)
      .then((r) => (r.ok ? (r.json() as Promise<NodeDownloads>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { setNodeDl(d); setListingFailed(false); })
      .catch(() => setListingFailed(true));
  }, []);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(''), 1600);
      toast('Copied');
    } catch {
      toast('Clipboard is blocked in this browser', false);
    }
  };

  const snippets = [
    {
      lang: 'Verify the download',
      code: `unzip ${nodeDl?.fullBundle?.fileName ?? 'mallchain-node-<version>.zip'} && cd ${dirOf(nodeDl?.bundles?.amd64?.fileName)}\nsha256sum -c SHA256SUMS.txt   # every file must report OK`,
    },
    {
      lang: 'Verify chain data yourself',
      code: `# your own node, your own truth — no mallchain.com backend involved\nRPC="http://127.0.0.1:26657"; API="http://127.0.0.1:1317"\ncurl -s $RPC/status | jq '.result.sync_info'          # height + latest_app_hash\ncurl -s $API/cosmos/staking/v1beta1/validators | jq '.validators|length'\ncurl -s $API/cosmos/bank/v1beta1/supply | jq          # real supply, straight from state`,
    },
    {
      lang: 'Point the console at your own node',
      code: `# Once your node is synced, its REST gateway answers the same queries\n# the developer API does — no account, no key, no rate limit.\ncurl -s http://127.0.0.1:1317/cosmos/base/tendermint/v1beta1/blocks/latest | jq '.block.header | {height,chain_id,time}'`,
    },
  ];

  return (
    <div>
      <div className="card card-glow bg-gradient-card" style={{ padding: 16 }}>
        <div className="sec-title"><h2>Run a node</h2><span className="sub">don't trust, verify</span></div>
        <div className="dh-note" style={{ marginBottom: 14 }}>
          Anyone in the world can run a Mallchain validator or full node on their own PC. A node needs
          <b> only</b> the chain binary, <span className="mono">genesis.json</span> and a peer list — never our
          Express backend or MongoDB (those are the web app's off-chain API layer, not consensus). Your node
          re-executes every block itself and checks app hashes, so you verify the ledger instead of trusting it.
        </div>
        <div className="dh-note" style={{ marginBottom: 14 }}>
          <b>In the bundle:</b> <span className="mono">marketplaced</span> + <span className="mono">gen-node-home</span> binaries (linux/amd64 &amp; arm64, statically linked),
          verified <span className="mono">genesis.json</span>, config templates (correct ports, gRPC safely disabled), real peer ID, <span className="mono">INSTALL.md</span>, <span className="mono">PEERS.md</span>, <span className="mono">CREATE_VALIDATOR.sh</span>, <span className="mono">VERSION.txt</span> and <span className="mono">SHA256SUMS.txt</span>.
        </div>
        <div className="dh-rail-row">
          <a className="btn btn-primary" href={`${NODE_DOWNLOAD_BASE}/amd64.zip`} download>linux / amd64</a>
          <a className="btn btn-primary" href={`${NODE_DOWNLOAD_BASE}/arm64.zip`} download>linux / arm64</a>
          <a className="btn btn-ghost" href={`${NODE_DOWNLOAD_BASE}/full.zip`} download>Combined zip</a>
          <a className="btn btn-ghost" href={`${NODE_DOWNLOAD_BASE}/sha256sums.txt`}>SHA256 checksums</a>
          <a className="btn btn-ghost" href={`${NODE_DOWNLOAD_BASE}/docs`} target="_blank" rel="noreferrer">Setup guide</a>
        </div>
        <div className="dh-facts" style={{ marginTop: 14 }}>
          <div className="dh-fact"><div className="dh-fact-k">Build</div><div className="dh-fact-v mono">{versionOf(nodeDl?.bundles?.amd64?.fileName)}</div></div>
          <div className="dh-fact"><div className="dh-fact-k">amd64</div><div className="dh-fact-v">{mb(nodeDl?.bundles?.amd64?.bytes)}</div></div>
          <div className="dh-fact"><div className="dh-fact-k">arm64</div><div className="dh-fact-v">{mb(nodeDl?.bundles?.arm64?.bytes)}</div></div>
          <div className="dh-fact"><div className="dh-fact-k">Combined</div><div className="dh-fact-v">{mb(nodeDl?.fullBundle?.bytes)}</div></div>
        </div>
        <div className="dh-hintline" style={{ marginTop: 10 }}>
          {listingFailed
            ? <>The live listing at <span className="mono">{NODE_DOWNLOAD_BASE}/</span> did not answer, so sizes and the build name are unknown. The download links still point at the backend's newest artifacts.</>
            : <>Served live by the backend at <span className="mono">{NODE_DOWNLOAD_BASE}/</span> — the index lists checksums and sizes.</>}
          {' '}If a route 404s the bundle is missing from <span className="mono">backend/build/validator-bundle/zips/</span>; rebuild with <span className="mono">scripts/build-validator-bundle.sh</span>.
        </div>
      </div>

      {snippets.map((s) => (
        <div className="card mt card-glow bg-gradient-card" key={s.lang} style={{ padding: 16 }}>
          <div className="code-block" style={{ margin: 0 }}>
            <div className="code-head"><span className="chip">{s.lang}</span><button className="btn btn-ghost btn-sm" onClick={() => copy(s.code)}>{copied === s.code ? '✓ copied' : 'Copy'}</button></div>
            <pre>{s.code}</pre>
          </div>
        </div>
      ))}
    </div>
  );
}