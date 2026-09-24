import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { messagingApi, type ConversationSummary, type ChatMessage } from '../../services/messagingApi';
import { socketManager } from '../../services/socket';
import { MessageCircle, Send, Plus, Users } from 'lucide-react';

/** Messaging — chat/social glassmorphism layout with real conversations + live Socket.IO updates. */
export default function Messaging() {
  useStoreVersion();
  const st = store.state;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [newRecipient, setNewRecipient] = useState('');
  const [showNew, setShowNew] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await messagingApi.listConversations();
    if (res.ok && res.data) setConversations(res.data);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!selId) return;
    messagingApi.getMessages(selId).then((res) => {
      if (res.ok && res.data) setMessages(res.data.messages);
    });
    messagingApi.markRead(selId).then(() => loadConversations());

    if (socketManager.isConnected()) socketManager.subscribeConversation(selId);
    const unsubscribe = socketManager.onMessage((m) => {
      if (m.conversationId !== selId) return;
      setMessages((prev) => [...prev, { id: m.id, from: m.senderId === st.user.id ? 'me' : 'them', text: m.text, ts: m.ts }]);
      loadConversations();
    });
    return () => {
      socketManager.unsubscribeConversation(selId);
      unsubscribe();
    };
  }, [selId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const conv = conversations.find((c) => c.id === selId) || null;
  const totalUnread = conversations.reduce((a, c) => a + c.unread, 0);

  const send = async () => {
    if (!selId || !text.trim()) return;
    const body = text.trim();
    setText('');
    const res = await messagingApi.sendMessage(selId, body);
    if (res.ok && res.data) {
      setMessages((prev) => [...prev, res.data!.message]);
      loadConversations();
    } else {
      toast(res.error || 'Failed to send message', false);
    }
  };

  const startConversation = async () => {
    if (!newRecipient.trim()) return;
    const res = await messagingApi.startConversation(newRecipient.trim());
    if (res.ok && res.data) {
      toast(`Conversation with ${res.data.conversation.name} started`);
      setShowNew(false);
      setNewRecipient('');
      await loadConversations();
      setSelId(res.data.conversation.id);
    } else {
      toast(res.error || 'Failed to start conversation', false);
    }
  };

  return (
    <div>
      <div className="view-head">
        <h1>Messaging</h1>
        <span className="sub">{totalUnread} unread</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowNew((v) => !v)}>
          <Plus size={14} /> New conversation
        </button>
      </div>

      {showNew && (
        <div className="card mb" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input className="input" placeholder="Recipient email…" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={startConversation}><Send size={14} /> Start</button>
        </div>
      )}

      <div className="card msg-layout" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="conv-list" style={{ borderRight: '1px solid var(--border)' }}>
          {conversations.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--txt-3)' }}>
              <Users size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div style={{ fontSize: 13 }}>No conversations yet.</div>
            </div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              className={'conv-item' + (c.id === selId ? ' sel' : '')}
              aria-current={c.id === selId ? 'true' : undefined}
              onClick={() => setSelId(c.id)}
            >
              <div className="avatar" style={{ width: 32, height: 32, fontSize: 13, background: 'rgba(var(--section-accent-rgb),0.12)', color: 'rgb(var(--section-accent-rgb))' }}>
                {c.name[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nm" style={{ fontWeight: 600 }}>
                  {c.name}
                  {c.unread > 0 && (
                    <span style={{
                      marginLeft: 6, padding: '1px 6px', borderRadius: 999,
                      fontSize: 10, fontWeight: 700,
                      background: 'rgb(var(--section-accent-rgb))',
                      color: '#16181d',
                    }}>{c.unread}</span>
                  )}
                </div>
                <div className="prv" style={{ fontSize: 11.5 }}>{c.lastMessage?.text || ''}</div>
              </div>
              {c.lastMessage && (
                <span className="tiny" style={{ color: 'var(--txt-3)', fontSize: 10.5 }}>
                  {new Date(c.lastMessage.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="msg-thread" style={{ padding: '0 8px' }}>
          {conv ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px', borderBottom: '1px solid var(--border)' }}>
                <div className="avatar" style={{ width: 32, height: 32, fontSize: 13, background: 'rgba(var(--section-accent-rgb),0.12)', color: 'rgb(var(--section-accent-rgb))' }}>
                  {conv.name[0]?.toUpperCase()}
                </div>
                <div className="grow"><b style={{ fontSize: 14 }}>{conv.name}</b></div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380, padding: '8px 0' }}>
                {messages.map((m) => (
                  <div key={m.id}>
                    <div className={'msg-bubble ' + m.from}>
                      {m.text}
                      <div className="msg-time">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="msg-input-row" style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
                <input className="input" placeholder="Type a message… (Enter to send)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
                <button className="btn btn-primary" onClick={send}><Send size={14} /> Send</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-3)', padding: 40 }}>
              <MessageCircle size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
              <div style={{ fontSize: 14 }}>Select a conversation</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
