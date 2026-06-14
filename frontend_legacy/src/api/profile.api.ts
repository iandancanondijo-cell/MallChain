import { api } from '../services/api';
import type { User } from '../types';

export async function getProfile() {
    const response = await api.get('/profile');
    return response.data;
}

export async function updateProfile(data: Partial<User> | FormData) {
    const isFormData = data instanceof FormData;
    const response = await api.put('/profile', data, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined
    });
    return response.data;
}

export async function deleteAccount() {
    const response = await api.delete('/profile');
    return response.data;
}
