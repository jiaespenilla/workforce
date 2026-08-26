// Employee kiosk credentials (fingerprint token, PIN, QR badge code).
// Cloud mode stores them in D1 via the Worker; local mode uses localStorage.

import { api, apiEnabled } from './api'

const KEY = 'uw_credentials'

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

export async function getCredential(email) {
  if (apiEnabled()) {
    // Cloud mode: fetch status for one employee
    try {
      const all = await api(`/api/credentials/${encodeURIComponent(email.toLowerCase())}`)
      return all
    } catch {
      return {}
    }
  }
  return readLocal()[email.toLowerCase()] || {}
}

export async function setFingerprint(email, token) {
  if (apiEnabled()) return api('/api/credentials', { method: 'POST', body: { email, kind: 'fingerprint', value: token } })
  const map = readLocal()
  map[email.toLowerCase()] = { ...(map[email.toLowerCase()] || {}), fpToken: token }
  localStorage.setItem(KEY, JSON.stringify(map))
  return { ok: true }
}

export async function setPin(email, pin) {
  if (apiEnabled()) return api('/api/credentials', { method: 'POST', body: { email, kind: 'pin', value: pin } })
  const map = readLocal()
  map[email.toLowerCase()] = { ...(map[email.toLowerCase()] || {}), pin }
  localStorage.setItem(KEY, JSON.stringify(map))
  return { ok: true }
}

// QR codes are generated server-side in cloud mode (deterministic from email);
// locally we mimic the same derivation.
export async function ensureQrCode(email) {
  if (apiEnabled()) {
    const res = await api('/api/credentials/qr', { method: 'POST', body: { email } })
    return res.code
  }
  const map = readLocal()
  const existing = map[email.toLowerCase()]?.qrCode
  if (existing) return existing
  // deterministic pseudo-hash of the email
  let hash = ''
  for (let i = 0; i < email.length; i++) hash = ((hash * 31 + email.charCodeAt(i)) >>> 0).toString(16)
  const code = ('UWQ-' + hash.toUpperCase() + Date.now().toString(36).toUpperCase()).slice(0, 20)
  map[email.toLowerCase()] = { ...(map[email.toLowerCase()] || {}), qrCode: code }
  localStorage.setItem(KEY, JSON.stringify(map))
  return code
}
