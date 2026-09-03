import { useState } from 'react'
import { ORG_KINDS, useOrgUnits } from '../lib/org'
import { PageLoader } from '../components/Skeleton'

// Organization Setup — manage departments, business units, locations,
// cost centers, positions, job levels and employment types.
export default function OrgPanel() {
  const { units, loading, add, rename, remove } = useOrgUnits()
  const [kind, setKind] = useState(ORG_KINDS[0][0])
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const rows = (units[kind] || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const kindLabel = ORG_KINDS.find(([k]) => k === kind)?.[1]

  const submitNew = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    add(kind, newName.trim(), newCode.trim() || null)
    setNewName('')
    setNewCode('')
  }

  return (
    <div className="space-y-5">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-base font-bold text-gray-900">Organization Setup</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          These lists appear when adding employees and building their employment profiles.
        </p>
      </div>

      {/* Kind selector */}
      <div className="flex flex-wrap gap-2">
        {ORG_KINDS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => { setKind(k); setEditingId(null) }}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              kind === k ? 'bg-brand-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Add new */}
      <form onSubmit={submitNew} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`New ${kindLabel?.replace(/s$/, '') || 'item'} name…`}
          aria-label="Name"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          required
        />
        <input
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          placeholder="Code (optional)"
          aria-label="Code"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-40 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
          Add
        </button>
      </form>

      {/* List */}
      {loading ? (
        <div className="overflow-hidden rounded-xl border border-gray-200"><PageLoader page="Organization" compact detail="Loading departments, locations and roles…" /></div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50">
              {editingId === row.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editName.trim()) {
                        rename(kind, row.id, editName.trim(), row.code)
                        setEditingId(null)
                      }
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="flex-1 rounded-md border border-brand-400 px-2 py-1 text-sm focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editName.trim()) rename(kind, row.id, editName.trim(), row.code)
                      setEditingId(null)
                    }}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium text-gray-900">{row.name}</span>
                  {row.code && <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] tabular-nums text-gray-500">{row.code}</span>}
                  <span className="text-[11px] text-gray-400">{(units[kind].length > 0 && row.employee_count != null) ? `${row.employee_count} in use` : ''}</span>
                  <button
                    type="button"
                    onClick={() => { setEditingId(row.id); setEditName(row.name) }}
                    className="text-xs font-medium text-gray-400 transition hover:text-brand-600"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(kind, row.id)}
                    className="text-xs font-medium text-red-400 transition hover:text-red-600"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-gray-400">
              Nothing here yet — add your first {kindLabel?.toLowerCase().replace(/s$/, '')} above.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
