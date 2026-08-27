// Kiosk config per company — dynamic unique setup.
// Shape: { [companyId]: { method, pinFallback, requireReAuth, pinLength, lockoutAttempts, qrRotation, camera, idleTimeout, site } }
// Cloud mode via settings key kiosk_configs; local via localStorage.

import { api, apiEnabled } from './api'

const KEY = 'uw_kiosk_configs'
const SETTINGS_KEY = 'kiosk_configs'

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

function readLocalAll() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
    // Migration: legacy single global config
    const legacy = localStorage.getItem('uw_kiosk_config')
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy)
        return { _legacy: { ...DEFAULTS, ...parsed } }
      } catch { return {} }
    }
    return {}
  } catch { return {} }
}

function writeLocalAll(all) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export async function loadAllKioskConfigs() {
  if (apiEnabled()) {
    try {
      const settings = await api('/api/settings')
      const raw = settings[SETTINGS_KEY]
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }
  return readLocalAll()
}

export async function saveAllKioskConfigs(all) {
  if (apiEnabled()) {
    await api('/api/settings', { method: 'PUT', body: { [SETTINGS_KEY]: JSON.stringify(all) } })
  } else {
    writeLocalAll(all)
  }
}

export function getDefaultKioskConfig() {
  return { ...DEFAULTS }
}

export async function getCompanyKioskConfig(companyId) {
  if (!companyId) return { ...DEFAULTS }
  const all = await loadAllKioskConfigs()
  // If only legacy global exists and no per-company, use it as fallback
  if (all._legacy && !all[companyId]) {
    return { ...DEFAULTS, ...all._legacy }
  }
  return { ...DEFAULTS, ...(all[companyId] || {}) }
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
  const all = await loadAllKioskConfigs()
  all[companyId] = { ...DEFAULTS, ...config }
  // Remove legacy key after first per-company save to avoid confusion
  if (all._legacy) delete all._legacy
  await saveAllKioskConfigs(all)
  // Also update local for immediate sync
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch {}
  return all[companyId]
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
