// Roles are managed by the administrator in System Configuration → Roles & Permissions
// and stored in localStorage under 'uw_roles'. This module is the shared source of truth.

const FALLBACK_TEAM_ROLES = ['CEO', 'HR Manager', 'Team Lead', 'Employee']

// Page-level permission keys (Main Menu broken down per page).
const PAGE_KEYS = ['dashboard', 'timekeeping', 'tasks', 'payroll', 'employees']

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

export function getConfiguredRoles() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_roles'))
    const list = Array.isArray(stored) ? stored.filter((r) => r && r.name) : []
    return list.map((r) => ({ ...r, perms: normalizePerms(r.perms) }))
  } catch {
    return []
  }
}

// Role options for company registration — excludes console-only roles.
export function getTeamRoleOptions() {
  const assignable = getConfiguredRoles().filter((r) => !r.perms.settings)
  const names = assignable.map((r) => r.name)
  return names.length ? names : FALLBACK_TEAM_ROLES
}

export function saveRolesList(roles) {
  localStorage.setItem('uw_roles', JSON.stringify(roles))
}

// Action-level permissions (Add / Edit / Delete per module). Absent = allowed.
export function canAction(perms, module, action) {
  return perms?.actions?.[module]?.[action] !== false
}
