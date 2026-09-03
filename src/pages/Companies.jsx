import { useEffect, useState } from 'react'
import { usePageTitle } from '../lib/documentMeta'
import { api, apiEnabled } from '../lib/api'
import { getCompanyLocations, addCompanyLocation, renameCompanyLocation, removeCompanyLocation } from '../lib/locations'
import { getConfiguredRoles } from '../lib/roles'
import Pagination from '../components/Pagination'

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

function initialsOf(name) {
  return (name || '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

function CompanyLogo({ company, size = 'h-12 w-12', textSize = 'text-base' }) {
  const src = company?.logoName?.startsWith?.('data:image/') ? company.logoName : null
  if (src) {
    return <img src={src} alt="" className={`${size} shrink-0 rounded-xl object-cover ring-1 ring-gray-200 bg-white`} onError={(e) => { e.currentTarget.style.display = 'none' }} />
  }
  return <div className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-brand-600 ${textSize} font-bold text-white`}>{initialsOf(company.name)}</div>
}

function CompanyDetailsModal({ company, onClose, onToggleActive, onToggleEmployee, onEditEmployee, onEditCompany }) {
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
  const [editingEmpEmail, setEditingEmpEmail] = useState(null)
  const [editRole, setEditRole] = useState('')
  const [editLocId, setEditLocId] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [empSaveMsg, setEmpSaveMsg] = useState('')
  const baseRoles = getConfiguredRoles().filter((r)=>!r.perms.settings).map((r)=>r.name)
  const roleOptions = baseRoles.length ? baseRoles : ['CEO','HR Manager','Team Lead','Employee']

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
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-6">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
            <CompanyLogo company={company} size="h-12 w-12" textSize="text-base" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-gray-900">{company.name}</h2>
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
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!editing && tab === 'details' && (
              <button
                type="button"
                onClick={() => {
                  setForm(buildCompanyForm(company))
                  setEditing(true)
                }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-400 hover:text-brand-700"
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
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-4 pt-3 sm:px-6">
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
          <div className="overflow-x-auto p-4 sm:p-6">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Location</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {company.employees.map((emp) => {
                  const locName = locations.find((l)=>l.id===(emp.locationId||emp.location))?.name || emp.location || '—'
                  const isEditing = editingEmpEmail === emp.email
                  if (isEditing) {
                    return (
                      <tr key={emp.email}>
                        <td className="py-3" colSpan={5}>
                          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">Edit {emp.name}</p>
                                <p className="text-xs text-gray-500">{emp.email}</p>
                              </div>
                              <button type="button" onClick={()=>setEditingEmpEmail(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <label className="block text-xs">
                                <span className="font-medium text-gray-700">Role</span>
                                <select value={editRole} onChange={(e)=>setEditRole(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                                  {roleOptions.map((r)=><option key={r}>{r}</option>)}
                                  {!roleOptions.includes(editRole) && editRole && <option>{editRole}</option>}
                                </select>
                              </label>
                              <label className="block text-xs">
                                <span className="font-medium text-gray-700">Work location</span>
                                <select value={editLocId} onChange={(e)=>setEditLocId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                                  <option value="">No location</option>
                                  {locations.map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                                {locations.length===0 && <span className="mt-1 block text-[11px] text-gray-400">Add locations in the Locations tab</span>}
                              </label>
                              <div className="block text-xs">
                                <span className="font-medium text-gray-700">Status</span>
                                <button type="button" onClick={()=>setEditActive(!editActive)} className={`mt-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition ${editActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                                  <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${editActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />{editActive ? 'Active' : 'Inactive'}</span>
                                  <span className={`relative h-5 w-9 rounded-full transition ${editActive ? 'bg-emerald-500' : 'bg-gray-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${editActive ? 'left-4' : 'left-0.5'}`} /></span>
                                </button>
                              </div>
                            </div>
                            <div className="mt-4 flex justify-end gap-2">
                              <button type="button" onClick={()=>setEditingEmpEmail(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                              <button type="button" onClick={()=>{
                                const loc = locations.find((l)=>l.id===editLocId)
                                onEditEmployee(company.id, emp.email, { role: editRole, locationId: editLocId || null, location: loc?.name || editLocId || null, active: editActive })
                                setEditingEmpEmail(null)
                                setEmpSaveMsg(`${emp.name} updated`)
                                setTimeout(()=>setEmpSaveMsg(''), 3000)
                              }} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                Save changes
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  }
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
                    <td className="py-3">
                      <button type="button" onClick={()=>{
                        setEditingEmpEmail(emp.email)
                        setEditRole(emp.role || roleOptions[0] || '')
                        setEditLocId(emp.locationId || locations.find((l)=>l.name===emp.location)?.id || '')
                        setEditActive(emp.active !== false)
                      }} className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        Edit
                      </button>
                    </td>
                  </tr>
                  )
                })}
                {company.employees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-gray-500">No employees yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {empSaveMsg && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">{empSaveMsg}</p>}
            <p className="mt-3 text-[11px] text-gray-500">Click <span className="font-semibold">Edit</span> to change role, location or active status, then <span className="font-semibold">Save</span>. Or tap the status pill for a quick toggle.</p>
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
                  <div key={loc.id} className="flex flex-wrap items-center gap-2 p-3">
                    {isEditing ? (
                      <>
                        <input value={editingLocName} onChange={(e)=>setEditingLocName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                        <button type="button" onClick={async()=>{try{ await renameCompanyLocation(company.id, loc.id, editingLocName); setLocations((prev)=>prev.map((l)=>l.id===loc.id?{...l,name:editingLocName.trim()}:l)); setEditingLocId(null);}catch(err){setLocError(err.message)}} } className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Save</button>
                        <button type="button" onClick={()=>setEditingLocId(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 basis-full text-sm font-medium text-gray-900 sm:basis-auto">{loc.name}</span>
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
  const activeCount = company.employees.filter((e) => e.active !== false).length

  return (
    <div className={`overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md ${company.active === false ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200 hover:border-brand-200'}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-gray-50 sm:gap-4 sm:px-5"
      >
        <CompanyLogo company={company} size="h-11 w-11" textSize="text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <p className="truncate text-sm font-semibold text-gray-900 sm:text-[15px]">{company.name}</p>
            <StatusPill on={company.active !== false} />
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${STATUS_STYLES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" /></svg>
            {company.industry || '—'} · {company.city || '—'}{company.country ? `, ${company.country}` : ''}
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 sm:inline-flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${activeCount>0?'bg-emerald-500':'bg-gray-300'}`} />
          {activeCount}/{company.employees.length}
        </span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${open?'bg-brand-50 border-brand-200 text-brand-600':'bg-white border-gray-200 text-gray-400'}`}>
          <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50/50">
          <div className="grid gap-2 px-4 py-3 text-xs text-gray-600 sm:grid-cols-2 sm:px-5">
            <p className="flex items-center gap-1.5"><svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> {company.contactEmail || '—'}</p>
            <p className="flex items-center gap-1.5"><svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> {company.registered || '—'}</p>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:px-5">
            <button
              type="button"
              onClick={() => onView(company.id)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 min-h-[36px]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.274 4.057-5.064 7-9.543 7-4.478 0-8.268-2.943-9.543-7z" /></svg>
              View details
            </button>
            {status === 'pending' ? (
              <>
                <span className="hidden text-xs font-medium text-amber-600 sm:inline">Awaiting approval</span>
                <div className="flex gap-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => onApprove(company)}
                    className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 sm:flex-none min-h-[36px]"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(company)}
                    className="flex-1 rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 sm:flex-none min-h-[36px]"
                  >
                    Reject
                  </button>
                </div>
              </>
            ) : (
              <span className="text-xs text-gray-400 hidden sm:inline">Tap View details for more actions</span>
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState('all')
  const [companies, setCompanies] = useState([])
  const [viewingId, setViewingId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approving, setApproving] = useState(null)
  const [deactivateConfirm, setDeactivateConfirm] = useState(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 6

  // Cloud mode: companies come from the database.
  useEffect(() => {
    if (!apiEnabled()) return
    api('/api/companies').then((res) => setCompanies(Array.isArray(res) ? res : (res.data || []))).catch(() => {})
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

  const queueWelcomeForCompany = (company) => {
    const welcomeSubject = `Welcome to ${company.name} — You're all set!`
    const welcomeBody = `Welcome to ${company.name}!\n\nYour company is now active on Unified Workforce.\n\nIndustry: ${company.industry || '—'}${company.city ? ` · ${company.city}` : ''}\nTeam size: ${company.employees.length} member(s)\n\nQuick start:\n• View your Dashboard for an overview\n• Manage teammates in People\n• Set up Shift Schedules for your team\n• Clock in/out via the Time Kiosk (QR / PIN / fingerprint)\n\nTip: You can find this introduction again in Notifications (bell icon).\n\n— CelestSolutions`
    for (const emp of company.employees) {
      if (!emp.email) continue
      const payload = { to: emp.email, subject: welcomeSubject, body: welcomeBody }
      if (apiEnabled()) {
        api('/api/notifications', { method: 'POST', body: payload }).catch(() => {})
      } else {
        try {
          const notifications = JSON.parse(localStorage.getItem('uw_notifications')) || []
          notifications.push({ id: `notif-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, ...payload, createdAt: new Date().toISOString(), status: 'pending-smtp' })
          localStorage.setItem('uw_notifications', JSON.stringify(notifications))
        } catch {}
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
    queueWelcomeForCompany(approving)
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

  const handleEditEmployee = (companyId, empEmail, updates) =>
    mutateCompanies(
      (prev) => prev.map((c) => c.id === companyId ? { ...c, employees: c.employees.map((e) => e.email === empEmail ? { ...e, ...updates } : e) } : c),
      () => {
        const company = companies.find((c) => c.id === companyId)
        const emp = company?.employees.find((e) => e.email === empEmail)
        if (!emp?.id) return Promise.resolve()
        return api(`/api/employees/${emp.id}`, { method: 'PUT', body: updates })
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
  const filtered = companies.filter((c) => {
    const matchesQuery = c.name.toLowerCase().includes(query.toLowerCase()) || (c.industry || '').toLowerCase().includes(query.toLowerCase())
    const matchesStatus = statusFilter === 'all' || (c.status || 'pending') === statusFilter
    const matchesActive = activeFilter === 'all' || (activeFilter === 'active' ? c.active !== false : c.active === false)
    return matchesQuery && matchesStatus && matchesActive
  })
  // Reset page when filters change
  useEffect(() => { setPage(0) }, [query, statusFilter, activeFilter])
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalEmployees = companies.reduce((sum, c) => sum + c.employees.length, 0)
  const activeEmployees = companies.reduce((sum, c) => sum + c.employees.filter((e) => e.active !== false).length, 0)
  const inactiveCompanies = companies.filter((c) => c.active === false).length
  const pendingCount = companies.filter((c) => (c.status || 'pending') === 'pending').length
  const viewing = companies.find((c) => c.id === viewingId)

  const stats = [
    { label: 'Companies', value: totalCompanies, tone: 'text-brand-700 bg-brand-50 ring-brand-200', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1' },
    { label: 'Active employees', value: `${activeEmployees}/${totalEmployees}`, tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { label: 'Inactive companies', value: inactiveCompanies, tone: 'text-gray-600 bg-gray-100 ring-gray-200', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L3 3' },
    { label: 'Pending approval', value: pendingCount, tone: `${pendingCount > 0 ? 'text-amber-700 bg-amber-50 ring-amber-200' : 'text-gray-600 bg-gray-100 ring-gray-200'}`, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  ]

  return (
    <div className="space-y-6">
      {/* Header — stacked on mobile, extra breathing room */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration Console</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Companies</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Review registrations, manage status and view team members. Works on phone and desktop.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company or industry…"
            aria-label="Search companies"
            className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-10 text-sm transition placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          />
          {query && (
            <button type="button" onClick={()=>setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Clear search">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.tone.split(' ')[1]} ${s.tone.split(' ')[0]}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" strokeLinejoin="round" d={s.icon} /></svg>
            </div>
            <div>
              <p className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ring-1 ${s.tone}`}>{s.value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters — pills, scrollable on mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 snap-x">
          <span className="text-xs font-medium text-gray-500 shrink-0">Status:</span>
          {[
            ['all', 'All'],
            ['pending', 'Pending'],
            ['approved', 'Approved'],
            ['rejected', 'Rejected'],
          ].map(([val, label])=>(
            <button key={val} type="button" onClick={()=>setStatusFilter(val)} className={`shrink-0 snap-start rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition min-h-[32px] ${statusFilter===val ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-medium text-gray-500 shrink-0">Active:</span>
          {[
            ['all', 'All'],
            ['active', 'Active'],
            ['inactive', 'Inactive'],
          ].map(([val, label])=>(
            <button key={val} type="button" onClick={()=>setActiveFilter(val)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition min-h-[32px] ${activeFilter===val ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}>{label}</button>
          ))}
          {(statusFilter!=='all' || activeFilter!=='all' || query) && (
            <button type="button" onClick={()=>{setStatusFilter('all'); setActiveFilter('all'); setQuery('')}} className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700">Clear</button>
          )}
        </div>
      </div>
      {(statusFilter!=='all' || activeFilter!=='all' || query) && (
        <p className="text-xs text-gray-500">{filtered.length} of {totalCompanies} companies shown</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
        {paginated.map((c) => (
          <CompanyCard
            key={c.id}
            company={c}
            onView={setViewingId}
            onApprove={handleApprove}
            onReject={handleRejectRequest}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border-2 border-dashed border-gray-200 bg-white p-8 text-center sm:p-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" /></svg>
            </div>
            <p className="mt-3 text-sm font-medium text-gray-900">No companies match</p>
            <p className="mt-1 text-xs text-gray-500">Try adjusting search or filters, or wait for new registrations.</p>
          </div>
        )}
      </div>
      {filtered.length > PAGE_SIZE && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      )}

      {viewing && (
        <CompanyDetailsModal
          key={viewing.id}
          company={viewing}
          onClose={() => setViewingId(null)}
          onToggleActive={handleToggleActive}
          onToggleEmployee={handleToggleEmployee}
          onEditEmployee={handleEditEmployee}
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
