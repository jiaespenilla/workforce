import { useEffect, useState } from 'react'
import { api, apiEnabled } from '../lib/api'

// Organization reference lists managed by the administrator.
export const ORG_KINDS = [
  ['department', 'Departments'],
  ['business_unit', 'Business Units'],
  ['location', 'Locations'],
  ['cost_center', 'Cost Centers'],
  ['position', 'Positions'],
  ['job_level', 'Job Levels'],
  ['employment_type', 'Employment Types'],
]

function loadLocal(kind) {
  try {
    const all = JSON.parse(localStorage.getItem('uw_org_units')) || {}
    return all[kind] || []
  } catch {
    return []
  }
}

function saveLocal(kind, rows) {
  try {
    const all = JSON.parse(localStorage.getItem('uw_org_units')) || {}
    all[kind] = rows
    localStorage.setItem('uw_org_units', JSON.stringify(all))
  } catch {
    // storage unavailable
  }
}

export function useOrgUnits() {
  const [units, setUnits] = useState(() => {
    if (apiEnabled()) return []
    return Object.fromEntries(ORG_KINDS.map(([kind]) => [kind, loadLocal(kind)]))
  })
  const [loading, setLoading] = useState(apiEnabled())

  const refresh = async () => {
    if (!apiEnabled()) return
    try {
      const rows = await api('/api/org-units')
      const grouped = Object.fromEntries(ORG_KINDS.map(([kind]) => [kind, []]))
      for (const row of rows) (grouped[row.kind] = grouped[row.kind] || []).push(row)
      setUnits(grouped)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const add = async (kind, name, code) => {
    if (apiEnabled()) {
      await api('/api/org-units', { method: 'POST', body: { kind, name, code } })
    } else {
      const rows = loadLocal(kind)
      saveLocal(kind, [...rows, { id: Date.now(), name, code }])
    }
    await refresh()
  }

  const rename = async (kind, id, name, code) => {
    if (apiEnabled()) {
      await api(`/api/org-units/${id}`, { method: 'PUT', body: { name, code } })
    } else {
      saveLocal(kind, loadLocal(kind).map((r) => (r.id === id ? { ...r, name, code } : r)))
    }
    await refresh()
  }

  const remove = async (kind, id) => {
    if (apiEnabled()) {
      await api(`/api/org-units/${id}`, { method: 'DELETE' })
    } else {
      saveLocal(kind, loadLocal(kind).filter((r) => r.id !== id))
    }
    await refresh()
  }

  return { units, loading, add, rename, remove, refresh }
}
