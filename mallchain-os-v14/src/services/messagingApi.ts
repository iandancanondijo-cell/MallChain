/** Real messaging API — wraps backend/src/routes/messaging.js. Live delivery via socket.ts's onMessage/subscribeConversation. */
import { api } from './api';
import { type ApiResult } from './api';

export interface ConversationSummary {
  id: string;
  name: string;
  unread: number;
  lastMessage: { text: string; ts: string; mine: boolean } | null;
}

export interface ChatMessage {
  id: string;
  from: 'me' | 'them';
  text: string;
  ts: string;
}

class MessagingApi {
  async listConversations(): Promise<ApiResult<ConversationSummary[]>> {
    return api.get('/api/messaging/conversations');
  }

  async getMessages(conversationId: string): Promise<ApiResult<{ id: string; messages: ChatMessage[] }>> {
    return api.get(`/api/messaging/conversations/${encodeURIComponent(conversationId)}`);
  }

  async startConversation(recipientEmail: string): Promise<ApiResult<{ conversation: { id: string; name: string; unread: number } }>> {
    return api.post('/api/messaging/conversations', { recipientEmail });
  }

  async sendMessage(conversationId: string, text: string): Promise<ApiResult<{ message: ChatMessage }>> {
    return api.post(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages`, { text });
  }

  async markRead(conversationId: string): Promise<ApiResult<{ success: boolean }>> {
    return api.put(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/read`, {});
  }
}

export const messagingApi = new MessagingApi();
