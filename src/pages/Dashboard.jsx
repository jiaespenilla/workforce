import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const stats = [
  { label: 'Active Employees', value: '42', sub: '+3 this week', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 1.37a6 6 0 10-6-6 6 6 0 006 6z' },
  { label: 'Pending Approvals', value: '7', sub: '4 timesheets, 3 leaves', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: "Today's Tasks", value: '18', sub: '11 in progress', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { label: 'Hours This Week', value: '1,284', sub: '96% of target', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
]

const activity = [
  { who: 'Sarah Chen', what: 'clocked in at 08:02', when: '8 min ago' },
  { who: 'Payroll run #24', what: 'completed — ₱482,300 disbursed', when: '32 min ago' },
  { who: 'Miguel Torres', what: 'submitted a leave request', when: '1 hr ago' },
  { who: 'Ana Reyes', what: 'completed task “Q3 report draft”', when: '2 hrs ago' },
  { who: 'HR Manager', what: 'approved 2 overtime requests', when: '3 hrs ago' },
  { who: 'System backup', what: 'finished successfully', when: '6 hrs ago' },
]

const shortcuts = [
  { to: '/timekeeping', label: 'Clock In / Out', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/tasks', label: 'My Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2m-6 9l2 2 4-4' },
  { to: '/payroll', label: 'Run Payroll', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { to: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

const weekData = [
  { day: 'Mon', hours: 310 },
  { day: 'Tue', hours: 342 },
  { day: 'Wed', height: 280, hours: 280 },
  { day: 'Thu', hours: 296 },
  { day: 'Fri', hours: 56 },
]

function Chart() {
  const max = Math.max(...weekData.map((d) => d.hours))
  return (
    <div className="flex h-44 items-end justify-between gap-3">
      {weekData.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs font-medium text-gray-500">{d.hours}h</span>
          <div
            className="w-full rounded-t-lg bg-gradient-to-t from-brand-500 to-emerald-400 transition-all"
            style={{ height: `${(d.hours / max) * 100}%` }}
          />
          <span className="text-xs text-gray-500">{d.day}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Good morning, Aizl</h1>
          <p className="mt-1 text-sm text-gray-500">Here's what's happening across your organization.</p>
        </div>
        <p className="text-sm font-medium text-gray-600 tabular-nums">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
          <span className="text-brand-600">{now.toLocaleTimeString()}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{s.label}</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{s.value}</p>
                <p className="mt-1 text-xs text-brand-600">{s.sub}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Weekly Hours Overview</h2>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">This week</span>
          </div>
          <Chart />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Recent Activity</h2>
          <ul className="space-y-4">
            {activity.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <div className="text-sm">
                  <p className="text-gray-700"><span className="font-medium text-gray-900">{a.who}</span> {a.what}</p>
                  <p className="text-xs text-gray-400">{a.when}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {shortcuts.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-800">{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
