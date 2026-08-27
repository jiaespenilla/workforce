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
        setCompanies(all)
        if (all.length > 0) setCompanyId(all[0].id)
      }).catch(() => setCompanies(loadRegisteredCompanies()))
    } else {
      setCompanies(loadRegisteredCompanies())
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Shift Schedules</h1>
        <p className="mt-1 text-sm text-gray-500">
          Define shifts per company. Kiosk punches are automatically recorded as clock-in or clock-out
          based on the employee's assigned shift.
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-700">Company:</span>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputCls}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      {/* Shift definitions */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-900">Shifts</h2>
        <div className="mt-4 space-y-2">
          {(data.shifts || []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 p-3">
              <span className="flex-1 font-semibold text-gray-900">{s.name}</span>
              {s.open ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">Open shift · no fixed time</span>
              ) : (
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold tabular-nums text-brand-700 ring-1 ring-brand-200">{s.start} – {s.end}</span>
              )}
              <button type="button" onClick={() => removeShift(s.id)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Delete shift">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
          {(data.shifts || []).length === 0 && (
            <p className="py-4 text-center text-xs text-gray-400">No shifts defined yet.</p>
          )}
        </div>

        <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input value={newShift.name} onChange={(e) => setNewShift({ ...newShift, name: e.target.value })} placeholder="Shift name (e.g. Morning)" aria-label="Shift name" className={`flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none ${newShift.open ? 'sm:flex-none sm:w-64' : ''}`} />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={!!newShift.open}
                onChange={(e) => setNewShift({ ...newShift, open: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Open shift (no fixed clock-in/out times)
            </label>
          </div>
          {!newShift.open && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
              <span className="hidden sm:block" aria-hidden="true"></span>
              <input type="time" value={newShift.start} onChange={(e) => setNewShift({ ...newShift, start: e.target.value })} aria-label="Start time" className="rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none" />
              <input type="time" value={newShift.end} onChange={(e) => setNewShift({ ...newShift, end: e.target.value })} aria-label="End time" className="rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none" />
              <span></span>
            </div>
          )}
          <button type="button" onClick={addShift} disabled={!newShift.name.trim() || (!newShift.open && (!newShift.start || !newShift.end))} className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-40">
            Add shift
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-400">
          Tip: assign shifts to employees on the <span className="font-semibold">People</span> page.
          An <span className="font-semibold">Open shift</span> has no standard time — scans simply alternate between clock-in and clock-out, and overtime is never flagged.
        </p>
      </section>

      {/* Overtime grace */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-900">Overtime</h2>
        <p className="mt-1 text-sm text-gray-500">
          A clock-out is flagged as <span className="font-semibold">Overtime</span> when it happens this many
          minutes after the assigned shift's end time. Applies to all employees of the selected company.
        </p>
        <label className="mt-3 block w-48 text-sm">
          <span className="font-medium text-gray-700">OT after shift end (minutes):</span>
          <input
            type="number"
            min="0"
            value={Number.isFinite(data.otGraceMinutes) ? data.otGraceMinutes : 15}
            onChange={(e) => setData((d) => ({ ...d, otGraceMinutes: Number(e.target.value) }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          />
        </label>
      </section>

      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        {saved ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Shift schedules saved successfully
          </span>
        ) : (
          <span className="text-xs text-gray-400">Changes apply to kiosk punches immediately.</span>
        )}
        <button type="button" onClick={save} className="rounded-xl bg-brand-600 px-8 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-700">
          Save schedules
        </button>
      </div>
    </div>
  )
}
