import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, apiEnabled } from '../lib/api'
import { canAction } from '../lib/roles'
import { taskTimeByDay, dayLabel } from '../lib/workLog'

const columns = [
  { id: 'pending', label: 'Pending' },
  { id: 'inprogress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
]

const priorityStyles = {
  Urgent: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-brand-50 text-brand-700',
  Low: 'bg-gray-100 text-gray-600',
}

function loadLocalMyTasks(name) {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_ceo_tasks'))
    return Array.isArray(stored)
      ? stored.filter((t) => t.assignee && t.assignee.startsWith(`${name} (`))
      : []
  } catch {
    return []
  }
}

function loadLocalTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_ceo_tasks'))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

// Notes may be a legacy plain string or the work-progress array [{at, by, text}].
function notesList(notes) {
  if (Array.isArray(notes)) return notes.filter((n) => n && typeof n === 'object')
  if (typeof notes === 'string' && notes.trim()) return [{ text: notes }]
  return []
}

/* ---------- Work log timer (63) ---------- */
// A task timer is running when workStartedAt is set. Elapsed time shown is
// always: stored finished-session seconds + the live running session.
export function workRunning(t) {
  return !!t?.workStartedAt
}
export function workElapsedMs(t, now) {
  return (t?.workSeconds || 0) * 1000 + (workRunning(t) ? Math.max(0, now - new Date(t.workStartedAt).getTime()) : 0)
}
export function fmtHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}
// Compact form for card badges: "2h 05m" / "8m" / "<1m".
export function fmtWorked(ms) {
  const mins = Math.floor(Math.max(0, ms) / 60000)
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
  if (mins > 0) return `${mins}m`
  return '<1m'
}
// Ticks every second while at least one timer in view is running.
function useTicker(active) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}
// Offline/local-mode timer transition (server does the same computation).
function applyLocalTimer(task, action) {
  if (action === 'start') return { ...task, workStartedAt: new Date().toISOString() }
  const end = Date.now()
  const seconds = task.workStartedAt ? Math.max(0, Math.round((end - new Date(task.workStartedAt).getTime()) / 1000)) : 0
  return {
    ...task,
    workSeconds: (task.workSeconds || 0) + seconds,
    workStartedAt: null,
    workLog: [...(task.workLog || []), { start: task.workStartedAt, end: new Date(end).toISOString(), seconds }],
  }
}

export default function Tasks() {
  usePageTitle('Tasks')
  const { user } = useAuth()
  const canManage = user?.role === 'administrator' || user?.role === 'ceo' || (user?.role !== 'administrator' && canAction(user?.perms, 'tasks', 'add'))
  return canManage ? <MonitoringBoard /> : <EmployeeTasks name={user?.name || ''} />
}

/* ---------- Monitoring board (managers, CEO, administrators) ---------- */

