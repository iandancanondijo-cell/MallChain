// Authentication API functions
import { api } from '../services/api';
import type {
    SignupRequest,
    SignupResponse,
    LoginRequest,
    LoginResponse,
    ProfileResponse,
    UpdateLocationRequest,
    CheckUsernameResponse,
} from '../types';

/**
 * Check if a username is available
 */
export async function checkUsername(username: string): Promise<CheckUsernameResponse> {
    const response = await api.get<CheckUsernameResponse>('/auth/check-username', {
        params: { username },
    });
    return response.data;
}

/**
 * Sign up a new user
 */
export async function signup(data: SignupRequest): Promise<SignupResponse> {
    const response = await api.post<SignupResponse>('/auth/register', data);
    return response.data;
}

/**
 * Login with email and password
 */
export async function login(data: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/login', data);
    return response.data;
}

/**
 * Logout current user
 */
export async function logout(refreshToken: string): Promise<{ message: string }> {
    const response = await api.post('/auth/logout', { refreshToken });
    return response.data;
}

/**
 * Get current user profile
 */
export async function getProfile(): Promise<ProfileResponse> {
    const response = await api.get<ProfileResponse>('/auth/profile');
    return response.data;
}

/**
 * Update user location
 */
export async function updateLocation(data: UpdateLocationRequest): Promise<void> {
    await api.put('/auth/location', data);
}

/**
 * Request a password reset link
 */
export async function forgotPassword(email: string): Promise<{ success: boolean; message: string; debugUrl?: string }> {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
}

/**
 * Reset password with token
 */
export async function resetPassword(token: string, password: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/auth/reset-password/${token}`, { password });
    return response.data;
}
/**
 * Change password for logged in user
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post('/auth/change-password', { currentPassword, newPassword });
    return response.data;
}
