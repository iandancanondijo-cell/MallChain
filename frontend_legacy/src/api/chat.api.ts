import { api } from '../services/api';

export interface ChatMessage {
    _id: string;
    sender: string;
    recipient: string;
    content: string;
    type: 'text' | 'image' | 'file';
    createdAt: string;
    read: boolean;
}

export interface Conversation {
    _id: string; // conversationId
    lastMessage: ChatMessage;
    otherUser: {
        _id: string;
        username: string;
        fullName: string;
        avatar?: string;
    };
    unreadCount: number;
}

export async function getConversations(): Promise<Conversation[]> {
    const response = await api.get<Conversation[]>('/chat/conversations');
    return response.data;
}

export async function getMessages(userId: string): Promise<ChatMessage[]> {
    const response = await api.get<ChatMessage[]>(`/chat/${userId}`);
    return response.data;
}

export async function sendMessage(userId: string, content: string, file?: File): Promise<ChatMessage> {
    if (file) {
        const formData = new FormData();
        formData.append('avatar', file); // uploadMiddleware expects 'avatar' or generic images, check chat.js. Wait, chat.js uses uploadHandler.
        formData.append('data', JSON.stringify({ content }));
        const response = await api.post<ChatMessage>(`/chat/${userId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    }
    const response = await api.post<ChatMessage>(`/chat/${userId}`, { content });
    return response.data;
}

export async function sendTypingIndicator(recipientId: string, isTyping: boolean): Promise<void> {
    await api.post('/chat/typing', { recipientId, isTyping });
}

export async function searchUsers(query: string): Promise<any[]> {
    const response = await api.get<{ users: any[] }>(`/chat/search?q=${encodeURIComponent(query)}`);
    return response.data.users;
}
