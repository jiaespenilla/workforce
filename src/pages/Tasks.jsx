import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, apiEnabled } from '../lib/api'
import TaskMonitoring from './TaskMonitoring'

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

export default function Tasks() {
  usePageTitle('Tasks')
  const { user } = useAuth()
  return user?.role === 'ceo' ? <TaskMonitoring /> : <EmployeeTasks name={user?.name || ''} />
}

function EmployeeTasks({ name }) {
  const [tasks, setTasks] = useState([])
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)

  useEffect(() => {
    if (apiEnabled()) {
      api('/api/tasks')
        .then((all) => setTasks(all.filter((t) => t.assignee && t.assignee.startsWith(`${name} (`))))
        .catch(() => setTasks(loadLocalMyTasks(name)))
    } else {
      setTasks(loadLocalMyTasks(name))
    }
  }, [name])

  const drop = async (status) => {
    if (dragId == null) return
    setTasks((t) => t.map((task) => (task.id === dragId ? { ...task, status } : task)))
    if (apiEnabled()) {
      await api(`/api/tasks/${dragId}`, { method: 'PUT', body: { status } }).catch(() => {})
    }
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">My Tasks</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Tasks assigned to you. Drag cards between columns to update progress.</p>
        </div>
      </div>

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
                  <h3 className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                    {task.title}
                  </h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${priorityStyles[task.priority]}`}>{task.priority}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500 tabular-nums">Due {task.due || '—'}</p>
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
    </div>
  )
}
