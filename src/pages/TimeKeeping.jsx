import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSystemTimeZone } from '../lib/systemSettings'
import { api, apiEnabled } from '../lib/api'

function currentWeek() {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
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

// CEO view — no clock in/out; shows the employees' timesheet with a real-time clock
// synced to the time zone configured in System Settings.
function CeoTimeKeeping() {
  const { user } = useAuth()
  const [now, setNow] = useState(new Date())
  const [view, setView] = useState('week')
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

  // Get today's attendance for each employee
  const todayStr = now.toDateString()
  const getTodayPunches = (email) => attendance.filter((p) => p.email === email && new Date(p.time).toDateString() === todayStr)
  const getLastPunch = (email) => {
    const today = getTodayPunches(email)
    return today.length > 0 ? today[today.length - 1] : null
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
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {['day', 'week', 'month'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${view === v ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
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
                const todayPunches = getTodayPunches(emp.email)
                const lastPunch = getLastPunch(emp.email)
                const clockIn = todayPunches.find((p) => p.type === 'in')
                const clockOut = todayPunches.find((p) => p.type === 'out')
                const status = lastPunch?.type === 'in' ? 'Clocked in' : clockOut ? 'Clocked out' : 'No record today'
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
                      {clockIn ? new Date(clockIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-6 py-3 tabular-nums text-gray-700">
                      {clockOut ? new Date(clockOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
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
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3 text-sm">
          <span className="text-gray-500">Today's attendance</span>
          <span className="font-semibold text-gray-900">{employees.filter((e) => getLastPunch(e.email)?.type === 'in').length} currently clocked in</span>
        </div>
      </div>
    </div>
  )
}

export default function TimeKeeping() {
  usePageTitle('Time Keeping')
  const { user } = useAuth()
  const [view, setView] = useState('week')
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
  const todayPunches = myPunches.filter((p) => new Date(p.time).toDateString() === new Date().toDateString())

  const totalHours = week.reduce((s, d) => s + d.hours, 0)
  const totalOT = week.reduce((s, d) => s + d.ot, 0)

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
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {['day', 'week', 'month'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${view === v ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
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
              {week.map((d) => (
                <tr key={d.day} className={d.status === 'In progress' ? 'bg-brand-50/60' : 'hover:bg-gray-50'}>
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
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3 text-sm">
          <span className="text-gray-500">Weekly totals</span>
          <span className="font-semibold text-gray-900">{totalHours.toFixed(1)}h regular · {totalOT.toFixed(1)}h overtime</span>
        </div>
      </div>
    </div>
  )
}
