import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../core/store/authStore'

/**
 * Route guard that restricts access to admin/superadmin users only.
 * Redirects unauthorized users to /dashboard.
 */
export default function AdminRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
