// Auth — requireAuth / requireAdmin / tenant scoping
import { verifyToken } from './crypto.js'
import { HttpError } from './http.js'

export async function requireAuth(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const claims = await verifyToken(token, env.AUTH_SECRET)
  if (!claims) throw HttpError(401, 'Unauthorized')
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
