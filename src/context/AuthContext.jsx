import { createContext, useContext, useState } from 'react'
import { commitPendingSystemSettings } from '../lib/systemSettings'
import { loadRegisteredCompanies } from '../lib/companies'
import { getConfiguredRoles } from '../lib/roles'
import { getStoredPassword, setStoredPassword } from '../lib/passwords'
import { tryApiLogin } from '../lib/api'

const AuthContext = createContext(null)

const ADMIN_CREDENTIALS = {
  username: 'admin_celestine',
  password: 'Celest!ne2026!',
}

const CEO_EMAIL = 'ceo@celestsolutions.com'
const CEO_DEFAULT_PASSWORD = 'P@ssw0rd2026!'
const COMPANY_DEFAULT_PASSWORD = 'P@ssw0rd2026!'

export function getCeoEmail() {
  return CEO_EMAIL
}

function getCeoPassword() {
  return localStorage.getItem('uw_ceo_password') || CEO_DEFAULT_PASSWORD
}

// Resolve an email against registered companies (owner or any listed employee).
function findCompanyAccount(email) {
  const normalized = email.trim().toLowerCase()
  for (const company of loadRegisteredCompanies()) {
    for (const emp of company.employees) {
      if ((emp.email || '').trim().toLowerCase() === normalized) {
        return { company, emp }
      }
    }
  }
  return null
}

function isCompanyActiveForLogin(company) {
  return company && company.active !== false
}

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

  const login = (email, password) => {
    const identifier = email.trim().toLowerCase()
    if (identifier === ADMIN_CREDENTIALS.username) {
      throw new Error('ADMIN_PASSWORD_REQUIRED')
    }
    if (identifier === CEO_EMAIL) {
      throw new Error('CEO_PASSWORD_REQUIRED')
    }

    const account = findCompanyAccount(identifier)
    if (!account) {
      throw new Error('ACCOUNT_NOT_FOUND')
    }

    const expected = getStoredPassword(identifier) || COMPANY_DEFAULT_PASSWORD
    if (password !== expected) {
      return null
    }

    const { company, emp } = account
    if (!isCompanyActiveForLogin(company)) {
      throw new Error('COMPANY_INACTIVE')
    }
    if (emp.active === false) {
      throw new Error('EMPLOYEE_INACTIVE')
    }
    const identifierOwner =
      (company.owner?.email || '').trim().toLowerCase() === identifier ||
      company.employees[0]?.email?.trim().toLowerCase() === identifier
    // CEO access: registered as the account owner, has the CEO role, or is the first listed member.
    const isOwner = identifierOwner || (emp.role || '').trim().toLowerCase() === 'ceo'
    const role = isOwner ? 'ceo' : 'employee'

    // Saved profile details override registration defaults.
    const profile = readProfiles()[identifier] || {}
    const name = profile.name || emp.name || company.owner?.name || 'Company User'

    // Attach the permissions of the matching role configured in System Configuration.
    let perms = null
    if (isOwner) {
      perms =
        getConfiguredRoles().find((r) => r.name.toLowerCase() === 'ceo')?.perms ||
        { dashboard: true, timekeeping: true, tasks: true, payroll: true, kiosk: false, settings: false }
    } else {
      const roleName = (emp.role || '').trim().toLowerCase()
      perms = getConfiguredRoles().find((r) => r.name.toLowerCase() === roleName)?.perms || null
    }

    const u = {
      email: identifier,
      name,
      role,
      roleLabel: isOwner ? 'CEO' : emp.role || 'Employee',
      companyName: company.name,
      perms,
      phone: profile.phone || '',
      avatar: profile.avatar || null,
      usingDefaultPassword: !getStoredPassword(identifier),
      initials: name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(),
    }
    persistUser(u)
    return u
  }

  const loginAdmin = (username, password) => {
    if (
      username.trim().toLowerCase() !== ADMIN_CREDENTIALS.username ||
      password !== ADMIN_CREDENTIALS.password
    ) {
      return null
    }
    const profile = readProfiles()[ADMIN_CREDENTIALS.username] || {}
    const name = profile.name || 'Aizl Jo Bornillo'
    const u = {
      email: ADMIN_CREDENTIALS.username,
      name,
      role: 'administrator',
      roleLabel: 'Administrator',
      phone: profile.phone || '',
      avatar: profile.avatar || null,
      usingDefaultPassword: false,
      initials: name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(),
    }
    persistUser(u)
    return u
  }

  const loginCeo = (email, password) => {
    if (email.trim().toLowerCase() !== CEO_EMAIL || password !== getCeoPassword()) {
      return null
    }
    const profile = readProfiles()[CEO_EMAIL] || {}
    const name = profile.name || 'Celestine Espenilla'
    const u = {
      email: CEO_EMAIL,
      name,
      role: 'ceo',
      roleLabel: 'CEO',
      phone: profile.phone || '',
      avatar: profile.avatar || null,
      usingDefaultPassword: !localStorage.getItem('uw_ceo_password'),
      initials: name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(),
    }
    persistUser(u)
    return u
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
  const changeOwnPassword = (currentPassword, newPassword) => {
    if (!user) return 'Not signed in.'
    const expected =
      user.email === CEO_EMAIL
        ? getCeoPassword()
        : user.email === ADMIN_CREDENTIALS.username
          ? ADMIN_CREDENTIALS.password
          : getStoredPassword(user.email) || COMPANY_DEFAULT_PASSWORD
    if (currentPassword !== expected) {
      return 'Current password is incorrect.'
    }
    if (!newPassword || newPassword.length < 8) {
      return 'New password must be at least 8 characters.'
    }
    if (newPassword === COMPANY_DEFAULT_PASSWORD) {
      return 'New password cannot be the default password.'
    }
    if (user.email === CEO_EMAIL) {
      localStorage.setItem('uw_ceo_password', newPassword)
    } else if (user.email === ADMIN_CREDENTIALS.username) {
      return 'The administrator password cannot be changed here.'
    } else {
      setStoredPassword(user.email, newPassword)
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
    <AuthContext.Provider value={{ user, login, loginAdmin, loginCeo, logout, updateProfile, changeOwnPassword, serverLogin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
