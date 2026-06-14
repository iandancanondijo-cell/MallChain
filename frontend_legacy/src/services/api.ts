import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '../types';

// Create a configured axios instance
export const api = axios.create({
    baseURL: (import.meta && import.meta.env && import.meta.env.VITE_API_URL) || '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('authToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error: AxiosError) => Promise.reject(error)
);

// Response interceptor to handle global errors and transform responses
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<any>) => {
        const originalRequest = error.config;

        // If error is 401 and we haven't retried yet, and it's not an auth route
        const isAuthRoute = originalRequest?.url?.includes('/auth/login') ||
            originalRequest?.url?.includes('/auth/signup') ||
            originalRequest?.url?.includes('/auth/refresh-token');

        if (error.response?.status === 401 && originalRequest && !(originalRequest as any)._retry && !isAuthRoute) {
            (originalRequest as any)._retry = true;

            try {
                const refreshToken = localStorage.getItem('refreshToken');
                if (!refreshToken) throw new Error('No refresh token available');

                // Try to get new access token
                const res = await axios.post(`${api.defaults.baseURL}/auth/refresh-token`, { refreshToken });
                const { token, refreshToken: newRefreshToken } = res.data;

                // Store new tokens
                localStorage.setItem('authToken', token);
                if (newRefreshToken) {
                    localStorage.setItem('refreshToken', newRefreshToken);
                }

                // Update auth header and retry original request
                if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                }
                return api(originalRequest);
            } catch (refreshError) {
                // Log the error so it's visible to the user
                console.error('Token refresh failed:', refreshError);

                // Clear tokens and redirect to login if refresh fails
                localStorage.removeItem('authToken');
                localStorage.removeItem('refreshToken');
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
                return Promise.reject(refreshError);
            }
        }

        // Transform error to consistent structure
        const errorMessage = typeof error.response?.data?.error === 'string'
            ? error.response.data.error
            : error.response?.data?.message || error.message || 'An error occurred';

        const errorCode = typeof error.response?.data?.error === 'object'
            ? error.response.data.error.code
            : error.code;

        const apiError: ApiError = {
            message: errorMessage,
            code: errorCode,
            details: error.response?.data,
        };

        return Promise.reject(apiError);
    }
);