function MonitoringBoard() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', assignee: '', priority: 'Medium', due: '' })
  const [employees, setEmployees] = useState([])
  const [taskQuery, setTaskQuery] = useState('')
  const [viewingTask, setViewingTask] = useState(null)
  const [noteInput, setNoteInput] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  // (69) Inline due-date editor in the task detail modal.
  const [dueEditId, setDueEditId] = useState(null)
  const [dueEditVal, setDueEditVal] = useState('')
  // (70) Transfer active tasks to another employee (before deactivation).
  const [transferEmp, setTransferEmp] = useState(null)
  const [transferTo, setTransferTo] = useState('')
  const [transferSel, setTransferSel] = useState(() => new Set())
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferMsg, setTransferMsg] = useState('')
  // Live clock for work-log timers — only ticks while a session is running.
  const now = useTicker(tasks.some(workRunning))
  useEffect(() => {
    api('/api/companies')
      .then((res) => {
        const cs = Array.isArray(res) ? res : (res.data || [])
        setEmployees(cs.flatMap((c) => (c.employees || []).map((e) => ({ ...e, companyName: c.name, companyId: c.id }))))
      })
      .catch(() => setEmployees([]))
  }, [])
  const isLeadership = (e) => ['ceo', 'administrator', 'admin'].includes(String(e.role || e.roleLabel || '').trim().toLowerCase())
  // Assignee dropdown + staff table exclude CEO/administrators — they have no tasks to finish.
  const activeEmployees = employees.filter((e) => e.active !== false && !isLeadership(e))
  const staffList = employees.filter((e) => !isLeadership(e))
  // Non-CEO users only see the tasks assigned to them ("my work"); CEO and
  // administrators monitor everything.
  const canViewAll = user?.role === 'administrator' || user?.role === 'ceo'
  // (69/70) Due-date editing and task transfer are management actions: the
  // CEO, administrators and manager roles (HR Manager, Team Lead…). Admins can
  // additionally hide each via Roles & Permissions → Tasks (edit / transfer).
  const roleLabel = String(user?.roleLabel || user?.role || '').toLowerCase()
  const isMgmtUser = user?.role === 'administrator' || user?.role === 'ceo' || roleLabel.includes('manager') || roleLabel.includes('lead')
  const canEditDue = isMgmtUser && canAction(user?.perms, 'tasks', 'edit')
  const canTransfer = isMgmtUser && canAction(user?.perms, 'tasks', 'transfer')
  const isMine = (t) => {
    const me = (user?.email || '').toLowerCase()
    if (!me) return false
    if (t.assigneeEmail) return String(t.assigneeEmail).toLowerCase() === me
    return !!(t.assignee && user?.name && t.assignee.startsWith(`${user.name} (`))
  }
  const scopedTasks = canViewAll ? tasks : tasks.filter(isMine)
  const tq = taskQuery.trim().toLowerCase()
  const visibleTasks = tq
    ? scopedTasks.filter((t) => [t.title, t.assignee, t.priority, t.due, t.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(tq)))
    : scopedTasks
  // Non-privileged creators can only assign new tasks to themselves.
  const assignableEmployees = canViewAll ? activeEmployees : activeEmployees.filter((e) => (e.email || '').toLowerCase() === (user?.email || '').toLowerCase())
  const shownStaff = canViewAll ? staffList : staffList.filter((e) => (e.email || '').toLowerCase() === (user?.email || '').toLowerCase())

  useEffect(() => {
    if (apiEnabled()) {
      // /api/tasks returns a paginated envelope { data, total } — unwrap it.
      api('/api/tasks')
        .then((res) => setTasks(Array.isArray(res) ? res : (res.data || [])))
        .catch(() => setTasks(loadLocalTasks()))
    } else {
      setTasks(loadLocalTasks())
    }
  }, [])

  const addTask = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.assignee) return
    if (apiEnabled()) {
      try {
        const created = await api('/api/tasks', { method: 'POST', body: form })
        setTasks((t) => [...t, created])
      } catch {
        setTasks((t) => [...t, { ...form, id: Date.now(), status: 'pending' }])
      }
    } else {
      setTasks((t) => [...t, { ...form, id: Date.now(), status: 'pending' }])
    }
    setForm({ title: '', assignee: '', priority: 'Medium', due: '' })
    setShowForm(false)
  }

  const drop = async (status) => {
    if (dragId == null) return
    setTasks((t) => t.map((task) => (task.id === dragId ? { ...task, status } : task)))
    if (apiEnabled()) {
      await api(`/api/tasks/${dragId}`, { method: 'PUT', body: { status } }).catch(() => {})
    }
    setDragId(null)
    setOverCol(null)
  }

  const deleteTask = async (id) => {
    setTasks((t) => t.filter((task) => task.id !== id))
    if (apiEnabled()) {
      await api(`/api/tasks/${id}`, { method: 'DELETE' }).catch(() => {})
    }
  }

  const setTaskStatus = async (id, status) => {
    setTasks((t) => t.map((task) => (task.id === id ? { ...task, status } : task)))
    setViewingTask((v) => (v && v.id === id ? { ...v, status } : v))
    if (apiEnabled()) {
      await api(`/api/tasks/${id}`, { method: 'PUT', body: { status } }).catch(() => {})
    }
  }

  // (69) Update a task's due date (optimistic; reopens the editor on failure).
  const setTaskDue = async (id, due) => {
    const prev = tasks.find((t) => t.id === id)?.due || ''
    const next = due || null
    setTasks((t) => t.map((task) => (task.id === id ? { ...task, due: next } : task)))
    setViewingTask((v) => (v && v.id === id ? { ...v, due: next } : v))
    setDueEditId(null)
    if (apiEnabled()) {
      try {
        await api(`/api/tasks/${id}`, { method: 'PUT', body: { due: next } })
      } catch {
        setDueEditId(id)
        setDueEditVal(String(prev).slice(0, 10))
      }
    }
  }

  // (70) Open the transfer dialog for an employee — their active tasks must be
  // handed over to someone else before they can be deactivated.
  const openTransfer = (emp) => {
    const active = tasks.filter((t) =>
      (t.assigneeEmail ? t.assigneeEmail === emp.email : t.assignee && t.assignee.startsWith(`${emp.name} (${emp.companyName})`))
      && t.status !== 'completed')
    setTransferEmp(emp)
    setTransferTo('')
    setTransferSel(new Set(active.map((t) => t.id)))
    setTransferMsg('')
  }

  const toggleTransferTask = (id) => {
    const next = new Set(transferSel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setTransferSel(next)
  }

  const confirmTransfer = async () => {
    if (!transferEmp || !transferTo || transferBusy) return
    const target = employees.find((e) => (e.email || '').toLowerCase() === transferTo.toLowerCase())
    if (!target) return
    setTransferBusy(true)
    setTransferMsg('')
    const targetAssignee = `${target.name} (${target.companyName})`
    const movedIds = new Set(tasks.filter((t) => transferSel.has(t.id)).map((t) => t.id))
    if (!movedIds.size) {
      setTransferMsg('Select at least one task to transfer.')
      setTransferBusy(false)
      return
    }
    setTasks((prev) => prev.map((t) => movedIds.has(t.id)
      ? { ...t, assignee: targetAssignee, assigneeEmail: target.email, assigneeCompanyId: target.companyId }
      : t))
    let failed = 0
    if (apiEnabled()) {
      for (const id of movedIds) {
        try {
          await api(`/api/tasks/${id}`, { method: 'PUT', body: { assignee: targetAssignee, transferTo: true } })
        } catch { failed++ }
      }
    }
    setTransferBusy(false)
    if (failed === 0) setTransferEmp(null)
    else setTransferMsg(`${failed} task${failed !== 1 ? 's' : ''} could not be synced — shown transferred here; retry or check the connection.`)
  }

  // Append a work-progress note. The server stamps author/time and caps length.
  const addNote = async () => {
    const text = noteInput.trim()
    if (!viewingTask || !text || noteSaving) return
    setNoteSaving(true)
    const entry = { text, by: user?.name || user?.email || 'Someone', at: new Date().toISOString() }
    const next = [...notesList(viewingTask.notes), entry]
    setTasks((t) => t.map((task) => (task.id === viewingTask.id ? { ...task, notes: next } : task)))
    setViewingTask((v) => (v ? { ...v, notes: next } : v))
    setNoteInput('')
    if (apiEnabled()) {
      try {
        const updated = await api(`/api/tasks/${viewingTask.id}`, { method: 'PUT', body: { notes: next } })
        if (updated?.notes) {
          setTasks((t) => t.map((task) => (task.id === viewingTask.id ? { ...task, notes: updated.notes } : task)))
          setViewingTask((v) => (v ? { ...v, notes: updated.notes } : v))
        }
      } catch {
        // offline — local copy already updated above
      }
    }
    setNoteSaving(false)
  }

  const counts = Object.fromEntries(columns.map((c) => [c.id, scopedTasks.filter((t) => t.status === c.id).length]))
  const overdue = scopedTasks.filter((t) => t.due && t.status !== 'completed' && new Date(t.due) < new Date(new Date().toDateString())).length
  const completionPct = scopedTasks.length ? Math.round(((counts.completed || 0) / scopedTasks.length) * 100) : 0

  const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{canViewAll ? 'Team Overview' : 'My Work'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Tasks</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            {canViewAll
              ? 'Monitor tasks across all companies and assign new work to active employees.'
              : 'Your assigned tasks, progress notes and status — tap a card for details.'}
          </p>
        </div>
        <button hidden={!canAction(user?.perms, 'tasks', 'add')} onClick={() => setShowForm(!showForm)} className="flex shrink-0 items-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:self-auto">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Task
        </button>
      </div>

      {/* Search tasks */}
      <div className="relative w-full sm:max-w-xs">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input
          value={taskQuery}
          onChange={(e) => setTaskQuery(e.target.value)}
          placeholder="Search tasks, assignee…"
          aria-label="Search tasks"
          className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-9 text-sm transition placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
        />
        {taskQuery && (
          <button type="button" onClick={() => setTaskQuery('')} aria-label="Clear task search" className="touch-44 absolute right-1 top-1/2 -translate-y-1/2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      {tq && (
        <p className="text-xs text-gray-500">{visibleTasks.length} of {scopedTasks.length} tasks match “{taskQuery.trim()}”.</p>
      )}

      {/* Task progress summary — single column on phones so counts never squeeze */}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['Total tasks', scopedTasks.length, 'bg-gray-50 text-gray-700'],
          ['Completed', counts.completed || 0, 'bg-emerald-50 text-emerald-700'],
          ['In progress', counts.inprogress || 0, 'bg-amber-50 text-amber-700'],
          ['Pending', counts.pending || 0, 'bg-brand-50 text-brand-700'],
          ['Overdue', overdue, overdue > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'],
        ].map(([label, value, tone]) => (
          <div key={label} className={`rounded-xl border border-gray-200 ${tone} p-4 shadow-sm`}>
            <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-700">Overall completion</span>
          <span className="font-bold tabular-nums text-brand-700">{completionPct}%</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-2.5 rounded-full bg-brand-500 transition-all" style={{ width: `${completionPct}%` }} />
        </div>
      </div>

      {showForm && (
        <form onSubmit={addTask} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
          <input
            autoFocus
            placeholder="Task title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={`${inputCls} lg:col-span-2`}
            required
          />
          <select
            required
            value={form.assignee}
            onChange={(e) => setForm({ ...form, assignee: e.target.value })}
            className={inputCls}
          >
            <option value="" disabled>Assign to employee…</option>
            {assignableEmployees.map((emp) => (
              <option key={emp.email} value={`${emp.name} (${emp.companyName})`}>
                {emp.name} — {emp.role}, {emp.companyName}
              </option>
            ))}
          </select>
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            className={inputCls}
          >
            {Object.keys(priorityStyles).map((p) => <option key={p}>{p}</option>)}
          </select>
          <div className="flex gap-2">
            <input
              type="date"
              value={form.due}
              onChange={(e) => setForm({ ...form, due: e.target.value })}
              className={`${inputCls} w-full`}
            />
            <button type="submit" className="shrink-0 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Add</button>
          </div>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {columns.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.id) }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={() => drop(col.id)}
            className={`flex min-h-[300px] flex-col gap-3 rounded-xl border p-4 transition-colors ${
              overCol === col.id ? 'border-brand-400 bg-brand-50/60' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">{col.label}</h2>
              <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-bold text-gray-600">{counts[col.id]}</span>
            </div>

            {visibleTasks.filter((t) => t.status === col.id).map((task) => {
              const dueKey = String(task.due || '').slice(0, 10)
              const todayKey = new Date().toISOString().slice(0, 10)
              const isOverdue = !!dueKey && dueKey < todayKey && task.status !== 'completed'
              const noteCount = notesList(task.notes).length
              return (
              <div
                key={task.id}
                draggable
                onDragStart={() => setDragId(task.id)}
                onDragEnd={() => { setDragId(null); setOverCol(null) }}
                className={`group cursor-grab rounded-xl border bg-white p-4 shadow-sm transition active:cursor-grabbing hover:shadow-md ${
                  dragId === task.id ? 'opacity-40' : ''
                } ${isOverdue ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-500 line-through' : isOverdue ? 'text-red-800' : 'text-gray-900'}`}>
                    {task.title}
                  </h3>
                  <span className="flex shrink-0 items-center gap-1">
                    {isOverdue && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Overdue</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityStyles[task.priority]}`}>{task.priority}</span>
                  </span>
                  {((task.workSeconds || 0) > 0 || workRunning(task)) && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${workRunning(task) ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-600'}`}>
                      {workRunning(task) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
                      ⏱ {fmtWorked(workElapsedMs(task, now))}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                      {(task.assignee || '?').split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </span>
                    <span className="truncate" title={task.assignee || 'Unassigned'}>{task.assignee || 'Unassigned'}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${isOverdue ? 'font-semibold text-red-700' : ''}`}>Due {task.due || '—'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => { setViewingTask(task); setNoteInput('') }}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600 transition hover:border-brand-300 hover:text-brand-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8m-8 4h5m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Progress{noteCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{noteCount}</span>}
                  </button>
                  {canAction(user?.perms, 'tasks', 'delete') && (
                    <button
                      type="button"
                      onClick={() => deleteTask(task.id)}
                      aria-label={`Remove task ${task.title}`}
                      className="inline-flex min-h-[44px] items-center text-[11px] font-medium text-red-500 hover:text-red-600 sm:hidden sm:group-hover:inline-flex"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              )
            })}

            {visibleTasks.filter((t) => t.status === col.id).length === 0 && (
              <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                {tq ? 'No matching tasks — clear the search.' : 'Drop tasks here'}
              </div>
            )}
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {canViewAll
              ? `Staff task progress (${shownStaff.filter((e) => e.active !== false).length} active staff)`
              : 'My task progress'}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">CEO and administrators are excluded — they have no tasks to finish.</p>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-2">Employee</th>
              <th className="px-5 py-2">Company</th>
              <th className="hidden px-5 py-2 sm:table-cell">Role</th>
              <th className="px-5 py-2">Status</th>
              <th className="px-5 py-2">Task progress</th>
              <th className="px-5 py-2">Time on tasks</th>
              {canTransfer && <th className="px-5 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shownStaff.map((emp) => {
              // Match by normalized assignee email when available (accurate),
              // falling back to the "Name (Company)" display string.
              const assigned = tasks.filter((t) =>
                t.assigneeEmail ? t.assigneeEmail === emp.email : t.assignee && t.assignee.startsWith(`${emp.name} (${emp.companyName})`))
              const done = assigned.filter((t) => t.status === 'completed').length
              const active = assigned.filter((t) => t.status !== 'completed').length
              const pct = assigned.length ? Math.round((done / assigned.length) * 100) : 0
              return (
                <tr key={`${emp.companyId}-${emp.email}`} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-500">{emp.email}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{emp.companyName}</td>
                  <td className="hidden px-5 py-3 text-gray-600 sm:table-cell">{emp.role}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                      emp.active !== false ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${emp.active !== false ? 'bg-brand-500' : 'bg-gray-400'}`} />
                      {emp.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular-nums text-xs text-gray-600">{pct}%</span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 tabular-nums">{done}/{assigned.length} completed · {active} open</p>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-gray-700">
                    {fmtHMS(assigned.reduce((sum, t) => sum + workElapsedMs(t, now), 0))}
                  </td>
                  {canTransfer && (
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openTransfer(emp)}
                        disabled={active === 0}
                        title={active === 0 ? `${emp.name} has no active tasks to transfer` : `Transfer ${emp.name}'s active tasks to another employee`}
                        className="inline-flex min-h-[44px] items-center rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Transfer
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
            {shownStaff.length === 0 && (
              <tr><td colSpan={canTransfer ? 7 : 6} className="px-5 py-8 text-center text-xs text-gray-400">No staff found — add employees in People.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>

      {/* Task detail + work progress notes */}
      {viewingTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={() => setViewingTask(null)}>
          <div className="absolute inset-0 bg-gray-900/50" />
          <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-brand-600 to-emerald-400" />
            <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:px-6">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-gray-900">{viewingTask.title}</h3>
                <p className="mt-0.5 truncate text-xs text-gray-500">{viewingTask.assignee} · Priority {viewingTask.priority} · Due {viewingTask.due || '—'}</p>
              </div>
              <button onClick={() => setViewingTask(null)} aria-label="Close details" className="touch-44 shrink-0 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5 pt-3 sm:px-6">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Status</span>
              {columns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setTaskStatus(viewingTask.id, c.id)}
                  className={`inline-flex min-h-[44px] items-center rounded-full px-4 py-1.5 text-xs font-semibold transition ${viewingTask.status === c.id ? 'bg-brand-600 text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-700'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* (69) Due-date editor — CEO / managers (admin-controlled via Tasks → edit) */}
            {canEditDue && (
              <div className="px-5 pt-3 sm:px-6">
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3.5 py-2.5 ring-1 ring-gray-100">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Due date</span>
                  {dueEditId === viewingTask.id ? (
                    <>
                      <input
                        type="date"
                        value={dueEditVal}
                        onChange={(e) => setDueEditVal(e.target.value)}
                        aria-label="New due date"
                        className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      />
                      <button type="button" onClick={() => setTaskDue(viewingTask.id, dueEditVal)} className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Save</button>
                      <button type="button" onClick={() => setDueEditId(null)} className="inline-flex min-h-[44px] items-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className={`text-sm font-bold tabular-nums ${viewingTask.due ? 'text-gray-900' : 'text-gray-400'}`}>{viewingTask.due || 'No due date'}</span>
                      <button type="button" onClick={() => { setDueEditId(viewingTask.id); setDueEditVal(String(viewingTask.due || '').slice(0, 10)) }} className="inline-flex min-h-[44px] items-center rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">Change</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Work log (63) — time consumption and sessions for this task */}
            <div className="px-5 pt-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3.5 py-2.5 ring-1 ring-gray-100">
                <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <span className={`h-2 w-2 rounded-full ${workRunning(viewingTask) ? 'animate-pulse bg-emerald-500' : 'bg-gray-300'}`} />
                  {workRunning(viewingTask) ? 'Working now' : 'Time consumed'}
                </span>
                <span className="text-sm font-bold tabular-nums text-gray-900">{fmtHMS(workElapsedMs(viewingTask, now))}</span>
              </div>
              {/* (72) Time consumed broken down per calendar day */}
              {((viewingTask.workLog || []).length > 0 || workRunning(viewingTask)) && (
                <div className="mt-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Time consumed by day</p>
                  <ol className="mt-1.5 space-y-1">
                    {taskTimeByDay(viewingTask, now).map((d) => (
                      <li key={d.date} className="flex flex-wrap items-baseline justify-between gap-1 rounded-lg bg-white px-3 py-1.5 text-[11px] ring-1 ring-gray-100">
                        <span className="font-medium tabular-nums text-gray-600">{dayLabel(d.date)}</span>
                        <span className="font-bold tabular-nums text-gray-900">{fmtHMS(d.seconds * 1000)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {(viewingTask.workLog || []).length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Work sessions ({viewingTask.workLog.length})</p>
                  <ol className="mt-1.5 space-y-1">
                    {[...viewingTask.workLog].reverse().map((s, i) => (
                      <li key={i} className="flex flex-wrap items-baseline justify-between gap-1 rounded-lg bg-white px-3 py-1.5 text-[11px] ring-1 ring-gray-100">
                        <span className="tabular-nums text-gray-500">
                          {s.start ? new Date(s.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          {' → '}
                          {s.end ? new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                        <span className="font-semibold tabular-nums text-gray-800">{fmtHMS((s.seconds || 0) * 1000)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Work progress ({notesList(viewingTask.notes).length})</p>
              {notesList(viewingTask.notes).length === 0 ? (
                <p className="mt-2 rounded-xl border-2 border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                  No progress notes yet — add the first update below.
                </p>
              ) : (
                <ol className="mt-2 space-y-3">
                  {[...notesList(viewingTask.notes)].reverse().map((n, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                        {String(n.by || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                        <p className="flex flex-wrap items-baseline justify-between gap-1">
                          <span className="text-xs font-semibold text-gray-900">{n.by}</span>
                          <span className="text-[10px] tabular-nums text-gray-400">
                            {n.at ? new Date(n.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-gray-600">{n.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="border-t border-gray-100 px-5 py-3 sm:px-6">
              <div className="flex gap-2">
                <input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote() } }}
                  placeholder="Add a progress update…"
                  aria-label="Add a progress update"
                  maxLength={1000}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                />
                <button
                  type="button"
                  onClick={addNote}
                  disabled={!noteInput.trim() || noteSaving}
                  className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                >
                  {noteSaving ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* (70) Task transfer dialog — hand an employee's active tasks to someone else */}
      {transferEmp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={() => !transferBusy && setTransferEmp(null)}>
          <div className="absolute inset-0 bg-gray-900/50" />
          <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 text-gray-900 shadow-xl sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">Transfer tasks from {transferEmp.name}</h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Pick who takes over the selected active tasks — e.g. before deactivating {transferEmp.name}.
            </p>
            <label className="mt-4 block text-xs font-medium text-gray-700">
              Transfer to
              <select
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">Select employee…</option>
                {employees
                  .filter((e2) => (e2.email || '').toLowerCase() !== (transferEmp.email || '').toLowerCase() && e2.active !== false)
                  .map((e2) => <option key={e2.email} value={e2.email}>{e2.name}</option>)}
              </select>
            </label>
            <div className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Active tasks ({transferSel.size} selected)</p>
              <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {tasks
                  .filter((t) => (t.assigneeEmail ? t.assigneeEmail === transferEmp.email : t.assignee && t.assignee.startsWith(`${transferEmp.name} (${transferEmp.companyName})`)) && t.status !== 'completed')
                  .map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                      <input type="checkbox" checked={transferSel.has(t.id)} onChange={() => toggleTransferTask(t.id)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800">{t.title}</span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase text-gray-400">{t.priority}</span>
                    </label>
                  ))}
              </div>
            </div>
            {transferMsg && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-200">{transferMsg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setTransferEmp(null)} disabled={transferBusy} className="min-h-[44px] rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={confirmTransfer}
                disabled={!transferTo || transferSel.size === 0 || transferBusy}
                className="min-h-[44px] rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50"
              >
                {transferBusy ? 'Transferring…' : `Transfer ${transferSel.size} task${transferSel.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmployeeTasks({ name }) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title:'', priority:'Medium', due:'' })
  const [companyName, setCompanyName] = useState('')
  const [detailTask, setDetailTask] = useState(null)
  const [workNotes, setWorkNotes] = useState('')
  const [attachName, setAttachName] = useState('')
  const [attachData, setAttachData] = useState(null)
  // Live clock for work-log timers — only ticks while a session is running.
  const now = useTicker(tasks.some(workRunning))

  // Work-log timer (63) — start/stop the assignee's session. The server
  // computes and stores elapsed time; falls back to local state when offline.
  const setWorkTimer = async (task) => {
    const action = workRunning(task) ? 'stop' : 'start'
    if (apiEnabled()) {
      try {
        const updated = await api(`/api/tasks/${task.id}/work-log/${action}`, { method: 'POST' })
        setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...updated } : t)))
        setDetailTask((d) => (d && d.id === task.id ? { ...d, ...updated } : d))
        return
      } catch { /* offline — apply locally below */ }
    }
    const local = applyLocalTimer(task, action)
    setTasks((ts) => ts.map((t) => (t.id === task.id ? local : t)))
    setDetailTask((d) => (d && d.id === task.id ? local : d))
  }

  useEffect(() => {
    if (apiEnabled()) {
      api('/api/tasks')
        .then((res) => {
          // /api/tasks returns a paginated envelope { data, total } — unwrap it.
          const all = Array.isArray(res) ? res : (res.data || [])
          setTasks(all.filter((t) => (t.assigneeEmail ? t.assigneeEmail === user?.email : t.assignee && t.assignee.startsWith(`${name} (`))))
        })
        .catch(() => setTasks(loadLocalMyTasks(name)))
      api('/api/companies').then((cs)=>{
        const list = Array.isArray(cs) ? cs : (cs.data || [])
        const c = list.find((co)=> (co.employees||[]).some((e)=> e.email.toLowerCase()=== (user?.email||'').toLowerCase()))
        if (c) { setCompanyName(c.name) }
      }).catch(()=>{})
    } else {
      setTasks(loadLocalMyTasks(name))
    }
  }, [name, user?.email])

  const drop = async (status) => {
    if (dragId == null) return
    setTasks((t) => t.map((task) => (task.id === dragId ? { ...task, status } : task)))
    if (apiEnabled()) {
      // Server notifies CEO/managers of the status change — no client call needed.
      await api(`/api/tasks/${dragId}`, { method: 'PUT', body: { status } }).catch(() => {})
    }
    setDragId(null)
    setOverCol(null)
  }

  const acceptTask = async (id) => {
    setTasks((t)=> t.map((x)=> x.id===id ? {...x, status:'inprogress'} : x))
    if (apiEnabled()) await api(`/api/tasks/${id}`, {method:'PUT', body:{status:'inprogress'}}).catch(()=>{})
  }
  const declineTask = async (id) => {
    setTasks((t)=> t.map((x)=> x.id===id ? {...x, status:'declined'} : x))
    if (apiEnabled()) await api(`/api/tasks/${id}`, {method:'PUT', body:{status:'declined'}}).catch(()=>{})
  }
  // Work progress notes share the array model [{at, by, text}] with the
  // monitoring board; legacy plain-string notes convert on first save.
  const openDetail = (task) => {
    setDetailTask(task)
    setWorkNotes('')
    setAttachName(task.attachName || '')
  }
  const saveWork = async () => {
    if (!detailTask) return
    const existing = notesList(detailTask.notes)
    const entry = workNotes.trim()
      ? [{ text: workNotes.trim(), by: user?.name || user?.email || 'Someone', at: new Date().toISOString() }]
      : []
    const next = [...existing, ...entry]
    const updates = { status: detailTask.status, notes: next, attachName: attachName || null, attachData: attachData || null }
    setTasks((ts)=> ts.map((t)=> t.id===detailTask.id ? {...t, ...updates} : t))
    if (apiEnabled()) {
      await api(`/api/tasks/${detailTask.id}`, {method:'PUT', body:{ status: detailTask.status, notes: next }}).catch(()=>{})
    }
    setDetailTask(null)
  }

  const canAdd = canAction(user?.perms, 'tasks', 'add')
  const addTask = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    const payload = { title: form.title.trim(), assignee: `${name} (${companyName || user?.companyName || 'Company'})`, priority: form.priority, due: form.due || '', status: 'pending' }
    if (apiEnabled()) {
      try {
        const c = await api('/api/tasks', { method: 'POST', body: payload })
        setTasks((p)=> [...p, c])
      } catch { setTasks((p)=> [...p, { ...payload, id: Date.now() }]) }
    } else {
      setTasks((p)=> [...p, { ...payload, id: Date.now() }])
    }
    setForm({ title:'', priority:'Medium', due:'' })
    setShowAdd(false)
  }

  const filtered = tasks.filter((t) => {
    const q = query.toLowerCase()
    const matchesQuery = !q || t.title.toLowerCase().includes(q) || (t.due || '').toLowerCase().includes(q)
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter
    return matchesQuery && matchesPriority
  })
  const counts = {
    pending: filtered.filter((t) => t.status === 'pending').length,
    inprogress: filtered.filter((t) => t.status === 'inprogress').length,
    completed: filtered.filter((t) => t.status === 'completed').length,
  }
  const declinedCount = filtered.filter((t)=> t.status==='declined').length
  const total = filtered.length
  const progress = total ? Math.round((counts.completed / total) * 100) : 0
  const overdue = filtered.filter((t) => t.due && t.status !== 'completed' && t.status !== 'declined' && new Date(t.due) < new Date(new Date().setHours(0,0,0,0))).length

  const dueBadge = (due, status) => {
    if (!due) return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">No due date</span>
    const d = new Date(due)
    const today = new Date(); today.setHours(0,0,0,0)
    const isOverdue = d < today && status !== 'completed' && status !== 'declined'
    const isToday = d.getTime() === today.getTime()
    const isSoon = !isOverdue && !isToday && (d - today) / 86400000 <= 2
    if (isOverdue) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Overdue · {due}</span>
    if (isToday) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Due today · {due}</span>
    if (isSoon) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Due soon · {due}</span>
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">Due {due}</span>
  }

  const priorityAccent = { Urgent:'border-l-red-500', High:'border-l-orange-500', Medium:'border-l-brand-500', Low:'border-l-gray-300' }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">My Tasks</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Drag cards to update progress — your changes save automatically.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={query} onChange={(e)=>setQuery(e.target.value)} type="search" placeholder="Search tasks…" aria-label="Search tasks" className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/10 sm:w-52" />
          </div>
          <select value={priorityFilter} onChange={(e)=>setPriorityFilter(e.target.value)} aria-label="Filter by priority" className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-300 focus:outline-none">
            <option value="all">All priorities</option>
            {Object.keys(priorityStyles).map((p)=><option key={p} value={p}>{p}</option>)}
          </select>
          {canAdd && (
            <button onClick={()=>setShowAdd(!showAdd)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              New Task
            </button>
          )}
        </div>
      </div>

      {showAdd && canAdd && (
        <form onSubmit={addTask} className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-4">
            <input autoFocus placeholder="Task title *" value={form.title} onChange={(e)=>setForm({...form, title:e.target.value})} required className="sm:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/10" />
            <select value={form.priority} onChange={(e)=>setForm({...form, priority:e.target.value})} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {Object.keys(priorityStyles).map((p)=><option key={p}>{p}</option>)}
            </select>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="date" value={form.due} onChange={(e)=>setForm({...form, due:e.target.value})} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white sm:flex-none">Add</button>
                <button type="button" onClick={()=>setShowAdd(false)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm sm:flex-none">Cancel</button>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-900">{total} tasks</span>
            <span className="hidden h-4 w-px bg-gray-200 sm:block" />
            <span className="text-xs text-gray-500">{counts.pending} pending · {counts.inprogress} in progress · {counts.completed} completed</span>
            {overdue>0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">{overdue} overdue</span>}
            {declinedCount>0 && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{declinedCount} declined</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100 sm:w-32">
              <div className="h-full bg-gradient-to-r from-brand-600 to-emerald-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-gray-700">{progress}%</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {columns.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.id) }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={() => drop(col.id)}
            className={`flex min-h-[360px] flex-col gap-3 rounded-xl border p-4 transition-colors ${
              overCol === col.id ? 'border-brand-400 bg-brand-50/60 shadow-inner' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-700">
                <span className={`h-2 w-2 rounded-full ${col.id==='pending'?'bg-gray-400':col.id==='inprogress'?'bg-amber-500':'bg-emerald-500'}`} />
                {col.label}
              </h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${counts[col.id] ? 'bg-white text-gray-700 ring-1 ring-gray-200' : 'bg-gray-100 text-gray-400'}`}>{counts[col.id]}</span>
            </div>

            {(col.id==='pending' ? filtered.filter((t)=> t.status==='pending' || t.status==='declined') : filtered.filter((t)=> t.status===col.id)).map((task) => (
              <div
                key={task.id}
                draggable={task.status!=='declined'}
                onDragStart={() => setDragId(task.id)}
                onDragEnd={() => { setDragId(null); setOverCol(null) }}
                className={`group rounded-xl border-l-4 bg-white p-4 shadow-sm transition hover:shadow-md ${priorityAccent[task.priority] || 'border-l-gray-300'} ${dragId === task.id ? 'opacity-40 scale-[0.98]' : ''} ${task.status==='declined' ? 'opacity-60 bg-gray-50' : 'cursor-grab active:cursor-grabbing'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-sm font-semibold leading-snug ${task.status === 'completed' ? 'text-gray-400 line-through' : task.status==='declined' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {task.title}
                  </h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${task.status==='declined' ? 'bg-gray-200 text-gray-600' : priorityStyles[task.priority]}`}>{task.status==='declined' ? 'Declined' : task.priority}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {dueBadge(task.due, task.status)}
                  {notesList(task.notes).length > 0 && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-100">
                      {notesList(task.notes).length} note{notesList(task.notes).length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {((task.workSeconds || 0) > 0 || workRunning(task)) && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${workRunning(task) ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-600'}`}>
                      {workRunning(task) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
                      ⏱ {fmtWorked(workElapsedMs(task, now))}
                    </span>
                  )}
                </div>
                {col.id==='pending' && task.status==='pending' && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={()=>acceptTask(task.id)} className="min-h-[44px] flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Accept</button>
                    <button onClick={()=>declineTask(task.id)} className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Decline</button>
                  </div>
                )}
                {col.id==='inprogress' && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-700">
                        <span className={`h-2 w-2 rounded-full ${workRunning(task) ? 'animate-pulse bg-emerald-500' : 'bg-gray-300'}`} />
                        {workRunning(task) ? 'Working now' : 'Timer stopped'}
                      </span>
                      <span className="tabular-nums text-[11px] font-bold text-gray-900">{fmtHMS(workElapsedMs(task, now))}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>setWorkTimer(task)} className={`min-h-[44px] flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${workRunning(task) ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                        {workRunning(task) ? 'Stop work' : 'Start work'}
                      </button>
                      <button onClick={()=>openDetail(task)} className="min-h-[44px] flex-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">View / Attach</button>
                    </div>
                    {task.attachName && <p className="text-[11px] text-emerald-600">📎 {task.attachName}</p>}
                  </div>
                )}
                {col.id==='completed' && (
                  <p className="mt-2 rounded-lg bg-gray-50 px-3 py-1.5 text-[11px] font-semibold tabular-nums text-gray-700 ring-1 ring-gray-100">
                    Time consumed: {fmtHMS(workElapsedMs(task, now))}
                  </p>
                )}
                {col.id==='completed' && task.attachName && <p className="mt-2 text-[11px] text-emerald-600">📎 {task.attachName}</p>}
                {task.status!=='declined' && col.id!=='pending' && <p className="mt-2 text-[11px] text-gray-400">Drag to move →</p>}
              </div>
            ))}

            {(col.id==='pending' ? filtered.filter((t)=> t.status==='pending' || t.status==='declined').length===0 : filtered.filter((t) => t.status === col.id).length === 0) && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-white/60 p-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100"><svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg></div>
                <p className="text-sm font-medium text-gray-500">No tasks</p>
                <p className="text-xs text-gray-400">Drop tasks here</p>
              </div>
            )}
          </div>
        ))}
      </div>
      {detailTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={()=>setDetailTask(null)}>
          <div className="absolute inset-0 bg-gray-900/50" />
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-2xl" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-gray-900">{detailTask.title}</h3>
                <p className="mt-1 truncate text-xs text-gray-500">Due {detailTask.due || '—'} · {detailTask.priority}</p>
              </div>
              <button onClick={()=>setDetailTask(null)} aria-label="Close details" className="touch-44 shrink-0 rounded-lg text-gray-400 hover:bg-gray-100"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            {/* Work log timer (63) — start/stop work sessions on this task */}
            <div className="mt-4 rounded-xl bg-gray-50 px-3.5 py-3 ring-1 ring-gray-100">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <span className={`h-2 w-2 rounded-full ${workRunning(detailTask) ? 'animate-pulse bg-emerald-500' : 'bg-gray-300'}`} />
                  {workRunning(detailTask) ? 'Working now' : 'Time consumed'}
                </span>
                <span className="text-sm font-bold tabular-nums text-gray-900">{fmtHMS(workElapsedMs(detailTask, now))}</span>
              </div>
              {detailTask.status !== 'completed' && detailTask.status !== 'declined' && (
                <button
                  type="button"
                  onClick={() => setWorkTimer(detailTask)}
                  className={`mt-2 min-h-[44px] w-full rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${workRunning(detailTask) ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {workRunning(detailTask) ? 'Stop work' : 'Start work'}
                </button>
              )}
              {/* (72) Time consumed broken down per calendar day */}
              {((detailTask.workLog || []).length > 0 || workRunning(detailTask)) && (
                <div className="mt-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Time consumed by day</p>
                  <ol className="mt-1.5 space-y-1">
                    {taskTimeByDay(detailTask, now).map((d) => (
                      <li key={d.date} className="flex flex-wrap items-baseline justify-between gap-1 rounded-lg bg-white px-3 py-1.5 text-[11px] ring-1 ring-gray-100">
                        <span className="font-medium tabular-nums text-gray-600">{dayLabel(d.date)}</span>
                        <span className="font-bold tabular-nums text-gray-900">{fmtHMS(d.seconds * 1000)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {(detailTask.workLog || []).length > 0 && (
                <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Work sessions ({detailTask.workLog.length})</p>
              )}
              {(detailTask.workLog || []).length > 0 && (
                <ol className="mt-2 space-y-1">
                  {[...detailTask.workLog].reverse().map((s, i) => (
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-1 rounded-lg bg-white px-3 py-1.5 text-[11px] ring-1 ring-gray-100">
                      <span className="tabular-nums text-gray-500">
                        {s.start ? new Date(s.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        {' → '}
                        {s.end ? new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                      <span className="font-semibold tabular-nums text-gray-800">{fmtHMS((s.seconds || 0) * 1000)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {notesList(detailTask.notes).length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Progress ({notesList(detailTask.notes).length})</p>
                <ol className="mt-2 space-y-2.5">
                  {[...notesList(detailTask.notes)].reverse().map((n, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                        {String(n.by || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                        <p className="flex flex-wrap items-baseline justify-between gap-1">
                          <span className="text-xs font-semibold text-gray-900">{n.by}</span>
                          <span className="text-[10px] tabular-nums text-gray-400">
                            {n.at ? new Date(n.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-gray-600">{n.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-700">Add work progress / notes</label>
              <textarea value={workNotes} onChange={(e)=>setWorkNotes(e.target.value)} rows={4} maxLength={1000} placeholder="List down work done, checklist, etc." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-700">Attach document (pdf, doc, xls, image)</label>
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e)=>{
                const f=e.target.files?.[0]; if(!f) return
                if(f.size>5*1024*1024){ alert('Max 5MB'); return }
                const reader=new FileReader(); reader.onload=()=>{ setAttachData(reader.result); setAttachName(f.name) }; reader.readAsDataURL(f)
              }} className="mt-1 w-full text-sm" />
              {attachName && <p className="mt-1 text-xs text-emerald-600">Selected: {attachName}</p>}
              {detailTask.attachName && !attachName && <p className="mt-1 text-xs text-gray-500">Current: {detailTask.attachName}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={()=>setDetailTask(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
              <button onClick={saveWork} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
