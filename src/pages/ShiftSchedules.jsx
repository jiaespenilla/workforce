import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePageTitle } from '../lib/documentMeta'
import { getCompanyShifts, saveCompanyShiftData } from '../lib/shifts'
import { getScopedCompanies, loadRegisteredCompanies } from '../lib/companies'
import { api, apiEnabled } from '../lib/api'

// Shift Schedules — define shifts per company and assign them to employees.
export default function ShiftSchedules() {
  usePageTitle('Shift Schedules')
  const { user } = useAuth()
  const [companies, setCompanies] = useState(() => user?.companyName ? getScopedCompanies(user) : [])

  const [companyId, setCompanyId] = useState('')
  const [data, setData] = useState({ shifts: [], assignments: {} })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [newShift, setNewShift] = useState({ name: '', start: '08:00', end: '17:00', open: false })

  useEffect(() => {
    if (apiEnabled()) {
      api('/api/companies').then((all) => {
        const active = all.filter((c) => c.active !== false)
        setCompanies(active)
        if (active.length > 0) setCompanyId(active[0].id)
      }).catch(() => setCompanies(loadRegisteredCompanies().filter((c)=>c.active!==false)))
    } else {
      setCompanies(loadRegisteredCompanies().filter((c)=>c.active!==false))
    }
  }, [])

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    getCompanyShifts(companyId).then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [companyId])

  const company = companies.find((c) => c.id === companyId)

  const addShift = () => {
    if (!newShift.name.trim()) return
    setData((d) => ({
      ...d,
      shifts: [...d.shifts, { id: `sh-${Date.now()}`, name: newShift.name.trim(), start: newShift.start, end: newShift.end }],
    }))
    setNewShift({ name: '', start: '08:00', end: '17:00' })
  }

  const removeShift = (id) => {
    setData((d) => {
      const assignments = Object.fromEntries(Object.entries(d.assignments || {}).filter(([, sid]) => sid !== id))
      return { shifts: d.shifts.filter((s) => s.id !== id), assignments }
    })
  }

  const assign = (email, shiftId) => {
    setData((d) => ({ ...d, assignments: { ...d.assignments, [email]: shiftId || undefined } }))
  }

  const save = async () => {
    await saveCompanyShiftData(companyId, () => data)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

  return (
    <div className="space-y-6">
      {/* Header — aligned with Companies / System Config / My Profile (space-y-6, no extra max-w, inherits AdminLayout max-w-6xl) */}
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Shift Schedules</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            Define shifts per company. Kiosk punches are automatically recorded as clock-in or clock-out
            based on the employee's assigned shift.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Company:</span>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${inputCls} mt-2 min-h-[44px]`}>
              {companies.length===0 && <option value="">No active companies</option>}
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-gray-400">Only active companies appear — synced with Companies.</p>
          </label>
        </div>
      </div>

      {/* Shift definitions — responsive cards */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-gray-900 sm:text-lg">Shifts</h2>
        <div className="mt-4 space-y-3">
          {(data.shifts || []).map((s) => (
            <div key={s.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex-1 text-sm font-semibold text-gray-900 sm:text-base">{s.name}</span>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {s.open ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">Open shift · no fixed time</span>
                ) : (
                  <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold tabular-nums text-brand-700 ring-1 ring-brand-200">{s.start} – {s.end}</span>
                )}
                <button type="button" onClick={() => removeShift(s.id)} className="rounded-lg p-2.5 text-red-400 transition hover:bg-red-50 hover:text-red-600 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Delete shift" aria-label={`Delete ${s.name}`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
          {(data.shifts || []).length === 0 && (
            <p className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-8 text-center text-sm text-gray-500">No shifts defined yet. Add your first shift below.</p>
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
          Tip: assign shifts to employees on the <span className="font-semibold">People</span> page.
          An <span className="font-semibold">Open shift</span> has no standard time — scans simply alternate between clock-in and clock-out, and overtime is never flagged.
        </p>
      </section>

      {/* Overtime grace — full width on mobile */}
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
          <span className="text-xs leading-relaxed text-gray-500 sm:text-sm">Changes apply to kiosk punches immediately.</span>
        )}
        <button type="button" onClick={save} className="w-full rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-700 sm:w-auto min-h-[44px]">
          Save schedules
        </button>
      </div>
    </div>
  )
}
