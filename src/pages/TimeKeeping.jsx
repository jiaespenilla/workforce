import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSystemTimeZone } from '../lib/systemSettings'
import { api, apiEnabled } from '../lib/api'

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x }
function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x }
function startOfWeek(d) { const x = new Date(d); x.setDate(d.getDate() - ((d.getDay()+6)%7)); x.setHours(0,0,0,0); return x }
function startOfMonth(d) { const x = new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x }

function currentWeek() {
  const now = new Date()
  const monday = startOfWeek(now)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const isPast = d.toDateString() !== now.toDateString() && d < now
    return {
      day: d.toLocaleDateString([], { weekday: 'short' }),
      date: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      in: null,
      out: null,
      hours: 0,
      ot: 0,
      status: isPast ? 'Missed' : d.toDateString() === now.toDateString() ? 'In progress' : 'Upcoming',
    }
  })
}

function systemDateKey(timeStr) {
  try { return new Date(timeStr).toLocaleDateString('en-CA', { timeZone: getSystemTimeZone() }) } catch { return new Date(timeStr).toDateString() }
}
function systemTodayKey() { return new Date().toLocaleDateString('en-CA', { timeZone: getSystemTimeZone() }) }

function inRange(timeStr, view) {
  const t = new Date(timeStr).getTime()
  const now = Date.now()
  if (view === 'day') return t >= startOfDay(new Date()).getTime() && t <= endOfDay(new Date()).getTime()
  if (view === 'week') return t >= startOfWeek(new Date()).getTime()
  if (view === 'month') return t >= startOfMonth(new Date()).getTime()
  return true
}

function hoursForDay(punchesForDay) {
  const sorted = [...punchesForDay].sort((a,b)=> new Date(a.time)-new Date(b.time))
  let total = 0
  let lastIn = null
  for (const p of sorted) {
    if (p.type === 'in') lastIn = new Date(p.time)
    else if (p.type === 'out' && lastIn) { total += new Date(p.time) - lastIn; lastIn = null }
  }
  return total / 3600000
}

