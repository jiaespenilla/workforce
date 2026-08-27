import { useEffect, useState } from 'react'
import { usePageTitle } from '../lib/documentMeta'
import { loadRegisteredCompanies } from '../lib/companies'
import { api, apiEnabled } from '../lib/api'
import { getCompanyLocations, addCompanyLocation, renameCompanyLocation, removeCompanyLocation } from '../lib/locations'

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-brand-50 text-brand-700 ring-brand-200',
  rejected: 'bg-red-50 text-red-600 ring-red-200',
}

const STATUS_LABELS = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
}

function StatusPill({ on }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
        on ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-brand-500' : 'bg-gray-400'}`} />
      {on ? 'Active' : 'Inactive'}
    </span>
  )
}

function DetailRow({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-900">{value || '—'}</p>
    </div>
  )
}

const EDIT_FIELDS = [
  ['name', 'Company name:'],
  ['industry', 'Industry:'],
  ['address', 'Address:'],
  ['city', 'City:'],
  ['contactPhone', 'Contact phone:'],
  ['contactEmail', 'Contact email:', 'email'],
]

function buildCompanyForm(company) {
  return {
    ...Object.fromEntries(EDIT_FIELDS.map(([key]) => [key, company[key] || ''])),
    ownerName: company.owner?.name || '',
    ownerTitle: company.owner?.title || '',
    ownerEmail: company.owner?.email || '',
  }
}

