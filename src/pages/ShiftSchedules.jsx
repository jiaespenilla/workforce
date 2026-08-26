import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePageTitle } from '../lib/documentMeta'
import { getCompanyShifts, saveCompanyShiftData } from '../lib/shifts'
import { getScopedCompanies, loadRegisteredCompanies } from '../lib/companies'

// Shift Schedules — define shifts per company and assign them to employees.
export default function ShiftSchedules() {
  usePageTitle('Shift Schedules')
  const { user } = useAuth()
  const companies = user?.companyName ? getScopedCompanies(user) : loadRegisteredCompanies()

  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [data, setData] = useState({ shifts: [], assignments: {} })
  const [loading, setLoading] = useState(true)
  const [newShift, setNewShift] = useState({ name: '', start: '08:00', end: '17:00' })

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
    alert('Shift schedules saved.')
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
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold tabular-nums text-brand-700 ring-1 ring-brand-200">{s.start} – {s.end}</span>
              <button type="button" onClick={() => removeShift(s.id)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Delete shift">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
          {(data.shifts || []).length === 0 && (
            <p className="py-4 text-center text-xs text-gray-400">No shifts defined yet.</p>
          )}
        </div>

        <div className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-[1fr_auto_auto_auto]">
          <input value={newShift.name} onChange={(e) => setNewShift({ ...newShift, name: e.target.value })} placeholder="Shift name (e.g. Morning)" aria-label="Shift name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <input type="time" value={newShift.start} onChange={(e) => setNewShift({ ...newShift, start: e.target.value })} aria-label="Start time" className="rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none" />
          <input type="time" value={newShift.end} onChange={(e) => setNewShift({ ...newShift, end: e.target.value })} aria-label="End time" className="rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none" />
          <button type="button" onClick={addShift} disabled={!newShift.name.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-40">
            Add shift
          </button>
        </div>
      </section>

      {/* Assignments */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">Employee assignment</h2>
          <p className="text-xs text-gray-400">Assign a shift to each team member.</p>
        </div>
        <ul className="divide-y divide-gray-100">
          {(company?.employees || []).map((emp) => (
            <li key={emp.email} className="flex flex-wrap items-center gap-3 px-6 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                <p className="text-xs text-gray-400">{emp.email}</p>
              </div>
              <select
                value={(data.assignments || {})[emp.email] || ''}
                onChange={(e) => assign(emp.email, e.target.value)}
                aria-label={`Shift for ${emp.name}`}
                className="w-44 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="">No shift</option>
                {(data.shifts || []).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end})</option>)}
              </select>
            </li>
          ))}
          {(company?.employees || []).length === 0 && (
            <li className="px-6 py-8 text-center text-xs text-gray-400">No employees in this company yet.</li>
          )}
        </ul>
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={save} className="rounded-xl bg-brand-600 px-8 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-700">
          Save schedules
        </button>
      </div>
    </div>
  )
}
