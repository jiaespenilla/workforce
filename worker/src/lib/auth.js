// Auth — requireAuth / requireAdmin / tenant scoping / server-side permissions
import { verifyToken } from './crypto.js'
import { HttpError } from './http.js'

const BASIC_MEMBER_PAGES = new Set(['dashboard', 'timekeeping', 'tasks'])

function parsePermissions(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

// Resolve the authenticated account to an active employee and company. The
// only accounts allowed to exist without an employee row are explicit platform
// administrators. This prevents a deleted/unlinked employee from inheriting
// the old "global" null-company scope.
export async function callerAccess(env, claims) {
  if (claims?.role === 'administrator') {
    return { isAdmin: true, companyId: null, employeeId: null, employeeRole: 'Administrator', permissions: null }
  }
  const row = await env.DB.prepare(
    `SELECT e.id AS employee_id, e.company_id, e.role AS employee_role, e.active AS employee_active,
            c.active AS company_active, c.status AS company_status, r.perms_json
       FROM employees e
       JOIN companies c ON c.id = e.company_id
       LEFT JOIN roles r ON lower(r.name) = lower(e.role)
      WHERE lower(e.email) = ? LIMIT 1`
  ).bind(String(claims?.sub || '').toLowerCase()).first()
  if (!row) throw HttpError(401, 'Account is no longer linked to an active employee. Contact an administrator.')
  if (row.employee_active === 0) throw HttpError(401, 'Account deactivated.')
  if (row.company_active === 0 || row.company_status === 'rejected') {
    throw HttpError(403, 'Company is not active. Contact administrator.')
  }
  return {
    isAdmin: false,
    companyId: row.company_id,
    employeeId: row.employee_id,
    employeeRole: row.employee_role || 'Employee',
    permissions: parsePermissions(row.perms_json),
  }
}

export function canAccessPage(access, claims, page) {
  if (access?.isAdmin || claims?.role === 'ceo') return true
  if (!access?.permissions) return BASIC_MEMBER_PAGES.has(page)
  return access.permissions[page] !== false
}

export function canPerformAction(access, claims, page, module, action) {
  if (!canAccessPage(access, claims, page)) return false
  if (access?.isAdmin || claims?.role === 'ceo') return true
  return access?.permissions?.actions?.[module]?.[action] !== false
}

export async function requirePagePermission(env, claims, page, message = 'You do not have permission for this action.') {
  if (claims?.role === 'administrator' || claims?.role === 'ceo') return { isAdmin: claims.role === 'administrator' }
  const access = await callerAccess(env, claims)
  if (!canAccessPage(access, claims, page)) throw HttpError(403, message)
  return access
}

export async function requireActionPermission(env, claims, page, module, action, message = 'You do not have permission for this action.') {
  if (claims?.role === 'administrator' || claims?.role === 'ceo') return { isAdmin: claims.role === 'administrator' }
  const access = await callerAccess(env, claims)
  if (!canPerformAction(access, claims, page, module, action)) throw HttpError(403, message)
  return access
}

export async function requireAuth(request, env) {
  if (!env.AUTH_SECRET) throw HttpError(500, 'Server misconfigured: AUTH_SECRET missing. Set via wrangler secret put AUTH_SECRET')
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const claims = await verifyToken(token, env.AUTH_SECRET)
  if (!claims) throw HttpError(401, 'Unauthorized')
  // Bearer tokens remain valid for up to 12 hours, so account, employee and
  // company status are re-checked on every request.
  await callerAccess(env, claims)
  return claims
}

export async function requireAdmin(request, env) {
  const claims = await requireAuth(request, env)
  if (claims.role !== 'administrator') throw HttpError(403, 'Forbidden')
  return claims
}

export async function callerCompanyId(env, claims) {
  return (await callerAccess(env, claims)).companyId
}
