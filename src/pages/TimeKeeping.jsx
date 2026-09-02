import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getSystemTimeZone } from '../lib/systemSettings'
import { getCompanyShifts } from '../lib/shifts'
import { api, apiEnabled } from '../lib/api'

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }
function startOfWeek(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() }
function sameDay(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }

// Punch timestamps are stored as UTC ISO strings — this returns the calendar
// date in the time zone configured in System Settings so days line up with
// the time zone the company actually works in.
function systemDateKey(timeStr) {
  try { return new Date(timeStr).toLocaleDateString('en-CA', { timeZone: getSystemTimeZone() }) } catch { return new Date(timeStr).toDateString() }
}
function systemTodayKey() { return new Date().toLocaleDateString('en-CA', { timeZone: getSystemTimeZone() }) }

// Is a punch inside the viewed window (anchor date + day/week/month view)?
function inRange(timeStr, anchor, view) {
  const t = new Date(timeStr).getTime()
  if (view === 'day') return t >= startOfDay(anchor).getTime() && t <= endOfDay(anchor).getTime()
  if (view === 'week') {
    const monday = startOfWeek(anchor)
    return t >= monday.getTime() && t <= endOfDay(addDays(monday, 6)).getTime()
  }
  if (view === 'month') {
    return t >= startOfMonth(anchor).getTime() && t <= endOfDay(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)).getTime()
  }
  return true
}

// Every calendar day in the viewed window (used by the on-time/late summaries).
function windowDays(anchor, view) {
  if (view === 'day') return [startOfDay(anchor)]
  if (view === 'week') {
    const monday = startOfWeek(anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  }
  const first = startOfMonth(anchor)
  return Array.from({ length: daysInMonth(anchor) }, (_, i) => addDays(first, i))
}

// Time-of-day (in the system time zone), in minutes past midnight.
export function timeInMinutes(timeStr) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: getSystemTimeZone() }).formatToParts(new Date(timeStr))
    const get = (t) => Number((parts.find((p) => p.type === t) || {}).value)
    return get('hour') * 60 + get('minute')
  } catch { return null }
}

function fmtClock(timeStr) {
  try { return new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: getSystemTimeZone() }) } catch { return '—' }
}

function fmtStamp(timeStr) {
  try { return new Date(timeStr).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: getSystemTimeZone() }) } catch { return '—' }
}

// Regular hours from in/out punch pairs (duration is time-zone independent).
export function hoursForDay(punchesForDay) {
  const sorted = [...punchesForDay].sort((a, b) => new Date(a.time) - new Date(b.time))
  let total = 0
  let lastIn = null
  for (const p of sorted) {
    if (p.type === 'in') lastIn = new Date(p.time)
    else if (p.type === 'out' && lastIn) { total += new Date(p.time) - lastIn; lastIn = null }
  }
  return total / 3600000
}

// Overtime hours for a day. The punch records whether a clock-out was an
// overtime session (past the shift end + grace); the WHOLE clocked-out
// session counts as OT — both for timed shifts and open shifts (whose
// "end" is clock-in + 8h + grace). Legacy rows without the flag fall back
// to the boolean clock-out flag (whole flagged session counts) so history
// is preserved.
export function overtimeForDay(punchesForDay) {
  const sorted = [...punchesForDay].sort((a, b) => new Date(a.time) - new Date(b.time))
  if (sorted.some((p) => p.overtime_minutes !== undefined)) {
    const minutes = sorted.reduce((s, p) => s + (Number(p.overtime_minutes) || 0), 0)
    if (minutes > 0) return minutes / 60
    // all rows have overtime_minutes but zero — fall through so a legacy
    // boolean-flagged (pre-column) punch still counts as before
  }
  let total = 0
  let lastIn = null
  for (const p of sorted) {
    if (p.type === 'in') lastIn = new Date(p.time)
    else if (p.type === 'out' && lastIn && p.overtime) { total += new Date(p.time) - lastIn; lastIn = null }
  }
  return total / 3600000
}

