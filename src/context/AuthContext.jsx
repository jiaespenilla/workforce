import { createContext, useContext, useState } from 'react'
import { commitPendingSystemSettings } from '../lib/systemSettings'
import { loadRegisteredCompanies } from '../lib/companies'

const AuthContext = createContext(null)

const ADMIN_CREDENTIALS = {
  username: 'admin_celestine',
  password: 'Celest!ne2026!',
}

const CEO_EMAIL = 'ceo@unifiedworkforce.com'
const CEO_DEFAULT_PASSWORD = 'P@ssw0rd2026!'
const COMPANY_DEFAULT_PASSWORD = 'P@ssw0rd2026!'

export function getCeoEmail() {
  return CEO_EMAIL
}

function getCeoPassword() {
  return localStorage.getItem('uw_ceo_password') || CEO_DEFAULT_PASSWORD
}

function getRoleLabel(role) {
  return { administrator: 'Administrator', ceo: 'CEO', employee: 'Employee' }[role] || role
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
    if (password !== COMPANY_DEFAULT_PASSWORD && password !== getCeoPassword()) {
      return null
    }

    const { company, emp } = account
    const isOwner = (company.owner?.email || '').trim().toLowerCase() === identifier
    const role = isOwner ? 'ceo' : 'employee'
    const name = emp.name || company.owner?.name || 'Company User'
    const u = {
      email: identifier,
      name,
      role,
      roleLabel: isOwner ? 'CEO' : emp.role || 'Employee',
      companyName: company.name,
      initials: name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(),
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
      roleLabel: 'Administrator',
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
      roleLabel: 'CEO',
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
