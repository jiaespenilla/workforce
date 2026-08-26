import { usePageTitle } from '../lib/documentMeta'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getScopedEmployees } from '../lib/companies'

const columns = [
  { id: 'pending', label: 'Pending' },
  { id: 'inprogress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
]

function loadTasks() {
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
  const [tasks, setTasks] = useState(loadTasks)
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', assignee: '', priority: 'Medium', due: '' })
  const employees = getScopedEmployees(user)
  const activeEmployees = employees.filter((e) => e.active !== false)

  const persist = (next) => {
    localStorage.setItem('uw_ceo_tasks', JSON.stringify(next))
    return next
  }

  const addTask = (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.assignee) return
    setTasks((t) => persist([...t, { ...form, id: Date.now(), status: 'pending' }]))
    setForm({ title: '', assignee: '', priority: 'Medium', due: '' })
    setShowForm(false)
  }

  const drop = (status) => {
    if (dragId == null) return
    setTasks((t) => persist(t.map((task) => (task.id === dragId ? { ...task, status } : task))))
    setDragId(null)
    setOverCol(null)
  }

  const deleteTask = (id) => setTasks((t) => persist(t.filter((task) => task.id !== id)))

  const counts = Object.fromEntries(columns.map((c) => [c.id, tasks.filter((t) => t.status === c.id).length]))

  const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">CEO Overview</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Task Monitoring</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor tasks across all companies and assign new work to active employees.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Task
        </button>
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

      <div className="grid gap-4 md:grid-cols-3">
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

            {tasks.filter((t) => t.status === col.id).map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={() => setDragId(task.id)}
                onDragEnd={() => { setDragId(null); setOverCol(null) }}
                className={`group cursor-grab rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition active:cursor-grabbing hover:shadow-md ${
                  dragId === task.id ? 'opacity-40' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                    {task.title}
                  </h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${priorityStyles[task.priority]}`}>{task.priority}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                      {task.assignee.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </span>
                    <span className="truncate" title={task.assignee}>{task.assignee}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">Due {task.due || '—'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  className="mt-2 hidden text-[11px] font-medium text-red-500 hover:text-red-600 group-hover:block"
                >
                  Remove task
                </button>
              </div>
            ))}

            {tasks.filter((t) => t.status === col.id).length === 0 && (
              <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500">
                Drop tasks here
              </div>
            )}
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Employees ({activeEmployees.length} active / {employees.length} total)</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-2">Employee</th>
              <th className="px-5 py-2">Company</th>
              <th className="px-5 py-2">Role</th>
              <th className="px-5 py-2">Status</th>
              <th className="px-5 py-2">Assigned tasks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.map((emp) => {
              const assigned = tasks.filter((t) => t.assignee.startsWith(`${emp.name} (${emp.companyName})`))
              return (
                <tr key={`${emp.companyId}-${emp.email}`} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-500">{emp.email}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{emp.companyName}</td>
                  <td className="px-5 py-3 text-gray-600">{emp.role}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                      emp.active !== false ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${emp.active !== false ? 'bg-brand-500' : 'bg-gray-400'}`} />
                      {emp.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-gray-600">{assigned.length}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
