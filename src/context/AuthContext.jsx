import { createContext, useContext, useState } from 'react'
import { commitPendingSystemSettings } from '../lib/systemSettings'

const AuthContext = createContext(null)

const ADMIN_CREDENTIALS = {
  username: 'admin_celestine',
  password: 'Celest!ne2026!',
}

const CEO_EMAIL = 'ceo@unifiedworkforce.com'
const CEO_DEFAULT_PASSWORD = 'P@ssw0rd2026!'

export function getCeoEmail() {
  return CEO_EMAIL
}

function getCeoPassword() {
  return localStorage.getItem('uw_ceo_password') || CEO_DEFAULT_PASSWORD
}

export function changeCeoPassword(newPassword) {
  localStorage.setItem('uw_ceo_password', newPassword)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('uw_user'))
    } catch {
      return null
    }
  })

  const login = (email) => {
    const identifier = email.trim().toLowerCase()
    if (identifier === ADMIN_CREDENTIALS.username) {
      throw new Error('ADMIN_PASSWORD_REQUIRED')
    }
    if (identifier === CEO_EMAIL) {
      throw new Error('CEO_PASSWORD_REQUIRED')
    }
    const u = {
      email,
      name: 'Alex Morgan',
      role: 'employee',
      initials: 'AM',
    }
    setUser(u)
    localStorage.setItem('uw_user', JSON.stringify(u))
    return u
  }

  const loginAdmin = (username, password) => {
    if (
      username.trim().toLowerCase() !== ADMIN_CREDENTIALS.username ||
      password !== ADMIN_CREDENTIALS.password
    ) {
      return null
    }
    const u = {
      email: ADMIN_CREDENTIALS.username,
      name: 'Aizl Jo Bornillo',
      role: 'administrator',
      initials: 'AJ',
    }
    setUser(u)
    localStorage.setItem('uw_user', JSON.stringify(u))
    return u
  }

  const loginCeo = (email, password) => {
    if (email.trim().toLowerCase() !== CEO_EMAIL || password !== getCeoPassword()) {
      return null
    }
    const u = {
      email: CEO_EMAIL,
      name: 'Celestine Espenilla',
      role: 'ceo',
      initials: 'CE',
    }
    setUser(u)
    localStorage.setItem('uw_user', JSON.stringify(u))
    return u
  }

  const logout = () => {
    commitPendingSystemSettings()
    setUser(null)
    localStorage.removeItem('uw_user')
  }

  return <AuthContext.Provider value={{ user, login, loginAdmin, loginCeo, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
