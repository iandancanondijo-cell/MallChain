import { useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { sim } from '../../services/config';

/** Messaging — conversations, typing indicator, unread decrement on open,
 *  send on Enter, timestamps, delete conversation. */
export default function Messaging() {
  useStoreVersion();
  const st = store.state;
  const [selId, setSelId] = useState<string | null>(st.messaging.conversations[0]?.id || null);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const conv = st.messaging.conversations.find((c) => c.id === selId) || null;

  useEffect(() => {
    // mark unread → 0 when opening a conversation
    if (conv && conv.unread > 0) {
      conv.unread = 0;
      store.commit();
    }
  }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!conv) return;
    // simulated typing indicator (demo only)
    const stop = sim.later(() => {
      conv.typing = true;
      store.commit();
      sim.later(() => {
        conv.typing = false;
        conv.messages.push({ from: 'them', text: 'Got it — I\'ll look into that for you 👍', ts: Date.now() });
        store.commit();
      }, 1800);
    }, 3500);
    return stop;
  }, [conv, selId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv?.messages.length, conv?.typing]);

  const send = () => {
    if (!conv || !text.trim()) return;
    conv.messages.push({ from: 'me', text: text.trim(), ts: Date.now() });
    setText('');
    store.commit();
  };

  const del = (id: string) => {
    if (!window.confirm('Delete this conversation?')) return;
    st.messaging.conversations = st.messaging.conversations.filter((c) => c.id !== id);
    if (selId === id) setSelId(st.messaging.conversations[0]?.id || null);
    store.commit();
    toast('Conversation deleted');
  };

  return (
    <div>
      <div className="view-head"><h1>Messaging</h1><span className="sub">{st.messaging.conversations.reduce((a, c) => a + c.unread, 0)} unread</span></div>
      <div className="card msg-layout">
        <div className="conv-list">
          {st.messaging.conversations.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20, textAlign: 'center' }}>No conversations yet.</div>}
          {st.messaging.conversations.map((c) => (
            <div key={c.id} className={'conv-item' + (c.id === selId ? ' sel' : '')} onClick={() => setSelId(c.id)}>
              <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{c.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nm">{c.name} {c.unread > 0 && <span className="mc-badge b-pending">{c.unread}</span>}</div>
                <div className="prv">{c.messages[c.messages.length - 1]?.text || ''}</div>
              </div>
              <span className="tiny">{new Date(c.messages[c.messages.length - 1]?.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
        <div className="msg-thread" style={{ padding: '0 6px' }}>
          {conv ? (
            <>
              <div className="row" style={{ paddingBottom: 10, borderBottom: '1px solid var(--line-1)', marginBottom: 12 }}>
                <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{conv.name[0]}</div>
                <div className="grow"><b>{conv.name}</b></div>
                <button className="btn btn-danger btn-sm" onClick={() => del(conv.id)}>🗑 Delete</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }}>
                {conv.messages.map((m, i) => (
                  <div key={i}>
                    <div className={'msg-bubble ' + m.from}>
                      {m.text}
                      <div className="msg-time">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))}
                {conv.typing && <div className="typing-dot"><i /><i /><i /></div>}
                <div ref={endRef} />
              </div>
              <div className="msg-input-row">
                <input className="input" placeholder="Type a message… (Enter to send)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
                <button className="btn btn-primary" onClick={send}>Send</button>
              </div>
            </>
          ) : (
            <div className="empty" style={{ color: 'var(--txt-3)', padding: 40, textAlign: 'center' }}>Select a conversation.</div>
          )}
        </div>
      </div>
    </div>
  );
}
