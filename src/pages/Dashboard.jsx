import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getAllEmployees } from '../lib/companies'

const shortcuts = [
  { to: '/timekeeping', label: 'Clock In / Out', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/tasks', label: 'My Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/payroll', label: 'Run Payroll', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { to: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

function loadAllTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_ceo_tasks'))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function loadMyTasks(name) {
  return loadAllTasks().filter((t) => t.assignee && t.assignee.startsWith(`${name} (`) && t.status !== 'completed')
}

const weekData = [
  { day: 'Mon', hours: 0 },
  { day: 'Tue', hours: 0 },
  { day: 'Wed', hours: 0 },
  { day: 'Thu', hours: 0 },
  { day: 'Fri', hours: 0 },
]

function Chart() {
  const max = Math.max(...weekData.map((d) => d.hours), 1)
  return (
    <div className="flex h-44 items-end justify-between gap-3">
      {weekData.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs font-medium text-gray-500">{d.hours}h</span>
          <div
            className="w-full rounded-t-lg bg-gradient-to-t from-brand-500 to-emerald-400 transition-all"
            style={{ height: `${Math.max((d.hours / max) * 100, 2)}%` }}
          />
          <span className="text-xs text-gray-500">{d.day}</span>
        </div>
      ))}
    </div>
  )
}

const STATUS_LABELS = {
  pending: 'Pending',
  inprogress: 'In Progress',
  completed: 'Completed',
}

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-gray-600',
  inprogress: 'bg-amber-100 text-amber-700',
  completed: 'bg-brand-100 text-brand-700',
}

// CEO view — active employees (excluding the CEO); click an employee to see their tasks.
function CeoDashboard({ user }) {
  const [selectedEmail, setSelectedEmail] = useState(null)
  const employees = getAllEmployees().filter((e) => e.active !== false && e.email !== user.email)
  const selected = employees.find((e) => e.email === selectedEmail)
  const selectedTasks = selected
    ? loadAllTasks().filter((t) => t.assignee === `${selected.name} (${selected.companyName})`)
    : []

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">CEO Overview</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Active Employees</h1>
        <p className="mt-1 text-sm text-gray-500">{employees.length} active employee{employees.length !== 1 ? 's' : ''} across your organization. Click an employee to view their tasks.</p>
      </div>

      <div className={selected ? 'grid gap-4 lg:grid-cols-2' : ''}>
        <div className="space-y-3">
          {employees.map((emp) => {
            const taskCount = loadAllTasks().filter(
              (t) => t.assignee === `${emp.name} (${emp.companyName})` && t.status !== 'completed'
            ).length
            const isSelected = emp.email === selectedEmail
            return (
              <button
                key={`${emp.companyId}-${emp.email}`}
                type="button"
                onClick={() => setSelectedEmail(isSelected ? null : emp.email)}
                className={`flex w-full items-center gap-4 rounded-xl border bg-white px-5 py-4 text-left shadow-sm transition hover:border-brand-300 hover:bg-brand-50/50 ${
                  isSelected ? 'border-brand-400 ring-2 ring-brand-200' : 'border-gray-200'
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {emp.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{emp.name}</p>
                  <p className="truncate text-xs text-gray-500">{emp.role} · {emp.companyName}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                  taskCount > 0 ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'bg-gray-100 text-gray-500'
                }`}>
                  {taskCount} open task{taskCount !== 1 ? 's' : ''}
                </span>
                <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isSelected ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )
          })}
          {employees.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="text-sm text-gray-500">No active employees yet.</p>
            </div>
          )}
        </div>

        {selected && (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{selected.name}'s Tasks</h2>
              <p className="text-xs text-gray-400">{selected.role} · {selected.companyName}</p>
            </div>
            {selectedTasks.length === 0 && (
              <div className="flex min-h-[160px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400">
                No tasks assigned yet.
              </div>
            )}
            {selectedTasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {task.title}
                  </h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[task.status] || ''}`}>
                    {STATUS_LABELS[task.status] || task.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Priority: <span className="font-medium text-gray-700">{task.priority}</span>
                  {task.due && <> · Due <span className="font-medium tabular-nums text-gray-700">{task.due}</span></>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [now, setNow] = useState(new Date())
  const { user } = useAuth()
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  if (user?.role === 'ceo') {
    return <CeoDashboard user={user} />
  }

  const employees = getAllEmployees()
  const activeCount = employees.filter((e) => e.active !== false).length
  const myTasks = loadMyTasks(user?.name || '')
  const firstName = (user?.name || '').split(' ')[0] || 'there'

  const stats = [
    { label: 'Active Employees', value: String(activeCount), sub: `${employees.length} total`, icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 1.37a6 6 0 10-6-6 6 6 0 006 6z' },
    { label: 'Pending Approvals', value: '0', sub: 'Nothing to review', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: "Today's Tasks", value: String(myTasks.length), sub: myTasks.length ? 'Assigned to you' : 'No open tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { label: 'Hours This Week', value: '0.0', sub: 'Clock in to start tracking', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, {firstName}
          </h1>
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
          <div className="flex h-full min-h-[160px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400">
            No recent activity yet.
          </div>
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
