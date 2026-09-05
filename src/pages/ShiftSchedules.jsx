import { useEffect, useMemo, useState } from 'react'
import { usePageTitle } from '../lib/documentMeta'
import { getCompanyShifts, saveCompanyShiftData } from '../lib/shifts'
import { api } from '../lib/api'
import Avatar from '../components/Avatar'
import { SkeletonRows } from '../components/Skeleton'

// Shift Schedules — define shifts per company and assign them to employees.
// Shifts + assignments live in one per-company blob (shift_schedules) saved
// through the company-settings API; the sticky bar tracks unsaved changes.
export default function ShiftSchedules() {
  usePageTitle('Shift Schedules')
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [data, setData] = useState({ shifts: [], assignments: {}, otGraceMinutes: 15 })
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [newShift, setNewShift] = useState({ name: '', start: '08:00', end: '17:00', open: false })
  const [editingShift, setEditingShift] = useState(null)
  const [empQuery, setEmpQuery] = useState('')
  const [unassignedOnly, setUnassignedOnly] = useState(false)

  useEffect(() => {
    api('/api/companies').then((res) => {
      const all = Array.isArray(res) ? res : (res.data || [])
      const active = all.filter((c) => c.active !== false)
      setCompanies(active)
      if (active.length > 0) setCompanyId(active[0].id)
    }).catch(() => {
      setError('Could not load companies. Check your connection and try again.')
    })
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    getCompanyShifts(companyId).then((d) => {
      const full = { shifts: [], assignments: {}, otGraceMinutes: 15, ...d }
      setData(full)
      setSavedSnapshot(JSON.stringify(full))
      setLoading(false)
    })
  }, [companyId])

  const company = companies.find((c) => c.id === companyId)
  // Employees eligible for shift assignment — active, non-exempt only
  // (CEOs/administrators are not clock-tracked, same rule as TimeKeeping).
  const employees = useMemo(
    () => (company?.employees || []).filter((e) => e.active !== false && !/^(ceo|administrator|admin)$/i.test(String(e.role || ''))),
    [company]
  )

  // Display order: timed shifts by start time, open shifts last.
  const sortedShifts = useMemo(() => {
    const arr = [...(data.shifts || [])]
    arr.sort((a, b) => {
      if (!!a.open !== !!b.open) return a.open ? 1 : -1
      return (a.start || '').localeCompare(b.start || '') || String(a.name || '').localeCompare(String(b.name || ''))
    })
    return arr
  }, [data.shifts])

  const assignedCount = (shiftId) => employees.filter((e) => (data.assignments || {})[e.email] === shiftId).length
  const unassigned = employees.filter((e) => !(data.assignments || {})[e.email])
  const dirty = !loading && JSON.stringify(data) !== savedSnapshot

  const nameTaken = (name, exceptId) =>
    (data.shifts || []).some((s) => String(s.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase() && s.id !== exceptId)

  const flashNotice = (msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 3500)
  }

  const addShift = () => {
    const name = newShift.name.trim()
    if (!name) return
    if (nameTaken(name)) { setError('A shift named "' + name + '" already exists.'); return }
    setError(null)
    setData((d) => ({
      ...d,
      shifts: [...d.shifts, { id: 'sh-' + Date.now(), name, start: newShift.start, end: newShift.end, open: !!newShift.open }],
    }))
    setNewShift({ name: '', start: '08:00', end: '17:00', open: false })
    flashNotice('"' + name + '" added — remember to save.')
  }

  const removeShift = (id) => {
    setData((d) => {
      const assignments = Object.fromEntries(Object.entries(d.assignments || {}).filter(([, sid]) => sid !== id))
      return { shifts: d.shifts.filter((s) => s.id !== id), assignments, otGraceMinutes: d.otGraceMinutes }
    })
  }

  // Inline shift editing — rename or change times without re-creating.
  const saveEditShift = () => {
    if (!editingShift || !editingShift.name.trim()) return
    if (nameTaken(editingShift.name, editingShift.id)) { setError('A shift named "' + editingShift.name.trim() + '" already exists.'); return }
    setError(null)
    setData((d) => ({
      ...d,
      shifts: d.shifts.map((s) => (s.id === editingShift.id
        ? { ...s, name: editingShift.name.trim(), start: editingShift.start, end: editingShift.end, open: !!editingShift.open }
        : s)),
    }))
    setEditingShift(null)
  }

  const assignShift = (email, shiftId) => {
    setData((d) => ({ ...d, assignments: { ...d.assignments, [email]: shiftId || undefined } }))
  }

  const selectCompany = (id) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch company and discard them?')) return
    setCompanyId(id)
    setEditingShift(null)
    setEmpQuery('')
    setUnassignedOnly(false)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveCompanyShiftData(companyId, () => data)
      setSavedSnapshot(JSON.stringify(data))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Could not save shift schedules.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

  return (
    <div className="space-y-6">
      {/* Header — aligned with Companies / System Config / My Profile (space-y-6, no extra max-w, inherits AdminLayout max-w-6xl) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Shift Schedules</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            Define shifts per company and assign them to your team. Kiosk punches are automatically recorded as
            clock-in or clock-out based on the assigned shift.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Company:</span>
            <select value={companyId} onChange={(e) => selectCompany(e.target.value)} className={inputCls + ' min-h-[44px]'}>
              {companies.length===0 && <option value="">No active companies</option>}
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-gray-400">Only active companies appear — synced with Companies.</p>
          </label>
        </div>
      </div>

      {notice && <p className="rounded-lg bg-brand-50 px-4 py-3 text-xs font-medium text-brand-800 ring-1 ring-brand-200">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700 ring-1 ring-red-200">{error}</p>}

      {/* Summary — at-a-glance schedule health */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Shifts defined', String((data.shifts || []).length), 'All shifts of ' + (company?.name || 'this company')],
          ['Assigned', String(employees.length - unassigned.length), 'employees with a shift'],
          ['Unassigned', String(unassigned.length), unassigned.length ? 'default to simple in/out alternation' : 'everyone has a shift'],
          ['OT grace', (Number.isFinite(data.otGraceMinutes) ? data.otGraceMinutes : 15) + ' min', 'after shift end'],
        ].map(([label, v, sub]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-gray-900 sm:text-2xl">{v}</p>
            <p className="mt-1 text-[11px] text-gray-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Shift definitions — sorted, with assigned-count badges */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 sm:text-lg">Shifts</h2>
            <p className="mt-0.5 text-xs text-gray-400">Timed shifts first (by start time), open shifts last.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200">{(data.shifts || []).length} shifts</span>
        </div>
        <div className="mt-4 space-y-3">
          {loading ? (
            <SkeletonRows rows={3} page="Shift Schedules" />
          ) : sortedShifts.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-8 text-center text-sm text-gray-500">No shifts defined yet. Add your first shift below.</p>
          ) : (
            sortedShifts.map((s) => {
              const count = assignedCount(s.id)
              const isEditing = editingShift && editingShift.id === s.id
              return (
                <div key={s.id} className={'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ' + (isEditing ? 'border-brand-300 bg-brand-50/30' : 'border-gray-200')}>
                  {isEditing ? (
                    <>
                      <div className="grid flex-1 gap-2 sm:grid-cols-4">
                        <input value={editingShift.name} onChange={(e) => setEditingShift({ ...editingShift, name: e.target.value })} aria-label="Shift name" placeholder="Shift name" className="rounded-lg border border-brand-400 px-3 py-2 text-sm focus:outline-none min-h-[44px]" />
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 min-h-[44px]">
                          <input type="checkbox" checked={!!editingShift.open} onChange={(e) => setEditingShift({ ...editingShift, open: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                          <span className="whitespace-nowrap">Open shift</span>
                        </label>
                        <input type="time" value={editingShift.start || ''} disabled={!!editingShift.open} onChange={(e) => setEditingShift({ ...editingShift, start: e.target.value })} aria-label="Start time" className="rounded-lg border border-brand-400 px-3 py-2 text-sm tabular-nums focus:outline-none disabled:bg-gray-100 min-h-[44px]" />
                        <input type="time" value={editingShift.end || ''} disabled={!!editingShift.open} onChange={(e) => setEditingShift({ ...editingShift, end: e.target.value })} aria-label="End time" className="rounded-lg border border-brand-400 px-3 py-2 text-sm tabular-nums focus:outline-none disabled:bg-gray-100 min-h-[44px]" />
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button type="button" onClick={saveEditShift} disabled={!editingShift.name.trim()} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 min-h-[44px]">Save</button>
                        <button type="button" onClick={() => setEditingShift(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 min-h-[44px]">Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 sm:text-base">{s.name}</span>
                          <span className={'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ' + (count > 0 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-gray-100 text-gray-500 ring-gray-200')}>
                            {count} assigned
                          </span>
                        </div>
                        {count > 0 && (
                          <p className="mt-0.5 truncate text-[11px] text-gray-400">
                            {employees.filter((e) => (data.assignments || {})[e.email] === s.id).map((e) => e.name).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        {s.open ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">Open shift · no fixed time</span>
                        ) : (
                          <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold tabular-nums text-brand-700 ring-1 ring-brand-200">{s.start} – {s.end}</span>
                        )}
                        <button type="button" onClick={() => setEditingShift({ id: s.id, name: s.name, start: s.start, end: s.end, open: !!s.open })} className="rounded-lg p-2.5 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Edit shift" aria-label={'Edit ' + s.name}>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button type="button" onClick={() => removeShift(s.id)} className="rounded-lg p-2.5 text-red-400 transition hover:bg-red-50 hover:text-red-600 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Delete shift" aria-label={'Delete ' + s.name}>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="mt-6 space-y-4 rounded-xl bg-gray-50 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1 text-sm">
              <span className="font-medium text-gray-700">Shift name: *</span>
              <input value={newShift.name} onChange={(e) => setNewShift({ ...newShift, name: e.target.value })} placeholder="Shift name (e.g. Morning)" aria-label="Shift name" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/10 min-h-[44px]" />
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 sm:self-end min-h-[44px]">
              <input
                type="checkbox"
                checked={!!newShift.open}
                onChange={(e) => setNewShift({ ...newShift, open: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="whitespace-nowrap">Open shift</span>
            </label>
          </div>
          {!newShift.open && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Start time:</span>
                <input type="time" value={newShift.start} onChange={(e) => setNewShift({ ...newShift, start: e.target.value })} aria-label="Start time" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm tabular-nums focus:border-brand-500 focus:outline-none min-h-[44px]" />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">End time:</span>
                <input type="time" value={newShift.end} onChange={(e) => setNewShift({ ...newShift, end: e.target.value })} aria-label="End time" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm tabular-nums focus:border-brand-500 focus:outline-none min-h-[44px]" />
              </label>
            </div>
          )}
          <button type="button" onClick={addShift} disabled={!newShift.name.trim() || (!newShift.open && (!newShift.start || !newShift.end))} className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-40 min-h-[44px]">
            Add shift
          </button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-gray-500">
          An <span className="font-semibold">Open shift</span> has no standard time — scans simply alternate between clock-in and clock-out, and overtime is never flagged.
        </p>
      </section>

      {/* Employee assignments — the page's key workflow, previously only on People */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 sm:text-lg">Employee assignments</h2>
            <p className="mt-0.5 text-xs text-gray-400">On-time / late and overtime are compared against each employee's assigned shift.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">{employees.length - unassigned.length}/{employees.length} assigned</span>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600">
              <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              Unassigned only
            </label>
          </div>
        </div>

        <div className="relative mt-4 max-w-md">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            value={empQuery}
            onChange={(e) => setEmpQuery(e.target.value)}
            placeholder="Search employee…"
            aria-label="Search employees"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none"
          />
        </div>

        {loading ? (
          <SkeletonRows rows={4} page="Assignments" />
        ) : employees.length === 0 ? (
          <p className="mt-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-8 text-center text-sm text-gray-500">No active employees in this company yet. Add people on the People page first.</p>
        ) : (          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
            <div className="divide-y divide-gray-100">
              {employees
                .filter((e) => {
                  const q = empQuery.trim().toLowerCase()
                  const matchQ = !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)
                  const matchU = !unassignedOnly || !(data.assignments || {})[e.email]
                  return matchQ && matchU
                })
                .map((e) => {
                  const assignedId = (data.assignments || {})[e.email] || ''
                  const shift = (data.shifts || []).find((s) => s.id === assignedId)
                  return (
                    <div key={e.email} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50">
                      <Avatar user={{ name: e.name, initials: e.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(), avatar: e.avatar }} size="h-9 w-9 text-xs" />
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate text-sm font-semibold text-gray-900">{e.name}</p>
                        <p className="truncate text-xs text-gray-400">{e.role || 'Unassigned'}{shift ? ' � ' + shift.name : ''}</p>
                      </div>
                      <select
                        value={assignedId}
                        onChange={(ev) => assignShift(e.email, ev.target.value)}
                        aria-label={'Shift for ' + e.name}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none sm:w-48"
                      >
                        <option value="">No shift</option>
                        {(data.shifts || []).map((s) => (
                          <option key={s.id} value={s.id}>{s.open ? s.name + ' (open)' : s.name + ' � ' + s.start + '�' + s.end}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
            </div>
            {employees.some((e) => {
              const q = empQuery.trim().toLowerCase()
              const matchQ = !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)
              const matchU = !unassignedOnly || !(data.assignments || {})[e.email]
              return matchQ && matchU
            }) === false && (
              <p className="px-4 py-6 text-center text-xs text-gray-400">No employees match your search or filters.</p>
            )}
          </div>
        )}
      </section>

      {/* Overtime grace � full width on mobile */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-gray-900 sm:text-lg">Overtime</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          A clock-out is flagged as <span className="font-semibold">Overtime</span> when it happens this many
          minutes after the assigned shift's end time. Applies to all employees of the selected company.
        </p>
        <label className="mt-4 block w-full text-sm sm:w-48">
          <span className="font-medium text-gray-700">OT after shift end (minutes):</span>
          <input
            type="number"
            min="0"
            value={Number.isFinite(data.otGraceMinutes) ? data.otGraceMinutes : 15}
            onChange={(e) => setData((d) => ({ ...d, otGraceMinutes: Number(e.target.value) }))}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-3 text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 min-h-[44px]"
          />
        </label>
      </section>

      <div className="sticky bottom-0 sm:bottom-4 flex flex-col gap-3 rounded-t-xl sm:rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:flex-row sm:items-center sm:justify-between">
        {saved ? (
          <span className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-50 px-4 py-2.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Shift schedules saved successfully
          </span>
        ) : (
          <span className="text-xs leading-relaxed text-gray-500 sm:text-sm">
            {dirty ? 'Unsaved changes � save to apply them to kiosk punches.' : 'Changes apply to kiosk punches immediately.'}
          </span>
        )}
        <button type="button" onClick={save} disabled={!dirty || loading || saving} className="w-full rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto min-h-[44px]">
          {saving ? 'Saving�' : (dirty ? 'Save schedules' : 'Changes saved')}
        </button>
      </div>
    </div>
  )
}