// CEO view — no clock in/out; shows the employees' timesheet with a real-time clock
// synced to the time zone configured in System Settings.
function CeoTimeKeeping() {
  const { user } = useAuth()
  const [now, setNow] = useState(new Date())
  const [view, setView] = useState('week')
  const [layout, setLayout] = useState('table')
  const [selectedDate, setSelectedDate] = useState(null)
  const [attendance, setAttendance] = useState([])
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (apiEnabled()) {
      api('/api/attendance').then(setAttendance).catch(() => setAttendance([]))
    }
  }, [])

  const tz = getSystemTimeZone()
  const [allEmployees, setAllEmployees] = useState([])
  useEffect(() => {
    api('/api/companies')
      .then((cs) => setAllEmployees(cs.flatMap((c) => c.employees.map((e) => ({ ...e, companyName: c.name, companyId: c.id })))))
      .catch(() => setAllEmployees([]))
  }, [])
  const employees = allEmployees.filter((e) => e.active !== false)

  const getViewPunches = (email) => attendance.filter((p) => p.email === email && inRange(p.time, view))
  const getTodayPunches = (email) => attendance.filter((p) => p.email === email && systemDateKey(p.time) === systemTodayKey())
  const getLastPunch = (email) => {
    const list = getViewPunches(email).sort((a,b)=> new Date(a.time)-new Date(b.time))
    return list.length > 0 ? list[list.length - 1] : null
  }

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
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-gray-900">Employee Timesheet ({employees.length} active)</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {['day', 'week', 'month'].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${view === v ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {[
                ['table','Table','M3 8h18M3 12h18M3 16h18'],
                ['calendar','Calendar','M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z'],
                ['compact','Compact','M4 6h16M4 10h16M4 14h10M4 18h10'],
              ].map(([k,label,icon])=> (
                <button key={k} onClick={()=>setLayout(k)} title={label} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${layout===k?'bg-white text-brand-700 shadow-sm ring-1 ring-gray-200':'text-gray-500 hover:text-gray-700'}`}>
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
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Company</th>
                <th className="px-6 py-3">Clock In</th>
                <th className="px-6 py-3">Clock Out</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((emp) => {
                const viewPunches = getViewPunches(emp.email).sort((a,b)=> new Date(a.time)-new Date(b.time))
                const todayPunches = view === 'day' ? viewPunches : viewPunches
                const lastPunch = viewPunches[viewPunches.length-1] || null
                const clockIn = viewPunches.find((p) => p.type === 'in')
                const clockOut = [...viewPunches].reverse().find((p) => p.type === 'out')
                const hrs = hoursForDay(viewPunches).toFixed(1)
                const status = view === 'day'
                  ? (lastPunch?.type === 'in' ? 'Clocked in' : clockOut ? 'Clocked out' : 'No record today')
                  : (viewPunches.length ? `${viewPunches.length} punches · ${hrs}h` : 'No records')
                const statusStyle = lastPunch?.type === 'in'
                  ? 'bg-brand-100 text-brand-700'
                  : clockOut ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-500'
                return (
                  <tr key={`${emp.companyId}-${emp.email}`} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-500">{emp.role}</p>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{emp.companyName}</td>
                    <td className="px-6 py-3 tabular-nums text-gray-700">
                      {clockIn ? new Date(clockIn.time).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                    </td>
                    <td className="px-6 py-3 tabular-nums text-gray-700">
                      {clockOut ? new Date(clockOut.time).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle}`}>{status}</span>
                    </td>
                  </tr>
                )
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-xs text-gray-500">No active employees yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>}
        {layout === 'calendar' && (
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d)=><div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {(() => {
                const first = startOfMonth(new Date())
                const blanks = Array.from({length: first.getDay()}, (_,i)=><div key={`b-${i}`} />)
                const days = Array.from({length: new Date(new Date().getFullYear(), new Date().getMonth()+1,0).getDate()}, (_,i)=>{
                  const d = new Date(new Date().getFullYear(), new Date().getMonth(), 1); d.setDate(i+1)
                  const key = d.toDateString()
                  const count = employees.filter((e)=> getViewPunches(e.email).some((p)=> systemDateKey(p.time)===systemDateKey(key))).length
                  const isToday = systemDateKey(key)===systemTodayKey()
                  return (
                    <button key={key} onClick={()=>setSelectedDate(key)} className={`rounded-lg border p-2 text-center hover:shadow-sm transition text-left ${count ? 'bg-brand-50 border-brand-200 hover:border-brand-300' : 'bg-gray-50 border-gray-100 hover:bg-white'} ${isToday ? 'ring-2 ring-brand-400' : ''}`}>
                      <p className="text-xs font-bold text-gray-900">{i+1}</p>
                      <p className="text-[11px] font-semibold text-brand-700">{count ? `${count} in` : '—'}</p>
                    </button>
                  )
                })
                return [...blanks, ...days]
              })()}
            </div>
            <p className="mt-3 text-center text-[11px] text-gray-400">Calendar shows how many employees clocked in each day this month.</p>
          </div>
        )}
        {layout === 'compact' && (
          <div className="divide-y divide-gray-100">
            {employees.map((emp)=>{
              const vp = getViewPunches(emp.email)
              const hrs = hoursForDay(vp).toFixed(1)
              const last = vp[vp.length-1]
              return (
                <div key={`${emp.companyId}-${emp.email}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{emp.name} <span className="text-xs text-gray-400">· {emp.companyName}</span></p>
                    <p className="text-xs text-gray-500">{vp.length} punches · {hrs}h · {last ? new Date(last.time).toLocaleDateString() : 'No record'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${last?.type==='in'?'bg-brand-100 text-brand-700':'bg-gray-100 text-gray-500'}`}>{last?.type==='in'?'In':'Out'}</span>
                </div>
              )
            })}
            {employees.length===0 && <p className="p-6 text-center text-xs text-gray-400">No active employees.</p>}
          </div>
        )}
        {selectedDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>setSelectedDate(null)}>
            <div className="absolute inset-0 bg-gray-900/50" />
            <div className="relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col" onClick={(e)=>e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{new Date(selectedDate).toLocaleDateString([], {weekday:'long', month:'long', day:'numeric', year:'numeric'})}</h3>
                  <p className="text-xs text-gray-500">{attendance.filter((p)=> systemDateKey(p.time)===systemDateKey(selectedDate)).length} punches · {[...new Set(attendance.filter((p)=> systemDateKey(p.time)===systemDateKey(selectedDate)).map((p)=>p.email))].length} employees</p>
                </div>
                <button onClick={()=>setSelectedDate(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="overflow-y-auto divide-y divide-gray-100 flex-1">
                {employees.map((emp)=>{
                  const dayPunches = attendance.filter((p)=> p.email===emp.email && systemDateKey(p.time)===systemDateKey(selectedDate)).sort((a,b)=> new Date(a.time)-new Date(b.time))
                  if (!dayPunches.length) return null
                  const firstIn = dayPunches.find((p)=>p.type==='in')
                  const lastOut = [...dayPunches].reverse().find((p)=>p.type==='out')
                  const hrs = hoursForDay(dayPunches).toFixed(1)
                  return (
                    <div key={emp.email} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{emp.name} <span className="text-xs text-gray-500">{emp.companyName}</span></p>
                        <p className="text-xs text-gray-500">{firstIn ? new Date(firstIn.time).toLocaleTimeString(): '—'} → {lastOut ? new Date(lastOut.time).toLocaleTimeString(): '—'} · {hrs}h</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${lastOut ? 'bg-gray-100 text-gray-600' : dayPunches[dayPunches.length-1]?.type==='in' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{dayPunches[dayPunches.length-1]?.type==='in'?'Clocked in':'Clocked out'}</span>
                    </div>
                  )
                })}
                {attendance.filter((p)=> systemDateKey(p.time)===systemDateKey(selectedDate)).length===0 && <p className="p-8 text-center text-sm text-gray-400">No punches for this day.</p>}
              </div>
              <div className="border-t border-gray-100 p-4 flex justify-end gap-2">
                <button onClick={()=>setSelectedDate(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Close</button>
                <button onClick={()=>{
                  const dayPunches = attendance.filter((p)=> systemDateKey(p.time)===systemDateKey(selectedDate))
                  const rows = employees.map((emp)=>{
                    const ps = dayPunches.filter((p)=>p.email===emp.email).sort((a,b)=> new Date(a.time)-new Date(b.time))
                    if (!ps.length) return null
                    const firstIn = ps.find((p)=>p.type==='in')
                    const lastOut = [...ps].reverse().find((p)=>p.type==='out')
                    const hrs = hoursForDay(ps).toFixed(1)
                    return `<tr><td>${emp.name}</td><td>${emp.companyName}</td><td>${firstIn? new Date(firstIn.time).toLocaleTimeString(): '—'}</td><td>${lastOut? new Date(lastOut.time).toLocaleTimeString(): '—'}</td><td>${hrs}h</td></tr>`
                  }).filter(Boolean).join('')
                  const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#ecfdf5}</style></head><body><h2>Attendance — ${selectedDate}</h2><p>${dayPunches.length} punches, ${new Set(dayPunches.map((p)=>p.email)).size} employees</p><table><thead><tr><th>Employee</th><th>Company</th><th>Clock In</th><th>Clock Out</th><th>Hours</th></tr></thead><tbody>${rows || '<tr><td colspan=5>No records</td></tr>'}</tbody></table></body></html>`
                  const win = window.open('', '_blank'); if(win){ win.document.write(html); win.document.close(); win.focus(); win.print() }
                }} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Export PDF</button>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3 text-sm">
          <span className="text-gray-500">{view === 'day' ? "Today's" : view === 'week' ? 'This week —' : 'This month —'} {employees.length} active</span>
          <span className="font-semibold text-gray-900">{employees.filter((e) => getLastPunch(e.email)?.type === 'in').length} currently clocked in · {employees.reduce((s,e)=> s + hoursForDay(getViewPunches(e.email)),0).toFixed(1)}h total</span>
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
  const [myPunches, setMyPunches] = useState([])
  const week = currentWeek()

  useEffect(() => {
    if (apiEnabled() && user?.email) {
      api(`/api/attendance?email=${encodeURIComponent(user.email)}`)
        .then((records) => setMyPunches(records.slice().reverse()))
        .catch(() => setMyPunches([]))
    } else {
      try {
        setMyPunches((JSON.parse(localStorage.getItem('uw_punches')) || [])
          .filter((p) => p.email === user?.email)
          .slice()
          .reverse())
      } catch {
        setMyPunches([])
      }
    }
  }, [user?.email])

  if (user?.role === 'ceo') {
    return <CeoTimeKeeping />
  }

  // Clock in/out happens only via the kiosk — this page shows a read-only
  // history of the signed-in user's kiosk punches.
  const lastPunch = myPunches[0] || null
  const isClockedIn = lastPunch?.type === 'in'
  const todayPunches = myPunches.filter((p) => systemDateKey(p.time) === systemTodayKey())

  const timesheetRows = (() => {
    // Group punches by date once (O(n)) so each day row is an O(1) lookup
    // instead of re-scanning the whole punch history per day (O(days*n)).
    const byDate = new Map()
    for (const p of myPunches) {
      const key = systemDateKey(p.time)
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key).push(p)
    }
    const punchesFor = (d) => byDate.get(systemDateKey(d)) || []
    if (view === 'day') {
      const d = new Date()
      const punches = punchesFor(d).slice().sort((a,b)=> new Date(a.time)-new Date(b.time))
      const firstIn = punches.find((p)=>p.type==='in')
      const lastOut = [...punches].reverse().find((p)=>p.type==='out')
      return [{
        day: d.toLocaleDateString([], { weekday: 'short' }),
        date: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        in: firstIn ? new Date(firstIn.time).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit'}) : null,
        out: lastOut ? new Date(lastOut.time).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit'}) : null,
        hours: hoursForDay(punches),
        ot: 0,
        status: punches.length ? (lastOut ? 'Complete' : 'In progress') : 'No record',
      }]
    }
    if (view === 'week') {
      const monday = startOfWeek(new Date())
      return Array.from({ length: 5 }, (_, i) => {
        const d = new Date(monday); d.setDate(monday.getDate()+i)
        const punches = punchesFor(d)
        const firstIn = punches.find((p)=>p.type==='in')
        const lastOut = [...punches].reverse().find((p)=>p.type==='out')
        const isToday = d.toDateString()===new Date().toDateString()
        return {
          day: d.toLocaleDateString([], { weekday:'short'}),
          date: d.toLocaleDateString([], { month:'short', day:'numeric'}),
          in: firstIn ? new Date(firstIn.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : null,
          out: lastOut ? new Date(lastOut.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : null,
          hours: hoursForDay(punches),
          ot: 0,
          status: punches.length ? (isToday && !lastOut ? 'In progress' : 'Complete') : (d < new Date() && !isToday ? 'Missed' : 'Upcoming'),
        }
      })
    }
    // month: last 30 days
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i)); d.setHours(0,0,0,0)
      const punches = punchesFor(d)
      const firstIn = punches.find((p)=>p.type==='in')
      const lastOut = [...punches].reverse().find((p)=>p.type==='out')
      return {
        day: d.toLocaleDateString([], { weekday:'short'}),
        date: d.toLocaleDateString([], { month:'short', day:'numeric'}),
        in: firstIn ? new Date(firstIn.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : null,
        out: lastOut ? new Date(lastOut.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : null,
        hours: hoursForDay(punches),
        ot: 0,
        status: punches.length ? 'Complete' : (d.toDateString()===new Date().toDateString() ? 'In progress' : d < new Date() ? 'Missed' : 'Upcoming'),
      }
    })
  })()

  const totalHours = timesheetRows.reduce((s, d) => s + d.hours, 0)
  const totalOT = 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Time Keeping</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Your attendance records from kiosk punches.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`rounded-xl p-6 shadow-sm ${isClockedIn ? 'bg-gradient-to-br from-brand-600 to-emerald-500 text-white' : 'border border-gray-200 bg-white'}`}>
          <p className={`text-sm font-medium ${isClockedIn ? 'text-emerald-100' : 'text-gray-500'}`}>Current status</p>
          <p className={`mt-2 text-xl font-bold ${isClockedIn ? '' : 'text-gray-900'}`}>
            {isClockedIn ? `Clocked In · ${new Date(lastPunch.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : lastPunch ? 'Clocked Out' : 'Not clocked in today'}
          </p>
          <div className="mt-4 space-y-1 text-xs">
            {todayPunches.length === 0 && <li className={isClockedIn ? 'text-emerald-100/90' : 'text-gray-400'}>No punches yet today — use the kiosk to clock in.</li>}
            {todayPunches.map((p, i) => (
              <p key={i} className={isClockedIn || i % 2 === 0 ? 'text-emerald-50/90' : 'text-gray-500'}>
                {p.type === 'in' ? 'Clock In' : 'Clock Out'}:{' '}
                <span className="font-semibold tabular-nums">{new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:content-start">
          {[
            ['Clock in/out', isClockedIn ? 'Clocked In' : 'Clocked Out', lastPunch ? new Date(lastPunch.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No punches yet'],
            ['Today\'s punches', String(todayPunches.length), 'total scans'],
            ['Status', isClockedIn ? 'Active' : 'Off duty', isClockedIn ? 'Working now' : 'Use kiosk to clock in'],
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
          <h2 className="text-base font-semibold text-gray-900">Timesheet</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {['day', 'week', 'month'].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${view === v ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {[
                ['table','Table','M3 8h18M3 12h18M3 16h18'],
                ['calendar','Calendar','M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z'],
                ['compact','Compact','M4 6h16M4 10h16M4 14h10M4 18h10'],
              ].map(([k,label,icon])=> (
                <button key={k} onClick={()=>setLayout(k)} title={label} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${layout===k?'bg-white text-brand-700 shadow-sm ring-1 ring-gray-200':'text-gray-500 hover:text-gray-700'}`}>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {layout === 'table' && <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3">Day</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Clock In</th>
                <th className="px-6 py-3">Clock Out</th>
                <th className="px-6 py-3">Hours</th>
                <th className="px-6 py-3">Overtime</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {timesheetRows.map((d, idx) => (
                <tr key={`${d.day}-${d.date}-${idx}`} className={d.status === 'In progress' ? 'bg-brand-50/60' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-3 font-medium text-gray-900">{d.day}</td>
                  <td className="px-6 py-3 text-gray-600">{d.date}</td>
                  <td className="px-6 py-3 tabular-nums text-gray-700">{d.in ?? '—'}</td>
                  <td className="px-6 py-3 tabular-nums text-gray-700">{d.out ?? '—'}</td>
                  <td className="px-6 py-3 tabular-nums text-gray-700">{d.hours ? d.hours.toFixed(1) : '—'}</td>
                  <td className="px-6 py-3 tabular-nums text-gray-700">{d.ot ? `+${d.ot}` : '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      d.status === 'Complete' ? 'bg-brand-100 text-brand-700'
                      : d.status === 'In progress' ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-500'
                    }`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
        {layout === 'calendar' && (
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d)=><div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {(() => {
                // Group punches by date once (O(n)) — each calendar cell then
                // does an O(1) lookup instead of scanning the full history.
                const byDate = new Map()
                for (const p of myPunches) {
                  const key = systemDateKey(p.time)
                  if (!byDate.has(key)) byDate.set(key, [])
                  byDate.get(key).push(p)
                }
                const first = startOfMonth(new Date())
                const startDay = first.getDay()
                const blanks = Array.from({length: startDay}, (_,i)=><div key={`b-${i}`} />)
                const days = Array.from({length: new Date(new Date().getFullYear(), new Date().getMonth()+1,0).getDate()}, (_,i)=>{
                  const d = new Date(new Date().getFullYear(), new Date().getMonth(), 1); d.setDate(i+1)
                  const key = d.toDateString()
                  const punches = byDate.get(systemDateKey(key)) || []
                  const hrs = hoursForDay(punches)
                  const hasPunch = punches.length>0
                  const isToday = systemDateKey(key)===systemTodayKey()
                  const firstIn = punches.find((p)=>p.type==='in')
                  const lastOut = [...punches].reverse().find((p)=>p.type==='out')
                  return (
                    <div key={key} className={`rounded-lg border p-2 text-left ${hasPunch ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-100'} ${isToday ? 'ring-2 ring-brand-400' : ''}`}>
                      <p className="text-xs font-bold text-gray-900">{i+1}</p>
                      {hasPunch ? (
                        <>
                          <p className="mt-1 text-[10px] leading-tight text-gray-600">{firstIn ? new Date(firstIn.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—'} → {lastOut ? new Date(lastOut.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—'}</p>
                          <p className="text-[11px] font-semibold text-brand-700">{hrs.toFixed(1)}h</p>
                        </>
                      ) : <p className="mt-1 text-[10px] text-gray-400">—</p>}
                    </div>
                  )
                })
                return [...blanks, ...days]
              })()}
            </div>
          </div>
        )}
        {layout === 'compact' && (
          <div className="divide-y divide-gray-100">
            {timesheetRows.map((d,idx)=>(
              <div key={`${d.day}-${idx}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ${d.hours? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{d.day.slice(0,2)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.day} · {d.date}</p>
                    <p className="text-xs text-gray-500">{d.in || '—'} → {d.out || '—'} · {d.hours ? `${d.hours.toFixed(1)}h` : 'No hours'}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${d.status==='Complete'?'bg-brand-100 text-brand-700': d.status==='In progress'?'bg-amber-100 text-amber-700':'bg-gray-100 text-gray-500'}`}>{d.status}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3 text-sm">
          <span className="text-gray-500">{view === 'day' ? 'Daily total' : view === 'week' ? 'Weekly total' : 'Monthly total'}</span>
          <span className="font-semibold text-gray-900">{totalHours.toFixed(1)}h regular · {totalOT.toFixed(1)}h overtime</span>
        </div>
      </div>
    </div>
  )
}
