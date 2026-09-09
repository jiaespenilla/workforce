// Kiosk config per company — dynamic unique setup.
// Cloud persists via settings key kiosk_configs.

import { api } from './api'

const KEY = 'uw_kiosk_configs'

const DEFAULTS = {
  method: 'fingerprint',
  pinFallback: false, // (66) PIN is optional per company — enabled when they require it
  requireReAuth: false,
  pinLength: 4,
  lockoutAttempts: 5,
  qrRotation: 'daily',
  camera: 'rear',
  idleTimeout: 60,
  // (65) Assigned branch/site — aligned to the company's real work locations
  // (People → Work Locations). Stored as a stable location id; `site` keeps
  // the display name so the Kiosk header/footer can render without a lookup.
  siteId: '',
  site: '',
}

export function resolveKioskSite(config = {}, locations = []) {
  const list = Array.isArray(locations) ? locations : []
  if (config.siteId) {
    const byId = list.find((l) => String(l.id) === String(config.siteId))
    if (byId) return { siteId: byId.id, site: byId.name }
  }
  if (config.site) {
    const byName = list.find(
      (l) => String(l.name || '').trim().toLowerCase() === String(config.site).trim().toLowerCase()
    )
    if (byName) return { siteId: byName.id, site: byName.name }
  }
  // Keep the stored display name (legacy configs) even when locations are
  // unavailable; the Kiosk renders `site` verbatim.
  return { siteId: config.siteId || '', site: config.site || '' }
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
