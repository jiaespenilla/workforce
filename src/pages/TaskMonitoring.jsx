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
  const tq = taskQuery.trim().toLowerCase()
  const visibleTasks = tq
    ? tasks.filter((t) => [t.title, t.assignee, t.priority, t.due, t.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(tq)))
    : tasks

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

  const counts = Object.fromEntries(columns.map((c) => [c.id, tasks.filter((t) => t.status === c.id).length]))
  const overdue = tasks.filter((t) => t.due && t.status !== 'completed' && new Date(t.due) < new Date(new Date().toDateString())).length
  const completionPct = tasks.length ? Math.round(((counts.completed || 0) / tasks.length) * 100) : 0

  const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">CEO Overview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Task Monitoring</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            Monitor tasks across all companies and assign new work to active employees.
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
        <p className="text-xs text-gray-500">{visibleTasks.length} of {tasks.length} tasks match “{taskQuery.trim()}”.</p>
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
            {activeEmployees.map((emp) => (
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
                {canAction(user?.perms, 'tasks', 'delete') && (
                  <button
                    type="button"
                    onClick={() => deleteTask(task.id)}
                    className="mt-2 hidden text-[11px] font-medium text-red-500 hover:text-red-600 group-hover:block"
                  >
                    Remove task
                  </button>
                )}
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
          <h2 className="text-sm font-semibold text-gray-900">Staff task progress ({staffList.filter((e) => e.active !== false).length} active staff)</h2>
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
            {staffList.map((emp) => {
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
            {staffList.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-xs text-gray-400">No staff found — add employees in People.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  )
}
