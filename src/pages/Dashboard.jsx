import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, apiEnabled } from '../lib/api'
import Avatar from '../components/Avatar'
import { SkeletonRows } from '../components/Skeleton'

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

// --- Date helpers for the task generator (local dates, never UTC) ---
function localTodayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Normalize a task's due value to a plain YYYY-MM-DD key (handles datetimes/null).
function dueKey(t) { return String(t?.due || '').slice(0, 10) }

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




/* ---------- Task export helpers (PDF via print, Word via .doc, plain copy) ---------- */

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}
function buildReportHtml(tasks) {
  const rows = tasks
    .map((t) => `<tr>
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(t.assignee)}</td>
      <td>${escapeHtml(STATUS_LABELS[t.status] || t.status)}</td>
      <td>${escapeHtml(t.priority)}</td>
      <td>${escapeHtml(t.due || '—')}</td>
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
  const [now, setNow] = useState(new Date())
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [viewingTask, setViewingTask] = useState(null)
  const [allTasks, setAllTasks] = useState([])
  const [clockState, setClockState] = useState({})
  const [allEmployees, setAllEmployees] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
    const [genStartDate, setGenStartDate] = useState('')
  const [genEndDate, setGenEndDate] = useState('')
  const [genTargetDate, setGenTargetDate] = useState(() => localTodayISO())
  const [genConfirmOpen, setGenConfirmOpen] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { const t=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(t) }, [])

  useEffect(() => {
    api('/api/companies')
      .then((cs) => {
        const list = Array.isArray(cs) ? cs : (cs.data || [])
        setAllEmployees(list.flatMap((c) => c.employees.map((e) => ({ ...e, companyName: c.name, companyId: c.id }))))
      })
      .catch(() => setAllEmployees([]))
      .finally(() => setLoading(false))
    }, [])

  const employees = allEmployees.filter((e) => e.active !== false && e.email !== user.email)
  const firstName = (user?.name || '').split(' ')[0] || 'there'

  useEffect(() => {
    if (apiEnabled()) {
      api('/api/tasks').then((res) => setAllTasks(Array.isArray(res) ? res : (res.data || []))).catch(() => setAllTasks(loadLocalAllTasks())).finally(() => setLoading(false))
      api('/api/attendance').then((res) => {
        const records = Array.isArray(res) ? res : (res.data || [])
        setAllAttendance(records)
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
      try { setAllAttendance(JSON.parse(localStorage.getItem('uw_punches'))||[]) } catch { setAllAttendance([]) }
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

  // "Copy tasks" generator - now supports a date RANGE.
  // Tasks whose due date falls within [genStartDate, genEndDate] are copied
  // to the target, preserving day offsets (e.g. 2025-01-01..03 -> 2025-02-01..03).
  // If only From is set, it behaves like the previous single-day copy.
  const genEffectiveEnd = genEndDate || genStartDate
  const genSourceTasks = () => {
    if (!genStartDate) return []
    const end = genEffectiveEnd
    return allTasks.filter((t) => {
      const k = dueKey(t)
      if (!k) return false
      return k >= genStartDate && k <= end
    })
  }
  // days between two YYYY-MM-DD strings
  const daysBetween = (a, b) => {
    const da = new Date(a + 'T00:00:00')
    const db = new Date(b + 'T00:00:00')
    return Math.round((db - da) / 86400000)
  }
  const addDaysISO = (iso, days) => {
    const d = new Date(iso + 'T00:00:00')
    d.setDate(d.getDate() + days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const handleCopyTasks = () => {
    if (!genStartDate) { setGenResult({ type:'error', msg:'Select a From start day.' }); return }
    if (genEndDate && genEndDate < genStartDate) { setGenResult({ type:'error', msg:'End date cannot be before start date.' }); return }
    if (!genTargetDate) { setGenResult({ type:'error', msg:'Select a target day.' }); return }
    const src = genSourceTasks()
    if (!src.length) { setGenResult({ type:'error', msg:`No tasks found between ${genStartDate} and ${genEffectiveEnd}.` }); return }
    setGenConfirmOpen(true)
  }
  const doCopyTasks = async () => {
    const src = genSourceTasks()
    let created = 0
    let failed = 0
    for (const t of src) {
      const offset = daysBetween(genStartDate, dueKey(t))
      const targetDue = addDaysISO(genTargetDate, offset)
      try {
        if (apiEnabled()) {
          const c = await api('/api/tasks', { method: 'POST', body: { title: t.title, assignee: t.assignee, priority: t.priority, due: targetDue, status: 'pending' } })
          setAllTasks((p)=> [...p, c])
        } else {
          setAllTasks((p)=> [...p, { ...t, id: Date.now()+created+Math.random(), due: targetDue, status: 'pending' }])
        }
        created++
      } catch { failed++ }
    }
    setGenConfirmOpen(false)
    const rangeLabel = genStartDate === genEffectiveEnd ? genStartDate : `${genStartDate} → ${genEffectiveEnd}`
    const targetLabel = src.length === 1 ? genTargetDate : `${genTargetDate} (+${daysBetween(genStartDate, dueKey(src[src.length-1]))}d)`
    setGenResult(created
      ? { type:'success', msg:`${created} task(s) from ${rangeLabel} copied to ${targetLabel}.${failed ? ` ${failed} failed - try again.` : ''}` }
      : { type:'error', msg:`No tasks were copied. ${failed} task(s) failed - check your connection and try again.` }
    )
    setTimeout(()=>setGenResult(null), 6000)
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">CEO Overview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Good {now.getHours()<12?'morning':now.getHours()<18?'afternoon':'evening'}, {firstName}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            {clockedInEmployees.length} currently clocked-in via kiosk · click an employee to view their tasks.
          </p>
        </div>
        <div className="shrink-0">
          <p className="mb-1 text-right text-[11px] font-medium uppercase tracking-wide text-gray-400">Export all tasks ({allTasks.length})</p>
          <TaskExportToolbar tasks={allTasks} />
        </div>
      </div>

      {/* Summary chips + status legend */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Total staff</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{employees.length}</p>
          </div>
          <div className="rounded-lg bg-brand-50 p-3 ring-1 ring-brand-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Clocked in</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">{clockedInEmployees.length}</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">In progress</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700">{allTasks.filter((t) => t.status === 'inprogress').length}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Completed</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{allTasks.filter((t) => t.status === 'completed').length}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Status legend</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            Pending · {allTasks.filter((t) => t.status === 'pending').length}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            In Progress · {allTasks.filter((t) => t.status === 'inprogress').length}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className="h-2 w-2 rounded-full bg-brand-600" />
            Completed · {allTasks.filter((t) => t.status === 'completed').length}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
                        <h3 className="text-sm font-bold text-gray-900">Generate tasks from date range</h3>
            <p className="mt-1 text-xs text-gray-500">Copy all tasks within a source range to a target date — offsets are preserved.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-gray-700">From
              <input type="date" value={genStartDate} onChange={(e)=>{ setGenStartDate(e.target.value); if(!genEndDate) setGenEndDate(e.target.value) }} className="ml-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-700">To
              <input type="date" value={genEndDate} onChange={(e)=>setGenEndDate(e.target.value)} className="ml-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-700">Copy to
              <input type="date" value={genTargetDate} onChange={(e)=>setGenTargetDate(e.target.value)} className="ml-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <button onClick={handleCopyTasks} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-brand-700">Generate</button>
          </div>
        </div>
        {genStartDate && genTargetDate && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500">
              {genSourceTasks().length} task(s) from <span className="font-mono font-semibold">{genStartDate}</span> to <span className="font-mono font-semibold">{genEffectiveEnd}</span> will be generated starting at <span className="font-mono font-semibold">{genTargetDate}</span>{genSourceTasks().length>1 ? ` (preserving ${daysBetween(genStartDate, genEffectiveEnd)} day spread)` : ''}.
            </p>
            {(() => {
              const punches = allAttendance.filter((p)=> {
                const d = (p.time||'').slice(0,10)
                return d >= genStartDate && d <= genEffectiveEnd
              })
              // Pre-classify punches per email in one pass (O(n)) instead of
              // re-scanning the punch list for every employee (O(n*m)).
              const lastPunchByEmail = new Map()
              for (const p of punches) {
                const key = (p.email || '').toLowerCase()
                const prev = lastPunchByEmail.get(key)
                if (!prev || (p.time || '') > (prev.time || '')) lastPunchByEmail.set(key, p)
              }
              const presentSet = new Set(lastPunchByEmail.keys())
              const present = employees.filter((e)=> presentSet.has(e.email.toLowerCase()))
              const absent = employees.filter((e)=> !presentSet.has(e.email.toLowerCase()))
              const clockedIn = []
              const clockedOut = []
              present.forEach((e)=>{
                const last = lastPunchByEmail.get(e.email.toLowerCase())
                if (last?.type==='in') clockedIn.push(e); else clockedOut.push(e)
              })
              return (
                <div className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-xs font-bold text-emerald-700">Clocked In · {clockedIn.length}</p>
                    <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {clockedIn.slice(0,5).map((e)=> <p key={e.email} className="truncate text-xs text-gray-700">{e.name}</p>)}
                      {clockedIn.length===0 && <p className="text-xs text-gray-400">None</p>}
                      {clockedIn.length>5 && <p className="text-xs text-gray-400">+{clockedIn.length-5} more</p>}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-xs font-bold text-gray-700">Clocked Out · {clockedOut.length}</p>
                    <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {clockedOut.slice(0,5).map((e)=> <p key={e.email} className="truncate text-xs text-gray-700">{e.name}</p>)}
                      {clockedOut.length===0 && <p className="text-xs text-gray-400">None</p>}
                      {clockedOut.length>5 && <p className="text-xs text-gray-400">+{clockedOut.length-5} more</p>}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-xs font-bold text-red-600">Absent · {absent.length}</p>
                    <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                      {absent.slice(0,5).map((e)=> <p key={e.email} className="truncate text-xs text-gray-700">{e.name}</p>)}
                      {absent.length===0 && <p className="text-xs text-gray-400">None</p>}
                      {absent.length>5 && <p className="text-xs text-gray-400">+{absent.length-5} more</p>}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
        {genResult && (
          <div className={`mt-2 rounded-lg px-4 py-3 text-xs font-medium ring-1 ${genResult.type==='success'?'bg-emerald-50 text-emerald-700 ring-emerald-200':'bg-amber-50 text-amber-700 ring-amber-200'}`}>{genResult.msg}</div>
        )}
      </div>

      {genConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>setGenConfirmOpen(false)}>
          <div className="absolute inset-0 bg-gray-900/50" />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e)=>e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">Confirm generate tasks</h3>
            {(() => {
              const src = genSourceTasks()
              const rangeLabel = genStartDate === genEffectiveEnd ? genStartDate : `${genStartDate} → ${genEffectiveEnd}`
              return (
                <>
                  <p className="mt-1 text-sm text-gray-500">Generate <span className="font-semibold text-gray-900">{src.length} task(s)</span> from <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{rangeLabel}</span> to <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{genTargetDate}</span>{src.length>1 ? ` (offsets preserved)` : ''}?</p>
                  <div className="mt-4 max-h-40 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200 bg-gray-50">
                    {src.slice(0, 5).map((t) => {
                      const targetDue = addDaysISO(genTargetDate, daysBetween(genStartDate, dueKey(t)))
                      return (
                      <div key={t.id} className="px-3 py-2 text-xs">
                        <p className="font-medium text-gray-900 truncate">{t.title}</p>
                        <p className="text-gray-500">{t.assignee} · {t.priority} · due {dueKey(t)} → {targetDue}</p>
                      </div>
                    )})}
                    {src.length > 5 && <p className="px-3 py-2 text-center text-xs text-gray-400">+{src.length - 5} more</p>}
                  </div>
                </>
              )
            })()}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={()=>setGenConfirmOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={doCopyTasks} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Confirm &amp; Generate</button>
            </div>
          </div>
        </div>
      )}

      <div className={selected ? 'grid items-start gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]' : ''}>
        {/* Clocked-in employee list */}
        <div className="space-y-3">
          {loading && <div className="rounded-xl border border-gray-200 bg-white shadow-sm"><SkeletonRows rows={4} /></div>}
          {!loading && clockedInEmployees.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-400 shadow-sm">
              Nobody is clocked in right now.
            </div>
          )}
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
  const [_clockState, setClockState] = useState({})
  const [allEmployees, setAllEmployees] = useState([])
  const [myPunches, setMyPunches] = useState([])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (apiEnabled()) {
      api('/api/tasks')
        .then((res) => {
          const all = Array.isArray(res) ? res : (res.data || [])
          setAllTasks(all.filter((t) => t.assignee && t.assignee.startsWith(`${user?.name || ''} (`) && t.status !== 'completed'))
        })
        .catch(() => setAllTasks(loadLocalMyTasks(user?.name || '')))
      api('/api/attendance').then((res) => {
        const records = Array.isArray(res) ? res : (res.data || [])
        const latest = {}
        for (const p of records) {
          const prev = latest[p.email]
          if (!prev || new Date(p.time) > new Date(prev.time)) latest[p.email] = p
        }
        setClockState(latest)
      }).catch(() => setClockState(getLocalClockInState()))
      if (user?.email) {
        api(`/api/attendance?email=${encodeURIComponent(user.email)}`).then((res) => setMyPunches(Array.isArray(res) ? res : (res.data || []))).catch(()=>{})
      }
    } else {
      setAllTasks(loadLocalMyTasks(user?.name || ''))
      setClockState(getLocalClockInState())
      try { setMyPunches((JSON.parse(localStorage.getItem('uw_punches'))||[]).filter((p)=>p.email===user?.email)) } catch { setMyPunches([]) }
    }
  }, [user?.name, user?.email])

  useEffect(() => {
    api('/api/companies')
      .then((cs) => {
        const list = Array.isArray(cs) ? cs : (cs.data || [])
        setAllEmployees(list.flatMap((c) => c.employees.map((e) => ({ ...e, companyName: c.name, companyId: c.id }))))
      })
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

  // compute weekly hours for employee chart from myPunches
  const weekDays = (() => {
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay()+6)%7)); monday.setHours(0,0,0,0)
    return Array.from({length:5},(_,i)=>{
      const d=new Date(monday); d.setDate(monday.getDate()+i)
      const dayPunches = myPunches.filter((p)=> new Date(p.time).toDateString()===d.toDateString()).sort((a,b)=> new Date(a.time)-new Date(b.time))
      let total=0; let lastIn=null
      for(const p of dayPunches){ if(p.type==='in') lastIn=new Date(p.time); else if(lastIn){ total+=new Date(p.time)-lastIn; lastIn=null }}
      return { label: d.toLocaleDateString([],{weekday:'short'}), hours: +(total/3600000).toFixed(1) }
    })
  })()
  const weekMax = Math.max(...weekDays.map((d)=>d.hours), 1)
  const recentPunches = myPunches.slice(0,4)
  const upcomingTasks = myTasks.slice(0,3)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, {firstName}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Here's your daily overview — hours, tasks and quick actions.</p>
        </div>
        <div className="shrink-0 rounded-xl border border-gray-200 bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-sm font-bold tabular-nums text-gray-900">{now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</p>
          <p className="text-xs text-gray-500">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-brand-200">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 to-emerald-400 opacity-0 transition group-hover:opacity-100" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{s.label}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{s.value}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />{s.sub}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-emerald-50 text-brand-600 ring-1 ring-brand-100">
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
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">{weekDays.reduce((s,d)=>s+d.hours,0).toFixed(1)}h this week</span>
          </div>
          <div className="flex h-44 items-end justify-between gap-3">
            {weekDays.map((d)=>(
              <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
                <span className={`text-xs font-semibold tabular-nums ${d.hours? 'text-brand-700' : 'text-gray-400'}`}>{d.hours.toFixed(1)}h</span>
                <div className={`w-full rounded-t-lg transition-all ${d.hours? 'bg-gradient-to-t from-brand-600 to-emerald-400' : 'bg-gray-100'}`} style={{ height: `${Math.max((d.hours/weekMax)*100,6)}%` }} />
                <span className="text-xs font-medium text-gray-500">{d.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-gray-400">Mon–Fri from your kiosk punches</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col">
          <h2 className="text-base font-semibold text-gray-900">Today's Timeline</h2>
          <p className="text-xs text-gray-500">{recentPunches.length} punches today</p>
          <div className="mt-4 flex-1 space-y-3">
            {recentPunches.length ? recentPunches.map((p,i)=>(
              <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${p.type==='in'?'bg-brand-600 text-white':'bg-gray-900 text-white'}`}>{p.type==='in'?'IN':'OUT'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900 capitalize">{p.type} · {new Date(p.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>
                  <p className="text-[11px] text-gray-500">{new Date(p.time).toLocaleDateString()}</p>
                </div>
              </div>
            )) : <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">No punches yet — use the kiosk to clock in.</div>}
          </div>
          {upcomingTasks.length >0 && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Up next</p>
              <ul className="mt-2 space-y-2">
                {upcomingTasks.map((t)=>(
                  <li key={t.id} className="flex items-center justify-between rounded-lg bg-brand-50/60 px-3 py-2">
                    <span className="truncate text-xs font-medium text-gray-800">{t.title}</span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600">{t.due || 'No due'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {shortcuts.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="group flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow transition group-hover:scale-105 group-hover:bg-brand-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-800 group-hover:text-brand-700">{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

