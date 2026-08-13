import { store } from '../../store/store';
import { useStoreVersion } from '../../components/ui';

/** Mines history — timeline from the store. */
export default function MinesHistory() {
  useStoreVersion();
  const st = store.state;
  return (
    <div>
      <div className="view-head"><h1>History</h1><span className="sub">Your campaign timeline</span></div>
      {st.mines.hist.length === 0 && (
        <div className="empty-state"><div className="es-ico">🕘</div><div className="es-t">No campaign history yet</div><div className="es-m">Completed campaigns and rewards will appear here.</div></div>
      )}
      {st.mines.hist.map((d) => (
        <div key={d.d} className="card mb">
          <div className="sec-title"><h2>{d.d}</h2></div>
          {d.ev.map((e, i) => (
            <div key={i} className="list-row">
              <span style={{ fontSize: 18 }}>{e.ico}</span>
              <div className="grow"><div className="t">{e.t}</div><div className="m">{e.s}</div></div>
              <b className={e.pos ? 'green' : 'red'}>{e.pos ? '+' : ''}{e.a} MLPTS</b>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