function toMinutes(t) {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  if (!Number.isFinite(h)) return null
  return h * 60 + (Number.isFinite(m) ? m : 0)
}

// The shift assigned to an employee by their company's shift schedule.
export function shiftForEmployee(shiftData, email) {
  if (!shiftData || !email) return null
  const sid = shiftData.assignments ? shiftData.assignments[email] : null
  if (!sid) return null
  return (shiftData.shifts || []).find((s) => s.id === sid) || null
}

// Human-readable per-day status compared against the assigned shift schedule.
// On time  = first clock-in is no later than the shift start time.
// Late     = first clock-in is after the shift start time.
// Missed   = a timed shift day is over with no clock-in.
export function dayStatus(punches, shift, { isToday, isPast } = {}) {
  if (!shift || shift.open) {
    if (punches.length) return { label: 'Present', cls: 'bg-brand-100 text-brand-700' }
    return { label: isToday ? 'Not yet' : isPast ? 'Absent' : 'Upcoming', cls: 'bg-gray-100 text-gray-500' }
  }
  if (!punches.length) {
    return { label: isToday ? 'Not yet' : isPast ? 'Missed' : 'Upcoming', cls: 'bg-gray-100 text-gray-500' }
  }
  const firstIn = punches.find((p) => p.type === 'in')
  if (!firstIn) return { label: 'No clock-in', cls: 'bg-amber-100 text-amber-700' }
  const start = toMinutes(shift.start)
  if (start == null) return { label: 'On time', cls: 'bg-brand-100 text-brand-700' }
  const inMins = timeInMinutes(firstIn.time)
  if (inMins != null && inMins > start) return { label: 'Late', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'On time', cls: 'bg-brand-100 text-brand-700' }
}

