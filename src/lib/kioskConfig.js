// Kiosk config per company — dynamic unique setup.
// Cloud persists via settings key kiosk_configs.

import { api } from './api'

const KEY = 'uw_kiosk_configs'

const DEFAULTS = {
  method: 'fingerprint',
  pinFallback: true,
  requireReAuth: false,
  pinLength: 4,
  lockoutAttempts: 5,
  qrRotation: 'daily',
  camera: 'rear',
  idleTimeout: 60,
  site: 'hq',
}

export function getDefaultKioskConfig() {
  return { ...DEFAULTS }
}

export async function getCompanyKioskConfig(companyId) {
  if (!companyId) return { ...DEFAULTS }
  try {
    const data = await api(`/api/company-settings/${encodeURIComponent(companyId)}`)
    return { ...DEFAULTS, ...(data?.kiosk_configs || {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function getCompanyKioskConfigSync(companyId) {
  // Synchronous version for quick idle screen — reads local only
  try {
    const all = JSON.parse(localStorage.getItem(KEY)) || {}
    if (all[companyId]) return { ...DEFAULTS, ...all[companyId] }
    // check D1-backed local cache via uw_kiosk_configs? already
    const legacy = localStorage.getItem('uw_kiosk_config')
    if (legacy && !all[companyId]) {
      try { return { ...DEFAULTS, ...JSON.parse(legacy) } } catch {}
    }
  } catch {}
  return { ...DEFAULTS }
}

export async function saveCompanyKioskConfig(companyId, config) {
  const next = { ...DEFAULTS, ...config }
  await api(`/api/company-settings/${encodeURIComponent(companyId)}`, { method: 'PUT', body: { kiosk_configs: next } })
  // Also update local cache for immediate sync (kiosk idle screen reads sync)
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}')
    all[companyId] = next
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {}
  return next
}

// Legacy compat: global load/save still used elsewhere — keep but map to default
export function loadKioskConfig(companyId) {
  // If called without companyId (old code), return defaults or legacy
  if (!companyId) {
    try {
      const legacy = localStorage.getItem('uw_kiosk_config')
      if (legacy) return { ...DEFAULTS, ...JSON.parse(legacy) }
    } catch {}
    return { ...DEFAULTS }
  }
  return getCompanyKioskConfigSync(companyId)
}
