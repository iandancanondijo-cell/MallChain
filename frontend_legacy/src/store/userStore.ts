import { create } from 'zustand';
import { User } from '../types';
import { getProfile, logout as logoutApi } from '../api/auth.api';
import { connectSocket, disconnectSocket, socket } from '../services/socket';
import { toast } from 'sonner';

interface UserState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (userData: User, token: string, refreshToken: string) => void;
    logout: () => void;
    updateBalance: (coins: number, points: number) => void;
    refreshBalance: () => Promise<void>;
    setUser: (user: User) => void;
    checkAuth: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
    user: null,
    isAuthenticated: !!localStorage.getItem('authToken'), // Initial check
    isLoading: false,

    login: (userData, token, refreshToken) => {
        localStorage.setItem('authToken', token);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user: userData, isAuthenticated: true });
        connectSocket(token);

        // Listen for real-time wallet updates
        socket.off("wallet:update"); // Clear existing
        socket.on("wallet:update", (data) => {
            console.log("[Socket] Balance update received:", data);
            set((state) => ({
                user: state.user ? {
                    ...state.user,
                    mallCoins: data.mallcoins,
                    mallPoints: data.mallpoints,
                    mallmoney: data.mallmoney
                } : null
            }));
        });

        socket.off("wallet:received");
        socket.on("wallet:received", (data) => {
            toast.success(`Received KES ${data.amount.toLocaleString()}!`);
            // Trigger a refresh to ensure consistency
            useUserStore.getState().refreshBalance();
        });
    },

    logout: async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        try {
            await logoutApi(refreshToken || '');
        } catch (error) {
            console.warn('Logout API call failed:', error);
        }
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, isAuthenticated: false });
        disconnectSocket();
        window.location.href = '/login';
    },

    updateBalance: (coins, points) =>
        set((state) => ({
            user: state.user ? { ...state.user, mallCoins: coins, mallPoints: points } : null,
        })),

    refreshBalance: async () => {
        try {
            const { getWallet } = await import('../api/wallet.api');
            const wallet = await getWallet();
            set((state) => ({
                user: state.user ? {
                    ...state.user,
                    mallCoins: wallet.mallcoins,
                    mallPoints: wallet.mallpoints,
                    mallmoney: wallet.mallmoney // Also sync mallmoney if needed, though user model doesn't have it yet, we add it to the state user object
                } : null,
            }));
        } catch (error) {
            console.error('Failed to refresh balance:', error);
        }
    },

    setUser: (user) => set({ user }),

    checkAuth: async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            set({ user: null, isAuthenticated: false, isLoading: false });
            return;
        }

        // If user is already loaded, skip the API call
        const currentState = useUserStore.getState();
        if (currentState.user && currentState.isAuthenticated) {
            set({ isLoading: false });
            return;
        }

        set({ isLoading: true });
        try {
            const { user } = await getProfile();
            set({ user, isAuthenticated: true, isLoading: false });
            connectSocket(token);

            // Re-attach listeners on checkAuth
            socket.off("wallet:update");
            socket.on("wallet:update", (data) => {
                set((state) => ({
                    user: state.user ? {
                        ...state.user,
                        mallCoins: data.mallcoins,
                        mallPoints: data.mallpoints,
                        mallmoney: data.mallmoney
                    } : null
                }));
            });
        } catch (error) {
            console.error('Session validation failed:', error);
            localStorage.removeItem('authToken');
            localStorage.removeItem('refreshToken');
            set({ user: null, isAuthenticated: false, isLoading: false });
        }
    }
}));
