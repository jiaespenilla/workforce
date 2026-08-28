// Kiosk device tokens — per-company pairing
export function kioskTokenFrom(request) {
  return (request.headers.get('X-Kiosk-Token') || '').trim()
}

export async function kioskTokenCompanyId(env, token) {
  if (!token || !token.startsWith('uwk_')) return null
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(`kiosk_device_token:${token}`).first()
  return row?.value || null
}

export function generateKioskToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return 'uwk_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
