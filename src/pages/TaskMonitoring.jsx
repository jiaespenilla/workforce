import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { canAction } from '../lib/roles'
import { api, apiEnabled } from '../lib/api'

const columns = [
  { id: 'pending', label: 'Pending' },
  { id: 'inprogress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
]

function loadLocalTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_ceo_tasks'))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

const priorityStyles = {
  Urgent: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-brand-50 text-brand-700',
  Low: 'bg-gray-100 text-gray-600',
}

export default function TaskMonitoring() {
  const { user } = useAuth()
  usePageTitle('Task Monitoring')
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

  // Append a work-progress note. The server stamps author/time and caps length.
  const addNote = async () => {
    const text = noteInput.trim()
    if (!viewingTask || !text || noteSaving) return
    setNoteSaving(true)
    const entry = { text, by: user?.name || user?.email || 'Someone', at: new Date().toISOString() }
    const next = [...(viewingTask.notes || []), entry]
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
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{canViewAll ? 'CEO Overview' : 'My Work'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Task Monitoring</h1>
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
          <button type="button" onClick={() => setTaskQuery('')} aria-label="Clear task search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      {tq && (
        <p className="text-xs text-gray-500">{visibleTasks.length} of {scopedTasks.length} tasks match “{taskQuery.trim()}”.</p>
      )}

      {/* Task progress summary — accurate, computed from the live task list */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['Total tasks', tasks.length, 'bg-gray-50 text-gray-700'],
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
              const overdue = !!dueKey && dueKey < todayKey && task.status !== 'completed'
              return (
              <div
                key={task.id}
                draggable
                onDragStart={() => setDragId(task.id)}
                onDragEnd={() => { setDragId(null); setOverCol(null) }}
                className={`group cursor-grab rounded-xl border bg-white p-4 shadow-sm transition active:cursor-grabbing hover:shadow-md ${
                  dragId === task.id ? 'opacity-40' : ''
                } ${overdue ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-500 line-through' : overdue ? 'text-red-800' : 'text-gray-900'}`}>
                    {task.title}
                  </h3>
                  <span className="flex shrink-0 items-center gap-1">
                    {overdue && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Overdue</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityStyles[task.priority]}`}>{task.priority}</span>
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                      {(task.assignee || '?').split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </span>
                    <span className="truncate" title={task.assignee || 'Unassigned'}>{task.assignee || 'Unassigned'}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${overdue ? 'font-semibold text-red-700' : ''}`}>Due {task.due || '—'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setViewingTask(task); setNoteInput('') }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-600 transition hover:border-brand-300 hover:text-brand-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8m-8 4h5m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Progress{(task.notes || []).length > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{(task.notes || []).length}</span>}
                  </button>
                  {canAction(user?.perms, 'tasks', 'delete') && (
                    <button
                      type="button"
                      onClick={() => deleteTask(task.id)}
                      className="hidden text-[11px] font-medium text-red-500 hover:text-red-600 group-hover:block"
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
                </tr>
              )
            })}
            {shownStaff.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-xs text-gray-400">No staff found — add employees in People.</td></tr>
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
              <button onClick={() => setViewingTask(null)} aria-label="Close details" className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
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
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${viewingTask.status === c.id ? 'bg-brand-600 text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-700'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Work progress ({(viewingTask.notes || []).length})</p>
              {(viewingTask.notes || []).length === 0 ? (
                <p className="mt-2 rounded-xl border-2 border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                  No progress notes yet — add the first update below.
                </p>
              ) : (
                <ol className="mt-2 space-y-3">
                  {[...(viewingTask.notes || [])].reverse().map((n, i) => (
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
    </div>
  )
}
