// Kiosk device tokens — per-company pairing
// A token may be permanent (main office kiosk) or temporary (field work, 71):
// a temporary token additionally stores `kiosk_token_expiry:<token>` = ISO
// timestamp. Validation rejects and cleans up expired tokens so a worn-out
// field token can never record punches.
const DEVICE_PREFIX = 'kiosk_device_token:'
const EXPIRY_PREFIX = 'kiosk_token_expiry:'

export function kioskTokenFrom(request) {
  return (request.headers.get('X-Kiosk-Token') || '').trim()
}

async function deleteTokenRows(env, token) {
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(`${DEVICE_PREFIX}${token}`),
      env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(`${EXPIRY_PREFIX}${token}`),
    ])
  } catch { /* best effort */ }
}

// Resolve a token to { companyId, expiresAt } (expiresAt = null when permanent).
// Expired temporary tokens are removed and treated as unknown.
export async function kioskTokenInfo(env, token) {
  if (!token || !token.startsWith('uwk_')) return null
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(`${DEVICE_PREFIX}${token}`).first()
  if (!row) return null
  let expiresAt = null
  const expRow = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(`${EXPIRY_PREFIX}${token}`).first()
  if (expRow?.value) {
    expiresAt = expRow.value
    const at = new Date(expiresAt).getTime()
    if (Number.isNaN(at) || at <= Date.now()) {
      await deleteTokenRows(env, token)
      return null
    }
  }
  return { companyId: row.value, expiresAt }
}

export async function kioskTokenCompanyId(env, token) {
  const info = await kioskTokenInfo(env, token)
  return info?.companyId || null
}

export function generateKioskToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return 'uwk_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Remove one device token (and any expiry row). Returns true when a row was removed.
export async function revokeKioskToken(env, token) {
  if (!token || !token.startsWith('uwk_')) return false
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(`${DEVICE_PREFIX}${token}`).first()
  if (!row) return false
  await deleteTokenRows(env, token)
  return true
}

// Allowed temporary-token TTLs (71): '1h' | '3h' | '5h' | 'day'
export const KIOSK_TOKEN_TTLS = ['1h', '3h', '5h', 'day']

export function kioskTtlLabel(ttl) {
  return { '1h': '1 hour', '3h': '3 hours', '5h': '5 hours', day: 'End of day' }[ttl] || ttl
}

// End of today in the deployment timezone (Asia/Manila, GMT+8) as a UTC instant.
export function endOfTodayUtc() {
  const OFFSET_MIN = 8 * 60
  const now = new Date()
  const local = new Date(now.getTime() + OFFSET_MIN * 60000)
  const endLocal = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 23, 59, 59, 999)
  return new Date(endLocal.getTime() - OFFSET_MIN * 60000)
}

// Expiry instant for a temporary token TTL, or null for an unknown TTL.
export function kioskTtlExpiry(ttl) {
  const MIN = 60 * 1000
  const HOUR = 60 * MIN
  const ms = { '1h': HOUR, '3h': 3 * HOUR, '5h': 5 * HOUR }[ttl]
  if (ms) return new Date(Date.now() + ms)
  if (ttl === 'day') return endOfTodayUtc()
  return null
}
