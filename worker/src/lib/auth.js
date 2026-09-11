// Auth — requireAuth / requireAdmin / tenant scoping
import { verifyToken } from './crypto.js'
import { HttpError } from './http.js'

export async function requireAuth(request, env) {
  if (!env.AUTH_SECRET) throw HttpError(500, 'Server misconfigured: AUTH_SECRET missing. Set via wrangler secret put AUTH_SECRET')
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const claims = await verifyToken(token, env.AUTH_SECRET)
  if (!claims) throw HttpError(401, 'Unauthorized')
  // Deactivation revocation: bearer tokens stay valid up to their 12h TTL, so
  // the employee's active flag is re-checked per request (one indexed lookup).
  // Administrators and accounts without an employee record (platform staff) pass.
  if (claims.role !== 'administrator') {
    const row = await env.DB.prepare('SELECT active FROM employees WHERE lower(email) = ? LIMIT 1')
      .bind(String(claims.sub || '').toLowerCase()).first()
    if (row && row.active === 0) throw HttpError(401, 'Account deactivated.')
  }
  return claims
}

export async function requireAdmin(request, env) {
  const claims = await requireAuth(request, env)
  if (claims.role !== 'administrator') throw HttpError(403, 'Forbidden')
  return claims
}

export async function callerCompanyId(env, claims) {
  if (claims.role === 'administrator') return null
  const row = await env.DB.prepare('SELECT company_id FROM employees WHERE lower(email) = ? LIMIT 1')
    .bind(String(claims.sub || '').toLowerCase()).first()
  return row?.company_id || null
}
