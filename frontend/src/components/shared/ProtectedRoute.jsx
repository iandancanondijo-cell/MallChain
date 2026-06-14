import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../core/store/authStore'

/**
 * Route guard that redirects unauthenticated users to /login.
 * Preserves the intended destination in location state for post-login redirect.
 */
export default function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}