// Week/month summary chip for a whole window (CEO view).
export function summaryStatus(allPunches, shift, anchor, view) {
  const byDate = new Map()
  for (const p of allPunches) {
    const k = systemDateKey(p.time)
    if (!byDate.has(k)) byDate.set(k, [])
    byDate.get(k).push(p)
  }
  let onTime = 0, late = 0, present = 0, missed = 0
  const today = new Date()
  for (const d of windowDays(anchor, view)) {
    const punches = byDate.get(systemDateKey(d)) || []
    const st = dayStatus(punches, shift, {
      isToday: sameDay(d, today),
      isPast: d.getTime() < startOfDay(today).getTime(),
    })
    if (st.label === 'On time') onTime++
    else if (st.label === 'Late') late++
    else if (st.label === 'Missed' || st.label === 'Absent') missed++
    if (punches.length) present++
  }
  if (!present) return { label: missed ? `${missed} missed` : 'No punches', cls: 'bg-gray-100 text-gray-500' }
  if (shift && !shift.open) {
    return { label: `${onTime} on time · ${late} late`, cls: late > onTime ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700' }
  }
  return { label: `${present} present`, cls: 'bg-brand-100 text-brand-700' }
}

function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Previous / Today / Next buttons + a date picker — lets users browse any date.
function PeriodNavigator({ anchor, view, onAnchor }) {
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 30
  const now = new Date()
  const isCurrent = view === 'day' ? sameDay(anchor, now)
    : view === 'week' ? sameDay(startOfWeek(anchor), startOfWeek(now))
    : anchor.getMonth() === now.getMonth() && anchor.getFullYear() === now.getFullYear()
  const label = view === 'day'
    ? anchor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : view === 'week'
      ? `Week of ${startOfWeek(anchor).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
      : anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })
  const navBtn = 'inline-flex items-center rounded-md px-2.5 py-1.5 text-sm text-gray-600 transition hover:bg-white hover:text-gray-900'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button onClick={() => onAnchor(addDays(anchor, -step))} className={navBtn} title="Previous">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={() => onAnchor(new Date())} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${isCurrent ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}>
          Today
        </button>
        <button onClick={() => onAnchor(addDays(anchor, step))} className={navBtn} title="Next">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <input
        type="date"
        value={toInputDate(anchor)}
        onChange={(e) => {
          if (!e.target.value) return
          const [y, m, d] = e.target.value.split('-').map(Number)
          onAnchor(new Date(y, m - 1, d))
        }}
        aria-label="Jump to date"
        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none"
      />
      <span className="hidden text-sm font-semibold text-gray-700 sm:inline">{label}</span>
    </div>
  )
}

// CEO / manager view — company employees' timesheets with a live clock,
// date navigation, and on-time / late status per assigned shift schedule.
function CeoTimeKeeping() {
  const [now, setNow] = useState(new Date())
  const [view, setView] = useState('week')
  const [layout, setLayout] = useState('table')
  const [cursor, setCursor] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [allEmployees, setAllEmployees] = useState([])
  const [shiftsByCompany, setShiftsByCompany] = useState({})
  const [refreshing, setRefreshing] = useState(false)

  const tz = getSystemTimeZone()

  const reload = async () => {
    setRefreshing(true)
    const [att, cs] = await Promise.all([
      apiEnabled() ? api('/api/attendance').catch(() => []) : Promise.resolve([]),
      apiEnabled() ? api('/api/companies').catch(() => []) : Promise.resolve([]),
    ])
    const attList = Array.isArray(att) ? att : (att.data || [])
    const comps = Array.isArray(cs) ? cs : (cs.data || [])
    setAttendance(attList)
    setAllEmployees(comps.flatMap((c) => c.employees.map((e) => ({ ...e, companyName: c.name, companyId: c.id }))))
    setRefreshing(false)
  }

  useEffect(() => { reload() }, [])
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load every company's shift schedule so on-time/late is accurate per employee.
  useEffect(() => {
    if (!allEmployees.length) return
    const companyIds = [...new Set(allEmployees.map((e) => e.companyId))]
    let cancelled = false
    Promise.all(companyIds.map(async (id) => [id, await getCompanyShifts(id)]))
      .then((entries) => { if (!cancelled) setShiftsByCompany(Object.fromEntries(entries)) })
    return () => { cancelled = true }
  }, [allEmployees])

  const employees = allEmployees.filter((e) => e.active !== false)

  // Pre-group punches so each render pass is O(n), not O(employees × punches).
  const windowedByEmail = new Map()
  const allByEmail = new Map()
  for (const p of attendance) {
    const all = allByEmail.get(p.email) || []
    all.push(p)
    allByEmail.set(p.email, all)
    if (inRange(p.time, cursor, view)) {
      const w = windowedByEmail.get(p.email) || []
      w.push(p)
      windowedByEmail.set(p.email, w)
    }
  }
  const windowed = (email) => { const list = windowedByEmail.get(email) || []; return [...list].sort((a, b) => new Date(a.time) - new Date(b.time)) }
  const allFor = (email) => allByEmail.get(email) || []
  const todayKey = systemTodayKey()
  const liveCount = employees.filter((e) => {
    const todays = allFor(e.email).filter((p) => systemDateKey(p.time) === todayKey).sort((a, b) => new Date(a.time) - new Date(b.time))
    const last = todays[todays.length - 1]
    return last && last.type === 'in'
  }).length

  const tabs = (kind) => kind === 'period'
    ? (['day', 'week', 'month'].map((v) => (
        <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${view === v ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          {v}
        </button>
      )))
    : ([
        ['table', 'Table', 'M3 8h18M3 12h18M3 16h18'],
        ['calendar', 'Calendar', 'M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z'],
        ['compact', 'Compact', 'M4 6h16M4 10h16M4 14h10M4 18h10'],
      ].map(([k, label, icon]) => (
        <button key={k} onClick={() => setLayout(k)} title={label} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${layout === k ? 'bg-white text-brand-700 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
          <span className="hidden sm:inline">{label}</span>
        </button>
      )))

return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Time Keeping</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Employee attendance overview.</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums text-gray-900">
            {now.toLocaleTimeString([], { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-xs text-gray-500">
            {now.toLocaleDateString([], { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {tz}
          </p>
          <button onClick={reload} disabled={refreshing} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:text-gray-900">
            <svg className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.2-3.3M4 15a8 8 0 0014.2 3.3" /></svg>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Employee Timesheet ({employees.length} active)</h2>
            <p className="mt-0.5 text-xs text-gray-500">On-time / late is compared against each employee's assigned shift schedule.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodNavigator anchor={cursor} view={view} onAnchor={setCursor} />
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">{tabs('period')}</div>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">{tabs('layout')}</div>
          </div>
        </div>

{layout === 'table' && <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Company</th>
                <th className="px-6 py-3">Clock In</th>
                <th className="px-6 py-3">Clock Out</th>
                <th className="px-6 py-3">Hours</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((emp) => {
                const vp = windowed(emp.email)
                const shift = shiftForEmployee(shiftsByCompany[emp.companyId], emp.email)
                const lastPunch = vp[vp.length - 1] || null
                const clockIn = vp.find((p) => p.type === 'in')
                const clockOut = [...vp].reverse().find((p) => p.type === 'out')
                const hrs = hoursForDay(vp)
                const isToday = sameDay(cursor, new Date())
                const st = view === 'day'
                  ? dayStatus(vp, shift, { isToday, isPast: cursor.getTime() < startOfDay(new Date()).getTime() })
                  : summaryStatus(allFor(emp.email), shift, cursor, view)
                const isLive = isToday && lastPunch?.type === 'in'
                return (
                  <tr key={`${emp.companyId}-${emp.email}`} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-500">{emp.role || 'Unassigned'}</p>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{emp.companyName}</td>
                    <td className="px-6 py-3 tabular-nums text-gray-700">{clockIn ? fmtStamp(clockIn.time) : '—'}</td>
                    <td className="px-6 py-3 tabular-nums text-gray-700">{clockOut ? fmtStamp(clockOut.time) : '—'}</td>
                    <td className="px-6 py-3 tabular-nums text-gray-700">{hrs ? `${hrs.toFixed(1)}h` : '—'}</td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                        {isLive && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                            Clocked in · {fmtClock(lastPunch.time)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-gray-400">No active employees found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>}

{layout === 'calendar' && (
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {(() => {
                const byDate = new Map()
                for (const p of attendance) {
                  const key = systemDateKey(p.time)
                  if (!byDate.has(key)) byDate.set(key, [])
                  byDate.get(key).push(p)
                }
                const first = startOfMonth(cursor)
                const blanks = Array.from({ length: first.getDay() }, (_, i) => <div key={`b-${i}`} />)
                const days = Array.from({ length: daysInMonth(cursor) }, (_, i) => {
                  const d = addDays(first, i)
                  const key = systemDateKey(d)
                  const punches = byDate.get(key) || []
                  const count = new Set(punches.map((p) => p.email)).size
                  const isToday = sameDay(d, new Date())
                  return (
                    <button key={key} onClick={() => setSelectedDate(key)} className={`rounded-lg border p-2 text-center transition hover:shadow-sm ${count ? 'bg-brand-50 border-brand-200 hover:border-brand-300' : 'bg-gray-50 border-gray-100 hover:bg-white'} ${isToday ? 'ring-2 ring-brand-400' : ''}`}>
                      <p className="text-xs font-bold text-gray-900">{i + 1}</p>
                      <p className={`text-[11px] font-semibold ${count ? 'text-brand-700' : 'text-gray-400'}`}>{count ? `${count} in` : '—'}</p>
                    </button>
                  )
                })
                return [...blanks, ...days]
              })()}
            </div>
            <p className="mt-3 text-center text-[11px] text-gray-400">Calendar shows how many employees clocked in each day in {cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}.</p>
          </div>
        )}
        {layout === 'compact' && (
          <div className="divide-y divide-gray-100">
            {employees.map((emp) => {
              const vp = windowed(emp.email)
              const shift = shiftForEmployee(shiftsByCompany[emp.companyId], emp.email)
              const hrs = hoursForDay(vp).toFixed(1)
              const last = vp[vp.length - 1]
              const st = view === 'day'
                ? dayStatus(vp, shift, { isToday: sameDay(cursor, new Date()), isPast: cursor.getTime() < startOfDay(new Date()).getTime() })
                : summaryStatus(allFor(emp.email), shift, cursor, view)
              return (
                <div key={`${emp.companyId}-${emp.email}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{emp.name} <span className="text-xs text-gray-400">· {emp.companyName}</span></p>
                    <p className="text-xs text-gray-500">{vp.length} punches · {hrs}h · {last ? new Date(last.time).toLocaleDateString() : 'No record'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
              )
            })}
            {employees.length === 0 && <p className="p-6 text-center text-xs text-gray-400">No active employees.</p>}
          </div>
        )}

{selectedDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedDate(null)}>
            <div className="absolute inset-0 bg-gray-900/50" />
            <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{new Date(selectedDate).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>
                  <p className="text-xs text-gray-500">{attendance.filter((p) => systemDateKey(p.time) === selectedDate).length} punches · {new Set(attendance.filter((p) => systemDateKey(p.time) === selectedDate).map((p) => p.email)).size} employees</p>
                </div>
                <button onClick={() => setSelectedDate(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="flex-1 divide-y divide-gray-100 overflow-y-auto">
                {employees.map((emp) => {
                  const dayPunches = attendance.filter((p) => p.email === emp.email && systemDateKey(p.time) === selectedDate).sort((a, b) => new Date(a.time) - new Date(b.time))
                  if (!dayPunches.length) return null
                  const firstIn = dayPunches.find((p) => p.type === 'in')
                  const lastOut = [...dayPunches].reverse().find((p) => p.type === 'out')
                  const hrs = hoursForDay(dayPunches)
                  const shift = shiftForEmployee(shiftsByCompany[emp.companyId], emp.email)
                  const st = dayStatus(dayPunches, shift, { isToday: sameDay(new Date(selectedDate), new Date()), isPast: new Date(selectedDate).getTime() < startOfDay(new Date()).getTime() })
                  return (
                    <div key={`${emp.companyId}-${emp.email}`} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{emp.name} <span className="text-xs text-gray-400">· {emp.companyName}</span></p>
                        <p className="text-xs text-gray-500 tabular-nums">{firstIn ? fmtClock(firstIn.time) : '—'} → {lastOut ? fmtClock(lastOut.time) : '—'} · {hrs.toFixed(1)}h</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                  )
                })}
                {employees.every((emp) => attendance.filter((p) => p.email === emp.email && systemDateKey(p.time) === selectedDate).length === 0) && (
                  <p className="p-6 text-center text-xs text-gray-400">No records for this day.</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
                <button onClick={() => setSelectedDate(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Close</button>
                <button onClick={() => {
                  const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
                  const dayRows = attendance.filter((p) => systemDateKey(p.time) === selectedDate)
                  const rows = employees.map((emp) => {
                    const ps = dayRows.filter((p) => p.email === emp.email).sort((a, b) => new Date(a.time) - new Date(b.time))
                    if (!ps.length) return null
                    const firstIn = ps.find((p) => p.type === 'in')
                    const shift = shiftForEmployee(shiftsByCompany[emp.companyId], emp.email)
                    const st = dayStatus(ps, shift, { isToday: false, isPast: true })
                    return `<tr><td>${esc(emp.name)}</td><td>${esc(emp.companyName)}</td><td>${firstIn ? esc(fmtClock(firstIn.time)) : '—'}</td><td>${esc(hoursForDay(ps).toFixed(1))}h</td><td>${esc(st.label)}</td></tr>`
                  }).filter(Boolean).join('')
                  const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#ecfdf5}</style></head><body><h2>Attendance — ${esc(selectedDate)}</h2><p>${dayRows.length} punches, ${new Set(dayRows.map((p) => p.email)).size} employees</p><table><thead><tr><th>Employee</th><th>Company</th><th>Clock In</th><th>Hours</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan=5>No records</td></tr>'}</tbody></table></body></html>`
                  const win = window.open('', '_blank'); if (win) { win.document.write(html); win.document.close(); win.focus(); win.print() }
                }} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Export PDF</button>
              </div>
            </div>
          </div>
        )}

<div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3 text-sm">
          <span className="text-gray-500">
            {view === 'day'
              ? cursor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
              : view === 'week'
                ? `Week of ${startOfWeek(cursor).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                : cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}
            {' · '}{employees.length} active
          </span>
          <span className="font-semibold text-gray-900">
            {sameDay(cursor, new Date()) && `${liveCount} currently clocked in · `}
            {employees.reduce((s, e) => s + hoursForDay(windowed(e.email)), 0).toFixed(1)}h total
          </span>
        </div>
      </div>
    </div>
  )
}

export default function TimeKeeping() {
  usePageTitle('Time Keeping')
  const { user } = useAuth()
  const [view, setView] = useState('week')
  const [layout, setLayout] = useState('table')
  const [cursor, setCursor] = useState(new Date())
  const [myPunches, setMyPunches] = useState([])
  const [shiftData, setShiftData] = useState({ shifts: [], assignments: {} })
  const [companyId, setCompanyId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const reload = async () => {
    if (!user?.email) return
    setRefreshing(true)
    const [records, companies] = await Promise.all([
      apiEnabled() ? api(`/api/attendance?email=${encodeURIComponent(user.email)}`).catch(() => []) : Promise.resolve([]),
      apiEnabled() ? api('/api/companies').catch(() => []) : Promise.resolve([]),
    ])
    const list = Array.isArray(records) ? records : (records.data || [])
    const comps = Array.isArray(companies) ? companies : (companies.data || [])
    setMyPunches(list.slice().reverse())
    const own = comps.find((c) => (c.employees || []).some((e) => (e.email || '').toLowerCase() === (user.email || '').toLowerCase()))
    setCompanyId(own?.id || comps[0]?.id || null)
    setRefreshing(false)
  }

  useEffect(() => { reload() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [user?.email])

  // Load this user's company shift schedule so on-time/late is accurately compared.
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    getCompanyShifts(companyId).then((d) => { if (!cancelled) setShiftData(d && d.shifts ? d : { shifts: [], assignments: {} }) })
    return () => { cancelled = true }
  }, [companyId])

  if (user?.role === 'ceo') return <CeoTimeKeeping />

  const shift = shiftForEmployee(shiftData, user?.email)
  const lastPunch = myPunches[0] || null
  const isClockedIn = lastPunch?.type === 'in' && systemDateKey(lastPunch.time) === systemTodayKey()
  const todayPunches = myPunches.filter((p) => systemDateKey(p.time) === systemTodayKey())
  const todayHours = hoursForDay(todayPunches)

  const timesheetRows = (() => {
    const byDate = new Map()
    for (const p of myPunches) {
      const k = systemDateKey(p.time)
      if (!byDate.has(k)) byDate.set(k, [])
      byDate.get(k).push(p)
    }
    const punchesFor = (d) => (byDate.get(systemDateKey(d)) || []).slice().sort((a, b) => new Date(a.time) - new Date(b.time))
    const today = new Date()
    return windowDays(cursor, view).map((d) => {
      const punches = punchesFor(d)
      const firstIn = punches.find((p) => p.type === 'in')
      const lastOut = [...punches].reverse().find((p) => p.type === 'out')
      const st = dayStatus(punches, shift, {
        isToday: sameDay(d, today),
        isPast: d.getTime() < startOfDay(today).getTime(),
      })
      return {
        day: d.toLocaleDateString([], { weekday: 'short' }),
        date: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        isToday: sameDay(d, today),
        in: firstIn ? fmtClock(firstIn.time) : null,
        out: lastOut ? fmtClock(lastOut.time) : null,
        hours: hoursForDay(punches),
        ot: overtimeForDay(punches),
        status: st,
      }
    })
  })()

  const totalHours = timesheetRows.reduce((s, d) => s + d.hours, 0)
  const totalOT = timesheetRows.reduce((s, d) => s + d.ot, 0)

return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Time Keeping</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Your attendance records and on-time / late status.</p>
        </div>
        <button onClick={reload} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm hover:text-gray-900">
          <svg className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.2-3.3M4 15a8 8 0 0014.2 3.3" /></svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`rounded-xl p-6 shadow-sm ${isClockedIn ? 'bg-gradient-to-br from-brand-600 to-emerald-500 text-white' : 'border border-gray-200 bg-white'}`}>
          <p className={`text-sm font-medium ${isClockedIn ? 'text-emerald-100' : 'text-gray-500'}`}>Current status</p>
          <p className={`mt-2 text-xl font-bold ${isClockedIn ? '' : 'text-gray-900'}`}>
            {isClockedIn ? `Clocked In · ${fmtClock(lastPunch.time)}` : lastPunch ? 'Clocked Out' : 'Not clocked in today'}
          </p>
          <div className="mt-4 space-y-1 text-xs">
            {todayPunches.length === 0 && <p className={isClockedIn ? 'text-emerald-100/90' : 'text-gray-400'}>No punches yet today — use the kiosk to clock in.</p>}
            {todayPunches.map((p, i) => (
              <p key={i} className={isClockedIn || i % 2 === 0 ? 'text-emerald-50/90' : 'text-gray-500'}>
                {p.type === 'in' ? 'Clock In' : 'Clock Out'}: <span className="font-semibold tabular-nums">{fmtClock(p.time)}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:content-start">
          {[
            ['Clock in/out', isClockedIn ? 'Clocked In' : 'Clocked Out', lastPunch ? fmtClock(lastPunch.time) : 'No punches yet'],
            ["Today's punches", String(todayPunches.length), `${todayHours.toFixed(1)}h today`],
            ['Shift today', shift ? (shift.open ? 'Open shift' : `${shift.start}–${shift.end}`) : 'No shift assigned', shift ? (shift.open ? 'No fixed start time' : shift.name || '') : "Status won't compare to a shift"],
            ['Last action', lastPunch?.type === 'in' ? 'Clock In' : 'Clock Out', lastPunch ? new Date(lastPunch.time).toLocaleDateString() : '—'],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
              <p className="mt-0.5 text-xs text-gray-500">{sub}</p>
            </div>
          ))}
        </div>
      </div>

<div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Timesheet</h2>
            <p className="mt-0.5 text-xs text-gray-500">On-time / late is compared against your assigned shift. Use the arrows or date picker to view previous days.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodNavigator anchor={cursor} view={view} onAnchor={setCursor} />
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {['day', 'week', 'month'].map((v) => (
                <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${view === v ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                  {v}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {[
                ['table', 'Table', 'M3 8h18M3 12h18M3 16h18'],
                ['calendar', 'Calendar', 'M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z'],
                ['compact', 'Compact', 'M4 6h16M4 10h16M4 14h10M4 18h10'],
              ].map(([k, label, icon]) => (
                <button key={k} onClick={() => setLayout(k)} title={label} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${layout === k ? 'bg-white text-brand-700 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {layout === 'table' && <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3">Day</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Shift</th>
                <th className="px-6 py-3">Clock In</th>
                <th className="px-6 py-3">Clock Out</th>
                <th className="px-6 py-3">Hours</th>
                <th className="px-6 py-3">Overtime</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {timesheetRows.map((d, idx) => (
                <tr key={`${d.day}-${d.date}-${idx}`} className={d.isToday ? 'bg-brand-50/60' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-3 font-medium text-gray-900">{d.day}</td>
                  <td className="px-6 py-3 text-gray-600">{d.date}</td>
                  <td className="px-6 py-3 text-gray-600">{shift ? (shift.open ? 'Open' : shift.start) : '—'}</td>
                  <td className="px-6 py-3 tabular-nums text-gray-700">{d.in ?? '—'}</td>
                  <td className="px-6 py-3 tabular-nums text-gray-700">{d.out ?? '—'}</td>
                  <td className="px-6 py-3 tabular-nums text-gray-700">{d.hours ? d.hours.toFixed(1) : '—'}</td>
                  <td className="px-6 py-3 tabular-nums text-gray-700">{d.ot ? `+${d.ot.toFixed(1)}` : '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${d.status.cls}`}>{d.status.label}</span>
                  </td>
                </tr>
              ))}
              {timesheetRows.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-xs text-gray-400">No days in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>}

{layout === 'calendar' && (
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {(() => {
                const byDate = new Map()
                for (const p of myPunches) {
                  const key = systemDateKey(p.time)
                  if (!byDate.has(key)) byDate.set(key, [])
                  byDate.get(key).push(p)
                }
                const first = startOfMonth(cursor)
                const blanks = Array.from({ length: first.getDay() }, (_, i) => <div key={`b-${i}`} />)
                const days = Array.from({ length: daysInMonth(cursor) }, (_, i) => {
                  const d = addDays(first, i)
                  const key = systemDateKey(d)
                  const punches = byDate.get(key) || []
                  const hrs = hoursForDay(punches)
                  const st = dayStatus(punches, shift, { isToday: sameDay(d, new Date()), isPast: d.getTime() < startOfDay(new Date()).getTime() })
                  const hasPunch = punches.length > 0
                  const isToday = sameDay(d, new Date())
                  return (
                    <div key={key} className={`rounded-lg border p-2 text-left ${hasPunch ? (st.label === 'Late' ? 'bg-amber-50 border-amber-200' : 'bg-brand-50 border-brand-200') : 'bg-gray-50 border-gray-100'} ${isToday ? 'ring-2 ring-brand-400' : ''}`}>
                      <p className="text-xs font-bold text-gray-900">{i + 1}</p>
                      {hasPunch ? (
                        <>
                          <p className={`mt-1 text-[10px] font-semibold leading-tight ${st.cls}`}>{st.label}</p>
                          <p className="text-[11px] font-semibold text-brand-700 tabular-nums">{hrs.toFixed(1)}h</p>
                        </>
                      ) : <p className="mt-1 text-[10px] text-gray-400">{st.label}</p>}
                    </div>
                  )
                })
                return [...blanks, ...days]
              })()}
            </div>
            <p className="mt-3 text-center text-[11px] text-gray-400">{cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })} — use the arrows or date picker above to change the month.</p>
          </div>
        )}
        {layout === 'compact' && (
          <div className="divide-y divide-gray-100">
            {timesheetRows.map((d, idx) => (
              <div key={`${d.day}-${d.date}-${idx}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ${d.hours ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{d.day.slice(0, 2)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.day} · {d.date}</p>
                    <p className="text-xs text-gray-500">{d.in || '—'} → {d.out || '—'} · {d.hours ? `${d.hours.toFixed(1)}h` : 'No hours'}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${d.status.cls}`}>{d.status.label}</span>
              </div>
            ))}
            {timesheetRows.length === 0 && <p className="p-6 text-center text-xs text-gray-400">No days in this period.</p>}
          </div>
        )}

<div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3 text-sm">
          <span className="text-gray-500">
            {view === 'day' ? 'Daily' : view === 'week' ? 'Weekly' : 'Monthly'} total · {shift ? (shift.open ? 'Open shift' : `${shift.start}–${shift.end}`) : 'No shift assigned'}
          </span>
          <span className="font-semibold text-gray-900">{Math.max(0, totalHours - totalOT).toFixed(1)}h regular · {totalOT.toFixed(1)}h overtime</span>
        </div>
      </div>
    </div>
  )
}