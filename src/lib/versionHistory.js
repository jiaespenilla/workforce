// Version history per system — tracks development changes.
// Shape: [{id, version, status, changes, date, author}]
// status: development | staging | production | archived
// Cloud via settings key version_history; local via localStorage.

import { api, apiEnabled } from './api'

const KEY = 'uw_version_history'
const SETTINGS_KEY = 'version_history'

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLocal(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export async function loadVersionHistory() {
  if (apiEnabled()) {
    try {
      const settings = await api('/api/settings')
      const raw = settings[SETTINGS_KEY]
      return raw ? JSON.parse(raw) : []
    } catch {
      return readLocal()
    }
  }
  return readLocal()
}

export async function saveVersionHistory(list) {
  if (apiEnabled()) {
    await api('/api/settings', { method: 'PUT', body: { [SETTINGS_KEY]: JSON.stringify(list) } })
    writeLocal(list)
  } else {
    writeLocal(list)
  }
}

export function seedInitialHistory(currentVersion) {
  const existing = readLocal()
  if (existing.length) return existing
  const seed = [
    {
      id: `v-${Date.now()}`,
      version: currentVersion || 'v0.1.0',
      status: 'development',
      changes: 'Initial development build — core modules, auth, company registration, roles & permissions, kiosk, shifts, notifications.',
      date: new Date().toISOString().slice(0, 10),
      author: 'System',
    },
  ]
  writeLocal(seed)
  return seed
}
