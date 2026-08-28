import { useRef, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePageTitle } from '../lib/documentMeta'
import { getConfiguredRoles, canAction } from '../lib/roles'
import { api, apiEnabled } from '../lib/api'
import { getCompanyShifts, saveCompanyShiftData } from '../lib/shifts'
import { getCompanyLocations } from '../lib/locations'
import Avatar from '../components/Avatar'

export default function People() {
  usePageTitle('People')
  const { user } = useAuth()
  const roleOptions = getConfiguredRoles().filter((r) => !r.perms.settings).map((r) => r.name)
  const can = (action) => canAction(user?.perms, 'people', action)

  const [companies, setCompanies] = useState(() => [])
  const [companyId, setCompanyId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)
  const [savedName, setSavedName] = useState(null)
  const [shiftsData, setShiftsData] = useState({ shifts: [], assignments: {} })
  const [companyLocations, setCompanyLocations] = useState([])

  const formRef = useRef({ name: '', email: '', role: roleOptions[roleOptions.length - 1] || '', locationId: '' })
  const [, forceRender] = useState(0)
  const form = formRef.current

  // Load companies (scoped to the signed-in user's own company).
  const load = async () => {
    let scoped = []
    try {
      const all = await api('/api/companies')
      scoped = user?.companyName ? all.filter((c) => c.name === user.companyName) : all
    } catch {
      scoped = []
    }
    setCompanies(scoped)
    setCompanyId((prev) => prev || scoped[0]?.id || null)
    if (scoped[0]?.id) {
      try { setShiftsData(await getCompanyShifts(scoped[0].id)) } catch { /* ignore */ }
    }
  }

  useEffect(() => { load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [])

  // Reload shifts and locations when the selected company changes.
  useEffect(() => {
    if (!companyId) return
    getCompanyShifts(companyId).then(setShiftsData).catch(() => {})
    getCompanyLocations(companyId).then(setCompanyLocations).catch(() => {})
  }, [companyId])

  const company = companies.find((c) => c.id === companyId)
  const people = company?.employees || []

  const assignShift = async (email, shiftId) => {
    setShiftsData((prev) => ({
      ...prev,
      assignments: { ...(prev.assignments || {}), [email]: shiftId || undefined },
    }))
    await saveCompanyShiftData(companyId, (d) => ({
      ...d,
      assignments: { ...(d.assignments || {}), [email]: shiftId || undefined },
    }))
  }

  const shiftName = (emp) => {
    const sid = (shiftsData.assignments || {})[emp.email]
    if (!sid) return null
    return (shiftsData.shifts || []).find((s) => s.id === sid)?.name || null
  }

  const selectCompany = (id) => {
    setCompanyId(id)
    setEditingId(null)
  }

  /* --- mutations --- */
  const addEmployee = async (e) => {
    e.preventDefault()
    setError(null)
    const cleanName = form.name.trim()
    const cleanEmail = form.email.trim().toLowerCase()
    if (!company) return setError('No company available.')
    if (!cleanName) return setError('Name is required.')
    if (!cleanEmail) return setError('Email is required.')
    if (people.some((p) => p.email?.toLowerCase() === cleanEmail)) {
      return setError(`${cleanEmail} is already on this team.`)
    }

    try {
      const locVal = form.locationId || ''
      const locPayload = locVal ? { locationId: locVal, location: companyLocations.find((l)=>l.id===locVal)?.name || locVal } : {}
      if (apiEnabled()) {
        await api(`/api/companies/${company.id}/employees`, {
          method: 'POST',
          body: { name: cleanName, email: cleanEmail, role: form.role || 'Unassigned', active: true, ...locPayload },
        })
      }
      await load()
      setSavedName(`${cleanName} (${cleanEmail})`)
      form.name = ''
      form.email = ''
      form.role = roleOptions[roleOptions.length - 1] || ''
      form.locationId = ''
      forceRender((n) => n + 1)
      setTimeout(() => setSavedName(null), 4000)
    } catch (err) {
      setError(err.message || 'Unable to save.')
    }
  }

  const saveEdit = async (emp, updates) => {
    setError(null)
    if (apiEnabled() && emp.id) {
      await api(`/api/employees/${emp.id}`, { method: 'PUT', body: updates }).catch((err) => setError(err.message))
    }
    await load()
    setEditingId(null)
  }

  const toggleStatus = async (emp) => {
    await saveEdit(emp, { active: emp.active === false })
  }

  const deleteEmployee = async (emp) => {
    if (!window.confirm(`Remove ${emp.name} from ${company?.name}?`)) return
    setError(null)
    if (apiEnabled() && emp.id) {
      await api(`/api/employees/${emp.id}`, { method: 'DELETE' }).catch((err) => setError(err.message))
    }
    await load()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">People</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">View, edit and manage your team members.</p>
        </div>
        {companies.length > 1 && (
          <select
            value={companyId || ''}
            onChange={(e) => selectCompany(e.target.value)}
            aria-label="Select company"
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700 ring-1 ring-red-200">{error}</p>
      )}
      {savedName && (
        <p className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          {savedName} added successfully.
        </p>
      )}

      {/* Add employee — hidden when the role lacks the Add permission */}
      {can('add') ? (
      <form onSubmit={addEmployee} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className={`text-base font-bold ${can('add') ? 'text-gray-900' : 'text-gray-300'}`}>Add team member{!can('add') && ' (not permitted for your role)'}</span>
          <svg className={`h-5 w-5 text-gray-400 transition-transform ${showAdd ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAdd && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Full name: *</span>
                <input value={form.name} onChange={(e) => { form.name = e.target.value; forceRender((n) => n + 1) }} required placeholder="Juan Dela Cruz" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10" />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Email address: *</span>
                <input value={form.email} onChange={(e) => { form.email = e.target.value; forceRender((n) => n + 1) }} required type="email" placeholder="juan@company.com" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10" />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Role:</span>
                <select value={form.role} onChange={(e) => { form.role = e.target.value; forceRender((n) => n + 1) }} disabled={roleOptions.length === 0} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10">
                  {roleOptions.length === 0 ? <option value="">No roles available</option> : roleOptions.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Location:</span>
                <select value={form.locationId} onChange={(e) => { form.locationId = e.target.value; forceRender((n) => n + 1) }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10">
                  <option value="">No location</option>
                  {companyLocations.map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {companyLocations.length===0 && <span className="mt-1 block text-[11px] text-amber-600">No locations — add in Companies → Locations</span>}
              </label>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">+ Add</button>
            </div>
          </>
        )}
      </form>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center text-xs text-gray-400">
          Adding team members is not permitted for your role. Contact the system administrator.
        </div>
      )}

      {/* People table */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">Team ({people.length})</h2>
          <p className="text-xs text-gray-400">{company?.name || ''}</p>
        </div>
        <ul className="divide-y divide-gray-100">
          {people.map((emp) => (
            <li key={emp.email} className="px-6 py-4">
              {editingId === emp.email ? (
                <EditRow emp={emp} roleOptions={roleOptions} locations={companyLocations} onSave={(updates) => saveEdit(emp, updates)} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar user={{ name: emp.name, initials: emp.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(), avatar: emp.avatar }} size="h-10 w-10 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{emp.name}</p>
                    <p className="truncate text-xs text-gray-400">{emp.email}</p>
                  </div>
                  <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 sm:inline ${
                    emp.active !== false ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
                  }`}>
                    {emp.active !== false ? 'Active' : 'Inactive'}
                  </span>
                  <span className="hidden rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600 md:inline">{emp.role}</span>
                  {(() => { const loc = companyLocations.find((l)=>l.id===(emp.locationId||emp.location))?.name || emp.location || ''; return loc ? <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200 lg:inline">{loc}</span> : null })()}
                  {shiftName(emp) && (
                    <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 lg:inline">
                      {shiftName(emp)}
                    </span>
                  )}
                  <select
                    value={(shiftsData.assignments || {})[emp.email] || ''}
                    onChange={(e) => assignShift(emp.email, e.target.value)}
                    aria-label={`Shift for ${emp.name}`}
                    title="Assign shift"
                    className="hidden w-36 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none md:block"
                  >
                    <option value="">No shift</option>
                    {(shiftsData.shifts || []).map((s) => (
                      <option key={s.id} value={s.id}>{s.open ? `${s.name} (open)` : s.name}</option>
                    ))}
                  </select>
                  <div className="flex shrink-0 items-center gap-1">
                    {can('delete') && (
                      <button type="button" onClick={() => toggleStatus(emp)} title={emp.active !== false ? 'Set inactive' : 'Set active'} className="rounded-lg p-2 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600">
                        {emp.active !== false ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        )}
                      </button>
                    )}
                    {can('edit') && (
                      <button type="button" onClick={() => setEditingId(emp.email)} title="Edit" className="rounded-lg p-2 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    )}
                    {can('delete') && (
                      <button type="button" onClick={() => deleteEmployee(emp)} title="Remove" className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
          {people.length === 0 && (
            <li className="px-6 py-10 text-center text-sm text-gray-400">No team members yet — add your first one above.</li>
          )}
        </ul>
      </section>
    </div>
  )
}

function EditRow({ emp, roleOptions, locations = [], onSave, onCancel }) {
  const [name, setName] = useState(emp.name)
  const [role, setRole] = useState(emp.role)
  const [locationId, setLocationId] = useState(emp.locationId || emp.location || '')

  // Resolve current location id to actual id if stored as name
  const resolvedLocationId = (() => {
    if (locations.some((l)=>l.id===locationId)) return locationId
    const byName = locations.find((l)=>l.name===locationId)
    return byName ? byName.id : locationId
  })()

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const loc = locations.find((l)=>l.id===locationId); onSave({ name: name.trim() || emp.name, role, locationId: locationId || null, location: loc?.name || locationId || null }) }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="block min-w-[160px] flex-1 text-xs">
        <span className="font-medium text-gray-500">Full name:</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="mt-1 w-full rounded-md border border-brand-400 px-2 py-1.5 text-sm focus:outline-none" />
      </label>
      <label className="block w-32 text-xs">
        <span className="font-medium text-gray-500">Role:</span>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full rounded-md border border-brand-400 px-2 py-1.5 text-sm focus:outline-none">
          {(roleOptions.includes(role) || !role ? [...new Set([role, ...roleOptions].filter(Boolean))] : roleOptions).map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <label className="block w-36 text-xs">
        <span className="font-medium text-gray-500">Location:</span>
        <select value={resolvedLocationId} onChange={(e) => setLocationId(e.target.value)} className="mt-1 w-full rounded-md border border-brand-400 px-2 py-1.5 text-sm focus:outline-none">
          <option value="">No location</option>
          {locations.map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <div className="flex gap-2 pb-0.5">
        <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Save</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </form>
  )
}
