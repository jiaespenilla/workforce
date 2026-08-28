import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, apiEnabled } from '../lib/api'
import Avatar from '../components/Avatar'

const shortcuts = [
  { to: '/timekeeping', label: 'Clock In / Out', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/tasks', label: 'My Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/payroll', label: 'Run Payroll', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { to: '/profile', label: 'My Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

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

function loadLocalAllTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_ceo_tasks'))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function loadLocalMyTasks(name) {
  return loadLocalAllTasks().filter((t) => t.assignee && t.assignee.startsWith(`${name} (`) && t.status !== 'completed')
}

// Latest punch per employee email — a person is "clocked in" when their most
// recent kiosk punch is a check-in for the current shift.
function getLocalClockInState() {
  let punches = []
  try {
    punches = JSON.parse(localStorage.getItem('uw_punches')) || []
  } catch {
    punches = []
  }
  const latest = {}
  for (const p of punches) {
    const prev = latest[p.email]
    if (!prev || new Date(p.time) > new Date(prev.time)) latest[p.email] = p
  }
  return latest
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

/* ---------- Task export helpers (PDF via print, Word via .doc, plain copy) ---------- */

function buildReportHtml(tasks) {
  const rows = tasks
    .map((t) => `<tr>
      <td>${t.title}</td>
      <td>${t.assignee}</td>
      <td>${STATUS_LABELS[t.status] || t.status}</td>
      <td>${t.priority}</td>
      <td>${t.due || '—'}</td>
    </tr>`)
    .join('')
  return `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
    <style>body{font-family:Arial,sans-serif;font-size:12px}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#ecfdf5}</style>
    </head><body><h1>All Employee Tasks Report</h1><p>Generated ${new Date().toLocaleString()}</p>
    <table><thead><tr><th>Task</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
}

function buildReportText(tasks) {
  return [
    `ALL EMPLOYEE TASKS REPORT — generated ${new Date().toLocaleString()}`,
    ''.padEnd(60, '='),

    ...tasks.map(
      (t) =>
        `[${STATUS_LABELS[t.status] || t.status}] ${t.title}\n    Assignee: ${t.assignee} · Priority: ${t.priority} · Due: ${t.due || '—'}`
    ),
  ].join('\n')
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function TaskExportToolbar({ tasks }) {
  if (tasks.length === 0) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildReportText(tasks))
      alert('Task report copied to clipboard.')
    } catch {
      alert('Unable to access the clipboard.')
    }
  }

  const word = () =>
    downloadFile('\ufeff' + buildReportHtml(tasks), 'employee-tasks-report.doc', 'application/msword')

  const pdf = () => {
    const win = window.open('', '_blank')
    if (!win) return alert('Please allow pop-ups to export as PDF.')
    win.document.write(buildReportHtml(tasks))
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={copy} title="Copy report" className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-400 hover:text-brand-700">Copy</button>
      <button onClick={word} title="Download as Word document" className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-400 hover:text-brand-700">Word</button>
      <button onClick={pdf} title="Export as PDF (print)" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700">PDF</button>
    </div>
  )
}

/* ---------- CEO dashboard ---------- */

const STATUS_ORDER = ['pending', 'inprogress', 'completed']

// Full task progress modal — monitoring view with a status stepper. The CEO
// cannot start a task (that's the employee's move), but can revert or complete.
function TaskProgressModal({ task, onClose, onStatusChange }) {
  const currentIndex = STATUS_ORDER.indexOf(task.status)
  const prevLabel = { inprogress: 'Back to pending', completed: 'Reopen task' }[task.status]
  // From "In Progress" the CEO may mark completion; never auto-starts a pending task.
  const nextLabel = task.status === 'inprogress' ? 'Mark as completed' : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-gray-900/50" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-600 to-emerald-400" />

        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div>
            <h3 className="text-lg font-bold leading-snug text-gray-900">{task.title}</h3>
            <p className="mt-1 text-xs text-gray-500">Assigned to: <span className="font-medium text-gray-700">{task.assignee}</span></p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress stepper */}
        <div className="px-6 pt-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Progress</p>
          <ol className="flex items-start">
            {STATUS_ORDER.map((status, i) => {
              const done = i <= currentIndex
              const isCurrent = i === currentIndex
              return (
                <li key={status} className={`flex items-start ${i < STATUS_ORDER.length - 1 ? 'flex-1' : ''}`}>
                  <div className="flex flex-col items-center gap-1.5">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                        done ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 bg-white text-gray-400'
                      }`}
                    >
                      {done && !isCurrent ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : i + 1}
                    </span>
                    <span className={`whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide ${done ? 'text-brand-700' : 'text-gray-400'}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                  {i < STATUS_ORDER.length - 1 && (
                    <span className={`mx-1 mt-4 h-0.5 flex-1 rounded ${i < currentIndex ? 'bg-brand-600' : 'bg-gray-200'}`} />
                  )}
                </li>
              )
            })}
          </ol>
        </div>

        {/* Details */}
        <dl className="mx-6 mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-gray-50 p-4 text-xs">
          <div>
            <dt className="font-semibold uppercase tracking-wide text-gray-400">Priority</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{task.priority}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-gray-400">Due date</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-gray-900">{task.due || '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-gray-400">Current status</dt>
            <dd className="mt-0.5">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLES[task.status]}`}>{STATUS_LABELS[task.status]}</span>
            </dd>
          </div>
        </dl>

        {/* Monitoring actions — no "Start task"; that belongs to the assigned employee */}
        {(prevLabel || nextLabel) && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">
            {prevLabel && (
              <button
                type="button"
                onClick={() => onStatusChange(task.id, STATUS_ORDER[currentIndex - 1])}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {prevLabel}
              </button>
            )}
            {nextLabel && (
              <button
                type="button"
                onClick={() => onStatusChange(task.id, STATUS_ORDER[currentIndex + 1])}
                className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                {nextLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CeoDashboard({ user }) {
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [viewingTask, setViewingTask] = useState(null)
  const [allTasks, setAllTasks] = useState([])
  const [clockState, setClockState] = useState({})
  const [allEmployees, setAllEmployees] = useState([])

  useEffect(() => {
    api('/api/companies')
      .then((cs) => setAllEmployees(cs.flatMap((c) => c.employees.map((e) => ({ ...e, companyName: c.name, companyId: c.id })))))
      .catch(() => setAllEmployees([]))
  }, [])

  const employees = allEmployees.filter((e) => e.active !== false && e.email !== user.email)

  useEffect(() => {
    if (apiEnabled()) {
      api('/api/tasks').then(setAllTasks).catch(() => setAllTasks(loadLocalAllTasks()))
      api('/api/attendance').then((records) => {
        const latest = {}
        for (const p of records) {
          const prev = latest[p.email]
          if (!prev || new Date(p.time) > new Date(prev.time)) latest[p.email] = p
        }
        setClockState(latest)
      }).catch(() => setClockState(getLocalClockInState()))
    } else {
      setAllTasks(loadLocalAllTasks())
      setClockState(getLocalClockInState())
    }
  }, [])

  // "Active" = currently clocked-in via the kiosk for their shift.
  const clockedInEmployees = employees.filter((e) => clockState[e.email]?.type === 'in')
  const selected = clockedInEmployees.find((e) => e.email === selectedEmail)
  const selectedTasks = selected
    ? allTasks.filter((t) => t.assignee === `${selected.name} (${selected.companyName})`)
    : []

  // Performance: pre-group tasks by assignee to avoid O(n*m) filters per employee card
  const tasksByAssignee = useMemo(() => {
    const map = new Map()
    for (const t of allTasks) {
      const key = t.assignee || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    }
    return map
  }, [allTasks])

  const changeTaskStatus = async (taskId, status) => {
    setAllTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
    setViewingTask((prev) => (prev && prev.id === taskId ? { ...prev, status } : prev))
    if (apiEnabled()) {
      await api(`/api/tasks/${taskId}`, { method: 'PUT', body: { status } }).catch(() => {})
    }
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">CEO Overview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Active Employees</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            {clockedInEmployees.length} currently clocked-in via kiosk · click an employee to view their tasks.
          </p>
        </div>
        <div className="shrink-0">
          <p className="mb-1 text-right text-[11px] font-medium uppercase tracking-wide text-gray-400">Export all tasks ({allTasks.length})</p>
          <TaskExportToolbar tasks={allTasks} />
        </div>
      </div>

      <div className={selected ? 'grid items-start gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]' : ''}>
        {/* Clocked-in employee list */}
        <div className="space-y-3">
          {clockedInEmployees.map((emp) => {
            const punch = clockState[emp.email]
            const empTasks = tasksByAssignee.get(`${emp.name} (${emp.companyName})`) || []
            const openCount = empTasks.filter((t) => t.status !== 'completed').length
            const doneCount = empTasks.filter((t) => t.status === 'completed').length
            const isSelected = emp.email === selectedEmail
            return (
              <button
                key={`${emp.companyId}-${emp.email}`}
                type="button"
                onClick={() => setSelectedEmail(isSelected ? null : emp.email)}
                className={`w-full rounded-xl border bg-white px-5 py-4 text-left shadow-sm transition hover:border-brand-300 hover:bg-brand-50/50 ${
                  isSelected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar user={{ name: emp.name, initials: emp.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(), avatar: emp.avatar }} size="h-11 w-11 text-sm" />
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-brand-500" title="Currently clocked in" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{emp.name}</p>
                    <p className="truncate text-xs text-gray-500">{emp.role}</p>
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-brand-700 ring-1 ring-brand-200">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      In since {new Date(punch.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="shrink-0 text-center">
                    <p className="text-lg font-bold tabular-nums text-gray-900">{openCount}</p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">open · {doneCount} done</p>
                  </div>
                </div>
              </button>
            )
          })}

          {clockedInEmployees.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-10 text-center">
              <svg className="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-gray-900">No one is clocked in right now</p>
              <p className="mt-1 text-xs text-gray-500">Employees appear here once they check in through the kiosk.</p>
            </div>
          )}
        </div>

        {/* Selected employee's tasks */}
        {selected && (
          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg lg:sticky lg:top-20">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <Avatar user={{ name: selected.name, initials: selected.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(), avatar: selected.avatar }} size="h-10 w-10 text-sm" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-gray-900">{selected.name}'s Tasks</h2>
                <p className="truncate text-xs text-gray-400">{selected.role}</p>
              </div>
              <button onClick={() => setSelectedEmail(null)} aria-label="Close panel" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {selectedTasks.length === 0 && (
              <div className="flex min-h-[120px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400">
                No tasks assigned yet.
              </div>
            )}

            {['pending', 'inprogress', 'completed'].map((status) => {
              const group = selectedTasks.filter((t) => t.status === status)
              if (group.length === 0) return null
              return (
                <div key={status}>
                  <p className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-gray-400">
                    {STATUS_LABELS[status]}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 tabular-nums">{group.length}</span>
                  </p>
                  <div className="space-y-2">
                    {group.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setViewingTask(task)}
                        className={`block w-full rounded-xl border p-3.5 text-left transition hover:border-brand-400 hover:shadow-md ${
                          status === 'completed' ? 'border-brand-100 bg-brand-50/40' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={`text-sm font-medium ${status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {task.title}
                          </h3>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
                            {STATUS_LABELS[status]}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] text-gray-400">
                          Priority: <span className="font-medium text-gray-500">{task.priority}</span>
                          {task.due && <> · Due: <span className="font-medium tabular-nums text-gray-500">{task.due}</span></>}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600">
                          View full progress
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {viewingTask && (
        <TaskProgressModal
          task={viewingTask}
          onClose={() => setViewingTask(null)}
          onStatusChange={changeTaskStatus}
        />
      )}
    </div>
  )
}

export default function Dashboard() {
  const [now, setNow] = useState(new Date())
  const { user } = useAuth()
  const [allTasks, setAllTasks] = useState([])
  const [clockState, setClockState] = useState({})
  const [allEmployees, setAllEmployees] = useState([])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (apiEnabled()) {
      api('/api/tasks')
        .then((all) => setAllTasks(all.filter((t) => t.assignee && t.assignee.startsWith(`${user?.name || ''} (`) && t.status !== 'completed')))
        .catch(() => setAllTasks(loadLocalMyTasks(user?.name || '')))
      api('/api/attendance').then((records) => {
        const latest = {}
        for (const p of records) {
          const prev = latest[p.email]
          if (!prev || new Date(p.time) > new Date(prev.time)) latest[p.email] = p
        }
        setClockState(latest)
      }).catch(() => setClockState(getLocalClockInState()))
    } else {
      setAllTasks(loadLocalMyTasks(user?.name || ''))
      setClockState(getLocalClockInState())
    }
  }, [user?.name])

  useEffect(() => {
    api('/api/companies')
      .then((cs) => setAllEmployees(cs.flatMap((c) => c.employees.map((e) => ({ ...e, companyName: c.name, companyId: c.id })))))
      .catch(() => setAllEmployees([]))
  }, [])

  if (user?.role === 'ceo') {
    return <CeoDashboard user={user} />
  }
  const employees = allEmployees
  const activeCount = employees.filter((e) => e.active !== false).length
  const myTasks = allTasks
  const firstName = (user?.name || '').split(' ')[0] || 'there'

  const stats = [
    { label: 'Active Employees', value: String(activeCount), sub: `${employees.length} total`, icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 1.37a6 6 0 10-6-6 6 6 0 006 6z' },
    { label: 'Pending Approvals', value: '0', sub: 'Nothing to review', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: "Today's Tasks", value: String(myTasks.length), sub: myTasks.length ? 'Assigned to you' : 'No open tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { label: 'Hours This Week', value: '0.0', sub: 'Clock in to start tracking', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, {firstName}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Here's what's happening across your organization.</p>
        </div>
        <p className="shrink-0 text-sm font-medium text-gray-600 tabular-nums">
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
