// Employee work locations per company — dynamic setup.
// Shape: { locations: [{id, name}] } per company.
// Cloud mode persists via the per-company settings API (one key per company);
// local mode via localStorage.

import { api, apiEnabled } from './api'

const KEY = 'uw_company_locations'

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

export async function getCompanyLocations(companyId) {
  if (!companyId) return []
  if (apiEnabled()) {
    try {
      const data = await api(`/api/company-settings/${encodeURIComponent(companyId)}`)
      return data?.company_locations?.locations || []
    } catch {
      return []
    }
  }
  return readLocalAll()[companyId]?.locations || []
}

export async function saveCompanyLocations(companyId, locations) {
  if (apiEnabled()) {
    await api(`/api/company-settings/${encodeURIComponent(companyId)}`, { method: 'PUT', body: { company_locations: { locations } } })
    return locations
  }
  const all = readLocalAll()
  all[companyId] = { locations }
  writeLocalAll(all)
  return locations
}

export async function addCompanyLocation(companyId, name) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Location name required')
  const locations = await getCompanyLocations(companyId)
  if (locations.some((l) => l.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`Location "${trimmed}" already exists for this company.`)
  }
  const loc = { id: `loc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, name: trimmed }
  locations.push(loc)
  await saveCompanyLocations(companyId, locations)
  return loc
}

export async function renameCompanyLocation(companyId, locId, newName) {
  const trimmed = newName.trim()
  if (!trimmed) throw new Error('Location name required')
  const locations = await getCompanyLocations(companyId)
  if (!locations.length) throw new Error('No locations for company')
  if (locations.some((l) => l.id !== locId && l.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`Location "${trimmed}" already exists.`)
  }
  const loc = locations.find((l) => l.id === locId)
  if (!loc) throw new Error('Location not found')
  loc.name = trimmed
  await saveCompanyLocations(companyId, locations)
  return loc
}

export async function removeCompanyLocation(companyId, locId, employees = []) {
  const locations = await getCompanyLocations(companyId)
  if (!locations.length) return
  // Block if any employee uses this location
  const removed = locations.find((l) => l.id === locId)
  const inUse = employees.some((e) => (e.locationId || e.location) === locId || (e.location || '').trim().toLowerCase() === removed?.name.trim().toLowerCase())
  if (inUse) throw new Error('Location is in use by employees — reassign them first.')
  await saveCompanyLocations(companyId, locations.filter((l) => l.id !== locId))
}
