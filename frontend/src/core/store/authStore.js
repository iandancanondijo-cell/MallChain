import { create } from 'zustand'

/**
 * Centralized auth store using Zustand.
 * Manages user session, token, and wallet reference.
 */
export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('token') || null,
  user: (() => {
    try {
      const raw = localStorage.getItem('user')
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      console.warn('[authStore] Invalid user JSON in localStorage; clearing.', e)
      localStorage.removeItem('user')
      return null
    }
  })(),
  isAuthenticated: !!localStorage.getItem('token'),

  login: ({ token, user }) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null, isAuthenticated: false })
  },

  updateUser: (userData) => {
    const merged = { ...get().user, ...userData }
    localStorage.setItem('user', JSON.stringify(merged))
    set({ user: merged })
  },

  getToken: () => get().token,
}))
