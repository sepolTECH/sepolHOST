import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  /**
   * Área da rota: 'owner' = sistema completo (cliente/admin); 'associate' = área simplificada do associado.
   * Cada papel só entra na sua área — o outro é redirecionado para a dele.
   */
  area?: 'owner' | 'associate'
}

export function ProtectedRoute({ area = 'owner' }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="screen-loader">
        <span className="spinner spinner--lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  const isAssociate = user.role === 'associate'
  if (isAssociate && area === 'owner') return <Navigate to="/associado" replace />
  if (!isAssociate && area === 'associate') return <Navigate to="/" replace />

  return <Outlet />
}
