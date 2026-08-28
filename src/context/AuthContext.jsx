import { createContext, useContext, useEffect, useState } from 'react'
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

function resolvePermsForRoleName(roleName) {
  if (!roleName) return null
  const roles = getConfiguredRoles()
  const found = roles.find((r) => r.name.trim().toLowerCase() === roleName.trim().toLowerCase())
  return found ? found.perms : null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('uw_user'))
      if (stored && !stored.perms) {
        const p = resolvePermsForRoleName(stored.roleLabel || stored.role)
        if (p) stored.perms = p
      }
      return stored
    } catch {
      return null
    }
  })

  const persistUser = (u) => {
    setUser(u)
    localStorage.setItem('uw_user', JSON.stringify(u))
  }

  // Hydrate perms + actual role label for non-admins from their employee record
  useEffect(() => {
    if (!user || user.role === 'administrator') return
    // if already has perms and roleLabel looks correct (not generic Employee for custom roles), skip
    if (user.perms && user.roleLabel && !['Employee','CEO'].includes(user.roleLabel)) return
    let cancelled = false
    const hydrate = async () => {
      try {
        if (apiEnabled()) {
          const companies = await api('/api/companies').catch(() => [])
          const emp = companies.flatMap((c) => c.employees).find((e) => e.email.toLowerCase() === user.email.toLowerCase())
          const actualRole = emp?.role || user.roleLabel || user.role
          const perms = resolvePermsForRoleName(actualRole)
          if (!cancelled && (perms || actualRole !== user.roleLabel)) {
            const enriched = { ...user, roleLabel: actualRole || user.roleLabel, ...(perms ? { perms } : {}) }
            setUser(enriched)
            localStorage.setItem('uw_user', JSON.stringify(enriched))
          }
        } else {
          const perms = resolvePermsForRoleName(user.roleLabel || user.role)
          if (perms && !cancelled) {
            const enriched = { ...user, perms }
            setUser(enriched)
            localStorage.setItem('uw_user', JSON.stringify(enriched))
          }
        }
      } catch {}
    }
    const t = setTimeout(hydrate, 600)
    return () => { cancelled = true; clearTimeout(t) }
  }, [user])

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
    let perms = null
    let actualRoleLabel = { administrator: 'Administrator', ceo: 'CEO', employee: 'Employee' }[ru.role] || ru.role
    // Try to resolve perms + actual role name from employee record (e.g., HR Manager)
    try {
      if (ru.role !== 'administrator' && apiEnabled()) {
        const companies = await api('/api/companies').catch(() => [])
        const emp = companies.flatMap((c) => c.employees).find((e) => (e.email || '').toLowerCase() === (ru.email || identifier).toLowerCase())
        const roleName = emp?.role || ru.role
        if (emp?.role) actualRoleLabel = emp.role
        perms = resolvePermsForRoleName(roleName) || resolvePermsForRoleName(ru.role) || resolvePermsForRoleName({ ceo: 'CEO', employee: 'Employee' }[ru.role])
      } else {
        perms = resolvePermsForRoleName(ru.role) || resolvePermsForRoleName({ ceo: 'CEO', employee: 'Employee' }[ru.role])
      }
    } catch {}
    const u = {
      email: ru.email || identifier,
      name: profile.name || name,
      role: ru.role,
      roleLabel: actualRoleLabel,
      phone: profile.phone || '',
      avatar: profile.avatar || null,
      usingDefaultPassword: !!ru.usingDefaultPassword,
      initials: (profile.name || name).split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(),
      ...(perms ? { perms } : {}),
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
