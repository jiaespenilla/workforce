// Employee work locations per company — dynamic setup.
// Shape: { [companyId]: { locations: [{id, name}] } }
// Cloud mode persists via Worker settings API (key: company_locations); local mode via localStorage.

import { api, apiEnabled } from './api'

const KEY = 'uw_company_locations'
const SETTINGS_KEY = 'company_locations'

function readLocalAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

function writeLocalAll(all) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export async function loadAllLocations() {
  if (apiEnabled()) {
    try {
      const settings = await api('/api/settings')
      const raw = settings[SETTINGS_KEY]
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }
  return readLocalAll()
}

export async function saveAllLocations(all) {
  if (apiEnabled()) {
    await api('/api/settings', { method: 'PUT', body: { [SETTINGS_KEY]: JSON.stringify(all) } })
  } else {
    writeLocalAll(all)
  }
}

export async function getCompanyLocations(companyId) {
  if (!companyId) return []
  const all = await loadAllLocations()
  return all[companyId]?.locations || []
}

export async function saveCompanyLocations(companyId, locations) {
  const all = await loadAllLocations()
  all[companyId] = { locations }
  await saveAllLocations(all)
  return locations
}

export async function addCompanyLocation(companyId, name) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Location name required')
  const all = await loadAllLocations()
  const entry = all[companyId] || { locations: [] }
  if (entry.locations.some((l) => l.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`Location "${trimmed}" already exists for this company.`)
  }
  const loc = { id: `loc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, name: trimmed }
  entry.locations.push(loc)
  all[companyId] = entry
  await saveAllLocations(all)
  return loc
}

export async function renameCompanyLocation(companyId, locId, newName) {
  const trimmed = newName.trim()
  if (!trimmed) throw new Error('Location name required')
  const all = await loadAllLocations()
  const entry = all[companyId]
  if (!entry) throw new Error('No locations for company')
  if (entry.locations.some((l) => l.id !== locId && l.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`Location "${trimmed}" already exists.`)
  }
  const loc = entry.locations.find((l) => l.id === locId)
  if (!loc) throw new Error('Location not found')
  loc.name = trimmed
  await saveAllLocations(all)
  return loc
}

export async function removeCompanyLocation(companyId, locId, employees = []) {
  const all = await loadAllLocations()
  const entry = all[companyId]
  if (!entry) return
  // Block if any employee uses this location
  const inUse = employees.some((e) => (e.locationId || e.location) === locId || (e.location || '').trim().toLowerCase() === entry.locations.find((l)=>l.id===locId)?.name.trim().toLowerCase())
  if (inUse) throw new Error('Location is in use by employees — reassign them first.')
  entry.locations = entry.locations.filter((l) => l.id !== locId)
  all[companyId] = entry
  await saveAllLocations(all)
}
