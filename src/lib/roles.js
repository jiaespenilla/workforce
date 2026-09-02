// Roles are managed by the administrator in System Configuration → Roles & Permissions.
// In cloud mode, roles are stored in D1 via /api/roles; locally, localStorage.

import { api, apiEnabled } from './api'

const FALLBACK_TEAM_ROLES = ['CEO', 'HR Manager', 'Team Lead', 'Employee']

// Page-level permission keys (Main Menu broken down per page).
const PAGE_KEYS = ['dashboard', 'timekeeping', 'tasks', 'payroll', 'employees', 'shifts', 'storage']

// Fill in missing permission keys and migrate the old single "mainMenu" flag.
function normalizePerms(perms) {
  const p = { ...(perms || {}) }
  if ('mainMenu' in p && !PAGE_KEYS.some((k) => k in p)) {
    PAGE_KEYS.forEach((k) => { p[k] = !!p.mainMenu })
  }
  PAGE_KEYS.forEach((k) => {
    if (!(k in p)) p[k] = true
  })
  if (!('kiosk' in p)) p.kiosk = true
  return p
}

function loadLocalRoles() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_roles'))
    const list = Array.isArray(stored) ? stored.filter((r) => r && r.name) : []
    return list.map((r) => ({ ...r, perms: normalizePerms(r.perms) }))
  } catch {
    return []
  }
}

// In-memory cache populated at startup in cloud mode.
let _serverRoles = null

// Pre-fetch roles from the server once at startup so getConfiguredRoles()
// returns correct data immediately (no flash of seeded defaults).
export async function prefetchRoles() {
  if (!apiEnabled()) return
  try {
    const roles = await api('/api/roles')
    _serverRoles = roles.map((r) => ({ ...r, perms: normalizePerms(r.perms) }))
    localStorage.setItem('uw_roles', JSON.stringify(_serverRoles))
  } catch {
    // offline — keep localStorage or empty
  }
}

export async function fetchRoles() {
  if (apiEnabled()) {
    try {
      const roles = await api('/api/roles')
      _serverRoles = roles.map((r) => ({ ...r, perms: normalizePerms(r.perms) }))
      return _serverRoles
    } catch {
      return loadLocalRoles()
    }
  }
  return loadLocalRoles()
}

export function getConfiguredRoles() {
  if (_serverRoles) return _serverRoles
  return loadLocalRoles()
}

// Role options for company registration — excludes console-only roles.
export function getTeamRoleOptions() {
  const assignable = getConfiguredRoles().filter((r) => !r.perms.settings)
  const names = assignable.map((r) => r.name)
  return names.length ? names : FALLBACK_TEAM_ROLES
}

export async function saveRolesList(roles) {
  if (apiEnabled()) {
    try {
      // Delete roles that were removed locally (present on server but absent in the new list)
      const prevIds = new Set((_serverRoles || loadLocalRoles()).filter((r) => r.id).map((r) => r.id))
      const nextIds = new Set(roles.filter((r) => r.id).map((r) => r.id))
      for (const id of prevIds) {
        if (!nextIds.has(id)) {
          try { await api(`/api/roles/${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
        }
      }
      // Upsert remaining roles
      for (const role of roles) {
        if (!role.name?.trim()) continue
        if (role.id) {
          await api(`/api/roles/${role.id}`, { method: 'PUT', body: { name: role.name.trim(), perms: role.perms } })
        } else {
          const created = await api('/api/roles', { method: 'POST', body: { name: role.name.trim(), perms: role.perms } })
          role.id = created.id
        }
      }
    } catch {
      // Fall back to local storage on error
    }
  }
  _serverRoles = roles.map((r) => ({ ...r, name: r.name?.trim() ?? r.name }))
  localStorage.setItem('uw_roles', JSON.stringify(_serverRoles))
}

// Action-level permissions (Add / Edit / Delete per module). Absent = allowed.
export function canAction(perms, module, action) {
  return perms?.actions?.[module]?.[action] !== false
}
