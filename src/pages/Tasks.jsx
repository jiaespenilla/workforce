import { useState } from 'react'

const columns = [
  { id: 'pending', label: 'Pending' },
  { id: 'inprogress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
]

const initialTasks = [
  { id: 1, title: 'Draft Q3 financial report', assignee: 'Sarah Chen', priority: 'High', due: 'Aug 28', status: 'pending' },
  { id: 2, title: 'Update onboarding checklist', assignee: 'Ana Reyes', priority: 'Medium', due: 'Sep 02', status: 'pending' },
  { id: 3, title: 'Fix payroll tax calculation bug', assignee: 'Miguel Torres', priority: 'Urgent', due: 'Aug 26', status: 'inprogress' },
  { id: 4, title: 'Interview candidates — Support role', assignee: 'Sarah Chen', priority: 'Medium', due: 'Sep 05', status: 'inprogress' },
  { id: 5, title: 'Deploy attendance kiosk v2', assignee: 'Dev Team', priority: 'High', due: 'Aug 22', status: 'completed' },
  { id: 6, title: 'Quarterly performance reviews', assignee: 'HR Manager', priority: 'Low', due: 'Sep 15', status: 'completed' },
]

const priorityStyles = {
  Urgent: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-brand-50 text-brand-700',
  Low: 'bg-gray-100 text-gray-600',
}

export default function Tasks() {
  const [tasks, setTasks] = useState(initialTasks)
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', assignee: '', priority: 'Medium', due: '' })

  const addTask = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setTasks((t) => [...t, { ...form, id: Date.now(), status: 'pending' }])
    setForm({ title: '', assignee: '', priority: 'Medium', due: '' })
    setShowForm(false)
  }

  const drop = (status) => {
    if (dragId == null) return
    setTasks((t) => t.map((task) => (task.id === dragId ? { ...task, status } : task)))
    setDragId(null)
    setOverCol(null)
  }

  const counts = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    inprogress: tasks.filter((t) => t.status === 'inprogress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Task Management</h1>
          <p className="mt-1 text-sm text-gray-500">Create, assign and organize team tasks. Drag cards between columns.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">
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
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 lg:col-span-2"
            required
          />
          <input
            placeholder="Assignee"
            value={form.assignee}
            onChange={(e) => setForm({ ...form, assignee: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {Object.keys(priorityStyles).map((p) => <option key={p}>{p}</option>)}
          </select>
          <div className="flex gap-2">
            <input
              type="date"
              value={form.due}
              onChange={(e) => setForm({ ...form, due: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
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
                className={`cursor-grab rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition active:cursor-grabbing hover:shadow-md ${
                  dragId === task.id ? 'opacity-40' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {task.title}
                  </h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${priorityStyles[task.priority]}`}>{task.priority}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                      {task.assignee.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </span>
                    {task.assignee}
                  </span>
                  <span className="tabular-nums">Due {task.due || '—'}</span>
                </div>
              </div>
            ))}

            {tasks.filter((t) => t.status === col.id).length === 0 && (
              <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400">
                Drop tasks here
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
