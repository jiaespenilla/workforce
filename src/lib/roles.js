// Roles are managed by the administrator in System Configuration → Roles & Permissions.
// In cloud mode, roles are stored in D1 via /api/roles; locally, localStorage.

import { api, apiEnabled } from './api'

const FALLBACK_TEAM_ROLES = ['CEO', 'HR Manager', 'Team Lead', 'Employee']

// Page-level permission keys (Main Menu broken down per page).
const PAGE_KEYS = ['dashboard', 'timekeeping', 'tasks', 'payroll', 'employees', 'shifts']

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

export async function fetchRoles() {
  if (apiEnabled()) {
    try {
      const roles = await api('/api/roles')
      return roles.map((r) => ({ ...r, perms: normalizePerms(r.perms) }))
    } catch {
      return loadLocalRoles()
    }
  }
  return loadLocalRoles()
}

export function getConfiguredRoles() {
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
      // Sync each role to the server
      for (const role of roles) {
        if (role.id) {
          await api(`/api/roles/${role.id}`, { method: 'PUT', body: { name: role.name, perms: role.perms } })
        } else {
          const created = await api('/api/roles', { method: 'POST', body: { name: role.name, perms: role.perms } })
          role.id = created.id
        }
      }
    } catch {
      // Fall back to local storage on error
    }
  }
  localStorage.setItem('uw_roles', JSON.stringify(roles))
}

// Action-level permissions (Add / Edit / Delete per module). Absent = allowed.
export function canAction(perms, module, action) {
  return perms?.actions?.[module]?.[action] !== false
}