function CompanyDetailsModal({ company, onClose, onToggleActive, onToggleEmployee, onEditCompany }) {
  const [tab, setTab] = useState('details')
  const [editing, setEditing] = useState(false)
  // Form is (re)built from the current company every time Edit starts —
  // this keeps it in sync with what the details view displays.
  const [form, setForm] = useState(() => buildCompanyForm(company))
  const [locations, setLocations] = useState([])
  const [newLocationName, setNewLocationName] = useState('')
  const [editingLocId, setEditingLocId] = useState(null)
  const [editingLocName, setEditingLocName] = useState('')
  const [locError, setLocError] = useState('')

  useEffect(() => {
    let cancelled = false
    getCompanyLocations(company.id).then((locs) => { if (!cancelled) setLocations(locs) })
    return () => { cancelled = true }
  }, [company.id])

  useEffect(() => {
    if (tab === 'locations') {
      getCompanyLocations(company.id).then(setLocations)
    }
  }, [tab, company.id])
  const status = company.status || 'pending'
  const initials = company.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const activeCount = company.employees.filter((e) => e.active !== false).length

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'

  const saveEdit = () => {
    const { ownerName, ownerTitle, ownerEmail, ...companyFields } = form
    onEditCompany(company.id, {
      ...companyFields,
      owner: { name: ownerName, title: ownerTitle, email: ownerEmail },
    })
    setEditing(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-gray-900/50" />
      <div
        className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-gray-100 p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900">{company.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${STATUS_STYLES[status]}`}>
                {STATUS_LABELS[status]}
              </span>
              <StatusPill on={company.active !== false} />
              <span className="text-xs text-gray-500">
                {company.employees.length} employees · {activeCount} active
              </span>
            </div>
          </div>
          {!editing && tab === 'details' && (
            <button
              type="button"
              onClick={() => {
                setForm(buildCompanyForm(company))
                setEditing(true)
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-400 hover:text-brand-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-100 px-6 pt-3">
          {[
            ['details', 'Company Details'],
            ['employees', 'Employees'],
            ['locations', 'Locations'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                if (editing) return
                setTab(id)
              }}
              disabled={editing}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                editing ? 'cursor-not-allowed text-gray-500' :
                tab === id ? 'border-b-2 border-brand-600 text-brand-700' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'details' && !editing && (
          <div className="space-y-6 p-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Company Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="Industry" value={company.industry} />
                <DetailRow label="Registered" value={company.registered} />
                <DetailRow label="Address" value={[company.address, company.city, company.country].filter(Boolean).join(', ')} />
                <DetailRow label="Contact phone" value={company.contactPhone} />
                <DetailRow label="Contact email" value={company.contactEmail} />
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Owner / Administrator</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="Name" value={company.owner?.name || company.employees[0]?.name} />
                <DetailRow label="Job title" value={company.owner?.title} />
                <DetailRow label="Email" value={company.owner?.email || company.employees[0]?.email} />
              </div>
            </section>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Company status</p>
                <p className="mt-0.5 text-xs text-gray-500">Inactive companies cannot access the platform or punch in.</p>
              </div>
              <button
                type="button"
                onClick={() => onToggleActive(company.id)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${company.active !== false ? 'bg-brand-600' : 'bg-gray-300'}`}
                aria-pressed={company.active !== false}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${company.active !== false ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        )}

        {tab === 'details' && editing && (
          <div className="space-y-5 p-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Company Information</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {EDIT_FIELDS.map(([key, label, type]) => (
                  <label key={key} className={`block text-sm ${key === 'Address:' ? 'sm:col-span-2' : ''}`}>
                    <span className="font-medium text-gray-700">{label}</span>
                    <input
                      type={type || 'text'}
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className={`mt-1 ${inputCls}`}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Owner / Administrator</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Owner name:</span>
                  <input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className={`mt-1 ${inputCls}`} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Job title:</span>
                  <input value={form.ownerTitle} onChange={(e) => setForm({ ...form, ownerTitle: e.target.value })} className={`mt-1 ${inputCls}`} />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-gray-700">Owner email:</span>
                  <input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} className={`mt-1 ${inputCls}`} />
                </label>
              </div>
            </section>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  setForm(buildCompanyForm(company))
                  setEditing(false)
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                Save changes
              </button>
            </div>
          </div>
        )}

        {tab === 'employees' && (
          <div className="p-6">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Location</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {company.employees.map((emp) => {
                  const locName = locations.find((l)=>l.id===(emp.locationId||emp.location))?.name || emp.location || '—'
                  return (
                  <tr key={emp.email}>
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-500">{emp.email}</p>
                    </td>
                    <td className="py-3 text-gray-600">{emp.role}</td>
                    <td className="py-3 text-gray-600">{locName}</td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => onToggleEmployee(company.id, emp.email)}
                        title="Toggle employee status"
                      >
                        <StatusPill on={emp.active !== false} />
                      </button>
                    </td>
                  </tr>
                  )
                })}
                {company.employees.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-gray-500">No employees yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-4 text-[11px] text-gray-500">Click an employee's status pill to switch between Active and Inactive. Locations are set in People.</p>
          </div>
        )}

        {tab === 'locations' && (
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Work locations for {company.name}</h3>
              <p className="mt-1 text-xs text-gray-500">Define where employees work — Office, Work From Home, Field Work, etc. Starts empty; add per company. These appear as a selection when adding employees in People.</p>
            </div>
            <div className="flex gap-2">
              <input
                value={newLocationName}
                onChange={(e)=>{setNewLocationName(e.target.value); setLocError('')}}
                placeholder="New location (e.g., Office)"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <button
                type="button"
                onClick={async()=>{
                  if(!newLocationName.trim()){setLocError('Enter a location name.'); return}
                  try{ const loc=await addCompanyLocation(company.id, newLocationName); setLocations((prev)=>[...prev, loc]); setNewLocationName(''); setLocError('')} catch(err){setLocError(err.message)}
                }}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Add
              </button>
            </div>
            {locError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">{locError}</p>}
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {locations.length===0 && (
                <p className="p-4 text-center text-xs text-gray-400">No locations yet — add Office, WFH, Field Work, etc.</p>
              )}
              {locations.map((loc)=>{
                const inUse = company.employees.some((e)=>(e.locationId||e.location)===loc.id || (e.location||'').trim().toLowerCase()===loc.name.trim().toLowerCase())
                const isEditing = editingLocId===loc.id
                return (
                  <div key={loc.id} className="flex items-center gap-2 p-3">
                    {isEditing ? (
                      <>
                        <input value={editingLocName} onChange={(e)=>setEditingLocName(e.target.value)} className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                        <button type="button" onClick={async()=>{try{ await renameCompanyLocation(company.id, loc.id, editingLocName); setLocations((prev)=>prev.map((l)=>l.id===loc.id?{...l,name:editingLocName.trim()}:l)); setEditingLocId(null);}catch(err){setLocError(err.message)}} } className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Save</button>
                        <button type="button" onClick={()=>setEditingLocId(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-gray-900">{loc.name}</span>
                        {inUse && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">In use</span>}
                        <button type="button" onClick={()=>{setEditingLocId(loc.id); setEditingLocName(loc.name); setLocError('')}} className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">Rename</button>
                        <button type="button" onClick={async()=>{
                          if(inUse){ setLocError(`Cannot delete "${loc.name}" — ${company.employees.filter((e)=>(e.locationId||e.location)===loc.id || (e.location||'').toLowerCase()===loc.name.toLowerCase()).length} employee(s) use it. Reassign them first.`); return}
                          try{ await removeCompanyLocation(company.id, loc.id, company.employees); setLocations((prev)=>prev.filter((l)=>l.id!==loc.id)); setLocError('')} catch(err){setLocError(err.message)}
                        }} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CompanyCard({ company, onView, onApprove, onReject }) {
  const [open, setOpen] = useState(false)
  const status = company.status || 'pending'
  const initials = company.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const activeCount = company.employees.filter((e) => e.active !== false).length

  return (
    <div className={`overflow-hidden rounded-xl border bg-white shadow-sm ${company.active === false ? 'border-gray-300 opacity-80' : 'border-gray-200'}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-gray-50"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900">{company.name}</p>
            <StatusPill on={company.active !== false} />
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${STATUS_STYLES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {company.industry || '—'} · {company.city || '—'}{company.country ? `, ${company.country}` : ''}
          </p>
        </div>
        <span className="hidden rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 sm:inline">
          {activeCount}/{company.employees.length} active
        </span>
        <svg
          className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          <div className="grid gap-x-8 gap-y-1 px-5 py-3 text-xs text-gray-500 sm:grid-cols-2">
            <p>Contact: <span className="font-medium text-gray-700">{company.contactEmail || '—'}</span></p>
            <p>Registered: <span className="font-medium text-gray-700">{company.registered || '—'}</span></p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-5 py-3">
            <button
              type="button"
              onClick={() => onView(company.id)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-400 hover:text-brand-700"
            >
              View full details
            </button>
            {status === 'pending' && (
              <>
                <span className="text-xs text-amber-600">Awaiting approval</span>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => onApprove(company)}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(company)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Reject
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Companies() {
  usePageTitle('Companies')
  const [query, setQuery] = useState('')
  const [companies, setCompanies] = useState(apiEnabled() ? [] : loadRegisteredCompanies)
  const [viewingId, setViewingId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approving, setApproving] = useState(null)
  const [deactivateConfirm, setDeactivateConfirm] = useState(null)

  // Cloud mode: companies come from the database.
  useEffect(() => {
    if (!apiEnabled()) return
    api('/api/companies').then(setCompanies).catch(() => {})
  }, [])

  const mutateCompanies = (updater, apiCall) => {
    setCompanies((prev) => updater(prev))
    if (apiEnabled() && apiCall) apiCall().catch((err) => console.error('Sync failed:', err.message))
  }

  const handleStatusChange = (id, status) =>
    mutateCompanies(
      (prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)),
      () => api(`/api/companies/${id}`, { method: 'PUT', body: { status } })
    )

  // Queue an email to the company owner. Delivers once SMTP is configured;
  // until then it is stored alongside admin notifications.
  const queueOwnerEmail = (company, kind, reason) => {
    const ownerEmail = company.owner?.email || company.contactEmail || ''
    if (!ownerEmail) return
    const payload = {
      to: ownerEmail,
      subject:
        kind === 'approved'
          ? `Your registration for ${company.name} has been approved`
          : `Update on your registration for ${company.name}`,
      body:
        kind === 'approved'
          ? `Good news!\n\nYour company "${company.name}" has been approved on Unified Workforce.\nTeam members can now sign in with their registered emails.`
          : `We're sorry — your registration for "${company.name}" was not approved.\n\nReason: ${reason}\n\nYou may contact the system administrator for more details.`,
    }
    if (apiEnabled()) {
      api('/api/notifications', { method: 'POST', body: payload }).catch(() => {})
    } else {
      try {
        const notifications = JSON.parse(localStorage.getItem('uw_notifications')) || []
        notifications.push({ id: `notif-${Date.now()}`, ...payload, createdAt: new Date().toISOString(), status: 'pending-smtp' })
        localStorage.setItem('uw_notifications', JSON.stringify(notifications))
      } catch {
        // storage unavailable
      }
    }
  }

  const handleApprove = (company) => {
    setApproving(company)
  }

  const handleApproveConfirm = () => {
    if (!approving) return
    handleStatusChange(approving.id, 'approved')
    queueOwnerEmail(approving, 'approved')
    setApproving(null)
  }

  const handleRejectRequest = (company) => {
    setRejecting(company)
    setRejectReason('')
  }

  const handleRejectConfirm = () => {
    if (!rejecting) return
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejecting this registration.')
      return
    }
    handleStatusChange(rejecting.id, 'rejected')
    queueOwnerEmail(rejecting, 'rejected', rejectReason.trim())
    setRejecting(null)
    setRejectReason('')
  }

  const handleToggleActive = (id) => {
    const company = companies.find((c) => c.id === id)
    const isActive = company?.active !== false
    const activeEmpCount = company?.employees.filter((e)=>e.active!==false).length || 0
    if (isActive && activeEmpCount > 0) {
      setDeactivateConfirm(company)
      return
    }
    mutateCompanies(
      (prev) => prev.map((c) => (c.id === id ? { ...c, active: c.active === false } : c)),
      () => api(`/api/companies/${id}`, { method: 'PUT', body: { active: company?.active === false } })
    )
  }

  const confirmDeactivate = () => {
    if (!deactivateConfirm) return
    const id = deactivateConfirm.id
    mutateCompanies(
      (prev) => prev.map((c) => (c.id === id ? { ...c, active: false } : c)),
      () => api(`/api/companies/${id}`, { method: 'PUT', body: { active: false } })
    )
    setDeactivateConfirm(null)
  }

  const handleToggleEmployee = (id, empEmail) =>
    mutateCompanies(
      (prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, employees: c.employees.map((e) => (e.email === empEmail ? { ...e, active: e.active === false } : e)) }
            : c
        ),
      () => {
        const company = companies.find((c) => c.id === id)
        const emp = company?.employees.find((e) => e.email === empEmail)
        if (!emp?.id) return Promise.resolve()
        return api(`/api/employees/${emp.id}`, { method: 'PUT', body: { active: emp.active === false } })
      }
    )

  const handleEditCompany = (id, updates) =>
    mutateCompanies(
      (prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      () =>
        api(`/api/companies/${id}`, {
          method: 'PUT',
          body: {
            name: updates.name,
            industry: updates.industry,
            address: updates.address,
            city: updates.city,
            contactPhone: updates.contactPhone,
            contactEmail: updates.contactEmail,
          },
        })
    )

  const totalCompanies = companies.length
  const filtered = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.industry || '').toLowerCase().includes(query.toLowerCase())
  )
  const totalEmployees = companies.reduce((sum, c) => sum + c.employees.length, 0)
  const activeEmployees = companies.reduce((sum, c) => sum + c.employees.filter((e) => e.active !== false).length, 0)
  const inactiveCompanies = companies.filter((c) => c.active === false).length
  const pendingCount = companies.filter((c) => (c.status || 'pending') === 'pending').length
  const viewing = companies.find((c) => c.id === viewingId)

  const stats = [
    { label: 'Companies', value: totalCompanies, tone: 'text-brand-700 bg-brand-50 ring-brand-200' },
    { label: 'Active employees', value: `${activeEmployees}/${totalEmployees}`, tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
    { label: 'Inactive companies', value: inactiveCompanies, tone: 'text-gray-600 bg-gray-100 ring-gray-200' },
    { label: 'Pending approval', value: pendingCount, tone: `${pendingCount > 0 ? 'text-amber-700 bg-amber-50 ring-amber-200' : 'text-gray-600 bg-gray-100 ring-gray-200'}` },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration Console</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Companies</h1>
          <p className="mt-1 text-sm text-gray-500">Review registrations, manage status and view team members.</p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company or industry…"
          aria-label="Search companies"
          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 sm:w-72"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ${s.tone}`}>{s.value}</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((c) => (
          <CompanyCard
            key={c.id}
            company={c}
            onView={setViewingId}
            onApprove={handleApprove}
            onReject={handleRejectRequest}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">No companies yet. New registrations will appear here.</p>
          </div>
        )}
      </div>

      {viewing && (
        <CompanyDetailsModal
          key={viewing.id}
          company={viewing}
          onClose={() => setViewingId(null)}
          onToggleActive={handleToggleActive}
          onToggleEmployee={handleToggleEmployee}
          onEditCompany={handleEditCompany}
        />
      )}

      {approving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setApproving(null)}>
          <div className="absolute inset-0 bg-gray-900/50" />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="h-1.5 w-full bg-gradient-to-r from-brand-600 to-emerald-400" />
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100">
                  <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900">Approve registration</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">
                    You are about to approve <span className="font-semibold text-gray-900">{approving.name}</span>.
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400">Owner:</dt>
                  <dd className="text-right font-medium text-gray-700">{approving.owner?.name || approving.employees[0]?.name || '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400">Owner email:</dt>
                  <dd className="text-right font-medium text-gray-700">{approving.owner?.email || approving.contactEmail || '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400">Team members:</dt>
                  <dd className="text-right font-medium text-gray-700">{approving.employees.length}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-400">Notification email:</dt>
                  <dd className="text-right text-gray-500">Queued — sends once SMTP is configured</dd>
                </div>
              </dl>

              <p className="mt-3 text-xs text-gray-400">Team members will be able to sign in with their registered emails after approval.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button onClick={() => setApproving(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleApproveConfirm} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
                Approve registration
              </button>
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div className="absolute inset-0 bg-gray-900/50" />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-bold text-gray-900">Reject registration</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Provide a reason for rejecting <span className="font-semibold">{rejecting.name}</span>. This will be
                emailed to the owner ({rejecting.owner?.email || rejecting.contactEmail || 'email unavailable'}) once SMTP is configured.
              </p>
            </div>
            <div className="px-6 py-4">
              <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700">Reason:</label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="e.g. Incomplete business documentation."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
              <button onClick={() => setRejecting(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleRejectConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                Reject registration
              </button>
            </div>
          </div>
        </div>
      )}

      {deactivateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDeactivateConfirm(null)}>
          <div className="absolute inset-0 bg-gray-900/50" />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Deactivate company?</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">
                    <span className="font-semibold">{deactivateConfirm.name}</span> is active and has {deactivateConfirm.employees.filter((e)=>e.active!==false).length} active employee(s). Deactivating will hide it from dropdowns, block logins and kiosk punches. You can reactivate later.
                  </p>
                  <p className="mt-2 text-xs text-gray-500">Inactive companies remain visible in Companies search (as you requested) but are hidden from assignment dropdowns.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button onClick={() => setDeactivateConfirm(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={confirmDeactivate} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">Continue &amp; Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
