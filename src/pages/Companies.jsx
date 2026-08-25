import { useState } from 'react'
import { loadRegisteredCompanies } from '../lib/companies'

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
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-900">{value || '—'}</p>
    </div>
  )
}

const EDIT_FIELDS = [
  ['name', 'Company name'],
  ['industry', 'Industry'],
  ['address', 'Address'],
  ['city', 'City'],
  ['country', 'Country'],
  ['contactPhone', 'Contact phone'],
  ['contactEmail', 'Contact email', 'email'],
]

function CompanyDetailsModal({ company, onClose, onToggleActive, onToggleEmployee, onEditCompany }) {
  const [tab, setTab] = useState('details')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(EDIT_FIELDS.map(([key]) => [key, company[key] || ''])),
    ownerName: company.owner?.name || '',
    ownerTitle: company.owner?.title || '',
    ownerEmail: company.owner?.email || '',
  }))
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
              <span className="text-xs text-gray-400">
                {company.employees.length} employees · {activeCount} active
              </span>
            </div>
          </div>
          {!editing && tab === 'details' && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-400 hover:text-brand-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-100 px-6 pt-3">
          {[
            ['details', 'Company Details'],
            ['employees', 'Employees'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                if (editing) return
                setTab(id)
              }}
              disabled={editing}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                editing ? 'cursor-not-allowed text-gray-300' :
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
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Company Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="Industry" value={company.industry} />
                <DetailRow label="Registered" value={company.registered} />
                <DetailRow label="Address" value={[company.address, company.city, company.country].filter(Boolean).join(', ')} />
                <DetailRow label="Contact phone" value={company.contactPhone} />
                <DetailRow label="Contact email" value={company.contactEmail} />
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Owner / Administrator</h3>
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
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Company Information</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {EDIT_FIELDS.map(([key, label, type]) => (
                  <label key={key} className={`block text-sm ${key === 'address' ? 'sm:col-span-2' : ''}`}>
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
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Owner / Administrator</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Owner name</span>
                  <input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className={`mt-1 ${inputCls}`} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Job title</span>
                  <input value={form.ownerTitle} onChange={(e) => setForm({ ...form, ownerTitle: e.target.value })} className={`mt-1 ${inputCls}`} />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-gray-700">Owner email</span>
                  <input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} className={`mt-1 ${inputCls}`} />
                </label>
              </div>
            </section>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  setForm({
                    ...Object.fromEntries(EDIT_FIELDS.map(([key]) => [key, company[key] || ''])),
                    ownerName: company.owner?.name || '',
                    ownerTitle: company.owner?.title || '',
                    ownerEmail: company.owner?.email || '',
                  })
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
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {company.employees.map((emp) => (
                  <tr key={emp.email}>
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.email}</p>
                    </td>
                    <td className="py-3 text-gray-600">{emp.role}</td>
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
                ))}
                {company.employees.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-xs text-gray-400">No employees yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-4 text-[11px] text-gray-400">Click an employee's status pill to switch between Active and Inactive.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function CompanyCard({ company, onView, onApproveReject }) {
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
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
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
                    onClick={() => onApproveReject(company.id, 'approved')}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onApproveReject(company.id, 'rejected')}
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
  const [query, setQuery] = useState('')
  const [companies, setCompanies] = useState(loadRegisteredCompanies)
  const [viewingId, setViewingId] = useState(null)

  const mutateCompanies = (updater) => {
    setCompanies((prev) => {
      const next = updater(prev)
      localStorage.setItem('uw_companies', JSON.stringify(next))
      return next
    })
  }

  const handleStatusChange = (id, status) =>
    mutateCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))

  const handleToggleActive = (id) =>
    mutateCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, active: c.active === false } : c)))

  const handleToggleEmployee = (id, empEmail) =>
    mutateCompanies((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, employees: c.employees.map((e) => (e.email === empEmail ? { ...e, active: e.active === false } : e)) }
          : c
      )
    )

  const handleEditCompany = (id, updates) =>
    mutateCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))

  const filtered = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.industry || '').toLowerCase().includes(query.toLowerCase())
  )
  const totalEmployees = companies.reduce((sum, c) => sum + c.employees.length, 0)
  const activeEmployees = companies.reduce((sum, c) => sum + c.employees.filter((e) => e.active !== false).length, 0)
  const pendingCount = companies.filter((c) => (c.status || 'pending') === 'pending').length
  const viewing = companies.find((c) => c.id === viewingId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Companies</h1>
          <p className="mt-1 text-sm text-gray-500">
            {companies.length} compan{companies.length !== 1 ? 'ies' : 'y'} · {activeEmployees}/{totalEmployees} employees active.
            {pendingCount > 0 && (
              <span className="ml-2 font-medium text-amber-600">{pendingCount} pending approval.</span>
            )}
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search companies…"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 sm:w-64"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((c) => (
          <CompanyCard
            key={c.id}
            company={c}
            onView={setViewingId}
            onApproveReject={handleStatusChange}
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
          company={viewing}
          onClose={() => setViewingId(null)}
          onToggleActive={handleToggleActive}
          onToggleEmployee={handleToggleEmployee}
          onEditCompany={handleEditCompany}
        />
      )}
    </div>
  )
}
