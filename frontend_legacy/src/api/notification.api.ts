import { api } from '../services/api';

export interface Notification {
    _id: string;
    userId?: string;
    user?: string;
    title: string;
    message: string;
    read: boolean;
    type?: string;
    createdAt: string;
}

export async function getMyNotifications() {
    const response = await api.get<{ notifications: Notification[] }>('/notification/my');
    return response.data;
}

export async function markRead(id: string) {
    const response = await api.patch(`/notification/${id}/read`);
    return response.data;
}

export async function markAllRead() {
    const response = await api.put('/notification/mark-all-read');
    return response.data;
}

export async function deleteNotification(id: string) {
    const response = await api.delete(`/notification/${id}`);
    return response.data;
}
