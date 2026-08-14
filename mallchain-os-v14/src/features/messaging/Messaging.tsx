import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { messagingApi, type ConversationSummary, type ChatMessage } from '../../services/messagingApi';
import { socketManager } from '../../services/socket';

/** Messaging — real conversations + messages (backend/src/routes/messaging.js), live via Socket.IO. */
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

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const conv = conversations.find((c) => c.id === selId) || null;

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
        <span className="sub">{conversations.reduce((a, c) => a + c.unread, 0)} unread</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowNew((v) => !v)}>+ New conversation</button>
      </div>

      {showNew && (
        <div className="card mb">
          <div className="row">
            <input className="input" placeholder="Recipient email…" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={startConversation}>Start</button>
          </div>
        </div>
      )}

      <div className="card msg-layout">
        <div className="conv-list">
          {conversations.length === 0 && <div className="empty" style={{ color: 'var(--txt-3)', padding: 20, textAlign: 'center' }}>No conversations yet.</div>}
          {conversations.map((c) => (
            <div key={c.id} className={'conv-item' + (c.id === selId ? ' sel' : '')} onClick={() => setSelId(c.id)}>
              <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{c.name[0]?.toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nm">{c.name} {c.unread > 0 && <span className="mc-badge b-pending">{c.unread}</span>}</div>
                <div className="prv">{c.lastMessage?.text || ''}</div>
              </div>
              {c.lastMessage && <span className="tiny">{new Date(c.lastMessage.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          ))}
        </div>
        <div className="msg-thread" style={{ padding: '0 6px' }}>
          {conv ? (
            <>
              <div className="row" style={{ paddingBottom: 10, borderBottom: '1px solid var(--line-1)', marginBottom: 12 }}>
                <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{conv.name[0]?.toUpperCase()}</div>
                <div className="grow"><b>{conv.name}</b></div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }}>
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
