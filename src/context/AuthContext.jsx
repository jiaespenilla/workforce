import { createContext, useContext, useState } from 'react'
import { commitPendingSystemSettings } from '../lib/systemSettings'
import { getConfiguredRoles } from '../lib/roles'
import { tryApiLogin, apiEnabled, api } from '../lib/api'

const AuthContext = createContext(null)

function readProfiles() {
  try {
    return JSON.parse(localStorage.getItem('uw_profiles')) || {}
  } catch {
    return {}
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('uw_user'))
    } catch {
      return null
    }
  })

  const persistUser = (u) => {
    setUser(u)
    localStorage.setItem('uw_user', JSON.stringify(u))
  }

  // Update the signed-in user's profile (name / phone / avatar).
  const updateProfile = (updates) => {
    if (!user) return
    const profiles = readProfiles()
    profiles[user.email] = { ...(profiles[user.email] || {}), ...updates }
    localStorage.setItem('uw_profiles', JSON.stringify(profiles))
    persistUser({
      ...user,
      ...(updates.name ? { name: updates.name, initials: updates.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() } : {}),
      ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
      ...(updates.avatar !== undefined ? { avatar: updates.avatar } : {}),
    })
  }

  // Change the signed-in user's password. Returns error string or null on success.
  const changeOwnPassword = async (currentPassword, newPassword) => {
    if (!user) return 'Not signed in.'
    if (apiEnabled()) {
      // Cloud mode: the server verifies the current password, stores a PBKDF2
      // hash, and clears the must-change-password flag.
      try {
        await api('/api/change-password', { method: 'POST', body: { currentPassword, newPassword } })
      } catch (err) {
        return err.message || 'Password change failed.'
      }
    } else if (!newPassword || newPassword.length < 8) {
      // Local demo mode — demo accounts accept any password, just validate length.
      return 'New password must be at least 8 characters.'
    }
    persistUser({ ...user, usingDefaultPassword: false })
    return null
  }

  // Server-side login (cloud mode). Returns a user, throws on bad credentials,
  // or returns null when no API is configured/unreachable (local fallback).
  const serverLogin = async (identifier, password) => {
    const result = await tryApiLogin(identifier, password)
    if (!result) return null
    localStorage.setItem('uw_token', result.token)
    const ru = result.user || {}
    const name = ru.name || identifier
    // Restore local profile (avatar/phone) — local-only for now
    const profile = readProfiles()[ (ru.email || identifier).toLowerCase() ] || {}
    const u = {
      email: ru.email || identifier,
      name: profile.name || name,
      role: ru.role,
      roleLabel: { administrator: 'Administrator', ceo: 'CEO', employee: 'Employee' }[ru.role] || ru.role,
      phone: profile.phone || '',
      avatar: profile.avatar || null,
      usingDefaultPassword: !!ru.usingDefaultPassword,
      initials: (profile.name || name).split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(),
    }
    setUser(u)
    localStorage.setItem('uw_user', JSON.stringify(u))
    return u
  }

  const logout = () => {
    commitPendingSystemSettings()
    setUser(null)
    localStorage.removeItem('uw_user')
    localStorage.removeItem('uw_token')
  }

  return (
    <AuthContext.Provider value={{ user, logout, updateProfile, changeOwnPassword, serverLogin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
