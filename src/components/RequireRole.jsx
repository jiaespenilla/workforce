import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const HOME_BY_ROLE = {
  administrator: '/settings',
  ceo: '/companies',
  employee: '/',
}

export default function RequireRole({ role, roles, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  const allowed = roles || (role ? [role] : [])
  if (allowed.length && !allowed.includes(user.role)) {
    return <Navigate to={HOME_BY_ROLE[user.role] || '/'} replace />
  }
  return children
}
