import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, apiEnabled } from '../lib/api'
import { canAction } from '../lib/roles'
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
  const canManage = user?.role === 'ceo' || (user?.role !== 'administrator' && canAction(user?.perms, 'tasks', 'add'))
  return canManage ? <TaskMonitoring /> : <EmployeeTasks name={user?.name || ''} />
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
  const [companyId, setCompanyId] = useState('')
  const [detailTask, setDetailTask] = useState(null)
  const [workNotes, setWorkNotes] = useState('')
  const [attachName, setAttachName] = useState('')
  const [attachData, setAttachData] = useState(null)

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
        const c = cs.find((co)=> (co.employees||[]).some((e)=> e.email.toLowerCase()=== (user?.email||'').toLowerCase()))
        if (c) { setCompanyName(c.name); setCompanyId(c.id) }
      }).catch(()=>{})
    } else {
      setTasks(loadLocalMyTasks(name))
    }
  }, [name, user?.email])

  const drop = async (status) => {
    if (dragId == null) return
    const _task = tasks.find((t)=> t.id===dragId)
    setTasks((t) => t.map((task) => (task.id === dragId ? { ...task, status } : task)))
    if (apiEnabled()) {
      // Server notifies CEO/managers of the status change — no client call needed.
      await api(`/api/tasks/${dragId}`, { method: 'PUT', body: { status } }).catch(() => {})
    }
    setDragId(null)
    setOverCol(null)
  }

  const _notifyCompleted = async (task) => {
    try {
      const cs = await api('/api/companies').catch(()=>[])
      const comp = cs.find((c)=> c.id===companyId) || cs.find((c)=> (c.employees||[]).some((e)=> e.email.toLowerCase()===user?.email?.toLowerCase()))
      if (!comp) return
      const managers = comp.employees.filter((e)=>{
        const r=(e.role||'').toLowerCase()
        return r.includes('manager') || r.includes('lead') || r==='ceo' || r.includes('ceo')
      }).filter((e)=> e.email.toLowerCase() !== user?.email?.toLowerCase())
      for (const m of managers) {
        await api('/api/notifications', {method:'POST', body:{to:m.email, subject:`Task completed: ${task.title} by ${name}`, body:`${name} has completed task "${task.title}" (Priority: ${task.priority}, Due: ${task.due || '—'}).\n\nPlease review in Task Monitoring.`}}).catch(()=>{})
      }
    } catch {}
  }

  const acceptTask = async (id) => {
    const _task = tasks.find((t)=>t.id===id)
    setTasks((t)=> t.map((x)=> x.id===id ? {...x, status:'inprogress'} : x))
    if (apiEnabled()) await api(`/api/tasks/${id}`, {method:'PUT', body:{status:'inprogress'}}).catch(()=>{})
  }
  const declineTask = async (id) => {
    setTasks((t)=> t.map((x)=> x.id===id ? {...x, status:'declined'} : x))
    if (apiEnabled()) await api(`/api/tasks/${id}`, {method:'PUT', body:{status:'declined'}}).catch(()=>{})
  }
  const saveWork = async () => {
    if (!detailTask) return
    const updates = { status: detailTask.status, notes: workNotes, attachName: attachName || null, attachData: attachData || null }
    setTasks((ts)=> ts.map((t)=> t.id===detailTask.id ? {...t, ...updates} : t))
    if (apiEnabled()) {
      await api(`/api/tasks/${detailTask.id}`, {method:'PUT', body:{ status: detailTask.status, notes: workNotes }}).catch(()=>{})
      // try to store attachment via notifications or just keep local for now
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
            <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search tasks…" className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/10 sm:w-52" />
          </div>
          <select value={priorityFilter} onChange={(e)=>setPriorityFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-300 focus:outline-none">
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
                </div>
                {col.id==='pending' && task.status==='pending' && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={()=>acceptTask(task.id)} className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Accept</button>
                    <button onClick={()=>declineTask(task.id)} className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Decline</button>
                  </div>
                )}
                {col.id==='inprogress' && (
                  <div className="mt-3">
                    <button onClick={()=>{setDetailTask(task); setWorkNotes(task.notes||''); setAttachName(task.attachName||'')}} className="w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">View / Attach</button>
                    {task.attachName && <p className="mt-1 text-[11px] text-emerald-600">📎 {task.attachName}</p>}
                  </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>setDetailTask(null)}>
          <div className="absolute inset-0 bg-gray-900/50" />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">{detailTask.title}</h3>
                <p className="mt-1 text-xs text-gray-500">Due {detailTask.due || '—'} · {detailTask.priority}</p>
              </div>
              <button onClick={()=>setDetailTask(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-700">Work progress / notes</label>
              <textarea value={workNotes} onChange={(e)=>setWorkNotes(e.target.value)} rows={4} placeholder="List down work done, checklist, etc." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
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
