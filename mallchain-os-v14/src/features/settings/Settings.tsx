import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { config } from '../../services/config';

/** Settings — theme accent, currency, language (applied app-wide). */
export default function Settings() {
  useStoreVersion();
  const st = store.state;

  const applyAccent = (a: string) => {
    const map: Record<string, string> = { gold: '#f3ba2f', cyan: '#22d3ee', purple: '#a78bfa', emerald: '#34d399' };
    document.documentElement.style.setProperty('--accent', map[a]);
    st.prefs.accent = a as never;
    store.commit();
    toast('Accent → ' + a);
  };

  const toggleDemo = () => {
    if (st.settings.demoMode) {
      if (window.confirm('Disable demo mode? This clears local demo data and shows production empty states.')) {
        localStorage.removeItem('mallchain_os_v1_v14');
        window.location.reload();
      }
    } else {
      st.settings.demoMode = true;
      store.commit();
      toast('Demo mode enabled — reseeding on reload');
    }
  };

  return (
    <div>
      <div className="view-head"><h1>Settings</h1><span className="sub">preferences apply app-wide</span></div>

      <div className="card mb">
        <div className="sec-title"><h2>Theme accent</h2></div>
        <div className="row">
          {['gold', 'cyan', 'purple', 'emerald'].map((a) => (
            <button key={a} className={'btn ' + (st.prefs.accent === a ? 'btn-primary' : 'btn-ghost')} onClick={() => applyAccent(a)}>{a}</button>
          ))}
        </div>
      </div>

      <div className="card mb">
        <div className="sec-title"><h2>Currency</h2><span className="sub">re-formats all fiat amounts app-wide</span></div>
        <div className="row">
          {['USD', 'KES', 'EUR', 'GBP'].map((c) => (
            <button key={c} className={'btn ' + (st.prefs.currency === c ? 'btn-primary' : 'btn-ghost')} onClick={() => { st.prefs.currency = c as never; store.commit(); toast('Currency → ' + c); }}>{c}</button>
          ))}
        </div>
      </div>

      <div className="card mb">
        <div className="sec-title"><h2>Language</h2><span className="sub">nav labels + key headers</span></div>
        <div className="row">
          {['EN', 'FR', 'ES', 'SW'].map((l) => (
            <button key={l} className={'btn ' + (st.prefs.lang === l ? 'btn-primary' : 'btn-ghost')} onClick={() => { st.prefs.lang = l as never; store.commit(); toast('Language → ' + l); }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card mb">
        <div className="sec-title"><h2>Mode & network</h2></div>
        <div className="flag-row">
          <div className="desc"><div className="t">Demo mode</div><div className="m">Seeds realistic data; OFF starts the store empty with production empty states</div></div>
          <button className="btn btn-ghost" onClick={toggleDemo}>{st.settings.demoMode ? 'ON — click to disable' : 'OFF — click to enable'}</button>
        </div>
        <div className="flag-row">
          <div className="desc"><div className="t">Network</div><div className="m">read from config (.env)</div></div>
          <span className="chip gold">{config.network}</span>
        </div>
        <div className="flag-row">
          <div className="desc"><div className="t">API base URL</div><div className="m">empty = local store engine; set = real fetch() service layer</div></div>
          <span className="chip mono">{config.apiBaseUrl || '(local)'}</span>
        </div>
      </div>

      <div className="card">
        <div className="sec-title"><h2>Storage</h2></div>
        <div className="flag-row">
          <div className="desc"><div className="t">Local store</div><div className="m">key <span className="mono">mallchain_os_v1_v14</span> in localStorage</div></div>
          <button className="btn btn-danger" onClick={() => { if (window.confirm('Reset all local data?')) { localStorage.removeItem('mallchain_os_v1_v14'); window.location.reload(); } }}>Reset all data</button>
        </div>
      </div>
    </div>
  );
}
