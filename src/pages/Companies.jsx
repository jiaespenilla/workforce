import { useState } from 'react'

const SAMPLE_COMPANIES = [
  {
    id: 'acme',
    name: 'Acme Corporation',
    industry: 'Technology',
    address: '123 Ayala Ave, Suite 100',
    city: 'Makati',
    country: 'Philippines',
    contactPhone: '+63 917 000 1234',
    contactEmail: 'info@acme.com',
    registered: '2026-01-12',
    owner: { name: 'Robert Chen', title: 'CEO', email: 'robert@acme.com' },
    active: true,
    employees: [
      { name: 'Alex Morgan', email: 'alex@acme.com', role: 'Employee', active: true },
      { name: 'Maria Santos', email: 'maria@acme.com', role: 'HR Manager', active: true },
      { name: 'John Cruz', email: 'john@acme.com', role: 'Team Lead', active: false },
      { name: 'Grace Lim', email: 'grace@acme.com', role: 'Employee', active: true },
    ],
  },
  {
    id: 'northwind',
    name: 'Northwind Trading',
    industry: 'Retail',
    address: '45 Colon Street',
    city: 'Cebu City',
    country: 'Philippines',
    contactPhone: '+63 917 555 8899',
    contactEmail: 'contact@northwind.com',
    registered: '2026-03-04',
    owner: { name: 'Susan Tan', title: 'Owner', email: 'susan@northwind.com' },
    active: true,
    employees: [
      { name: 'Peter Reyes', email: 'peter@northwind.com', role: 'HR Manager', active: true },
      { name: 'Ana Dizon', email: 'ana@northwind.com', role: 'Employee', active: false },
      { name: 'Carlo Mendoza', email: 'carlo@northwind.com', role: 'Employee', active: true },
    ],
  },
  {
    id: 'bluepeak',
    name: 'Bluepeak Construction',
    industry: 'Construction',
    address: '12 Commonwealth Ave',
    city: 'Quezon City',
    country: 'Philippines',
    contactPhone: '+63 918 222 3344',
    contactEmail: 'admin@bluepeak.com',
    registered: '2026-06-21',
    owner: { name: 'Miguel Ramos', title: 'Managing Director', email: 'miguel@bluepeak.com' },
    active: false,
    employees: [
      { name: 'Ramon Villanueva', email: 'ramon@bluepeak.com', role: 'Team Lead', active: false },
      { name: 'Ella Torres', email: 'ella@bluepeak.com', role: 'Employee', active: true },
    ],
  },
]

function loadRegisteredCompanies() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_companies'))
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

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

function CompanyDetailsModal({ company, isNew, onClose, onToggleActive, onToggleEmployee }) {
  const [tab, setTab] = useState('details')
  const status = company.status || (isNew ? 'pending' : 'approved')
  const initials = company.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const activeCount = company.employees.filter((e) => e.active !== false).length

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
              onClick={() => setTab(id)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                tab === id ? 'border-b-2 border-brand-600 text-brand-700' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'details' && (
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

function CompanyCard({ company, isNew, onView, onApproveReject }) {
  const [open, setOpen] = useState(false)
  const status = company.status || (isNew ? 'pending' : 'approved')
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
  const [registered, setRegistered] = useState(loadRegisteredCompanies)
  const [viewingId, setViewingId] = useState(null)

  const mutateRegistered = (updater) => {
    setRegistered((prev) => {
      const next = updater(prev)
      localStorage.setItem('uw_companies', JSON.stringify(next))
      return next
    })
  }

  const handleStatusChange = (id, status) =>
    mutateRegistered((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))

  const handleToggleActive = (id) =>
    mutateRegistered((prev) => prev.map((c) => (c.id === id ? { ...c, active: c.active === false } : c)))

  const handleToggleEmployee = (id, empEmail) =>
    mutateRegistered((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, employees: c.employees.map((e) => (e.email === empEmail ? { ...e, active: e.active === false } : e)) }
          : c
      )
    )

  // Registered companies are editable; sample companies are read-only demo data
  const all = [...registered, ...SAMPLE_COMPANIES]
  const filtered = all.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.industry || '').toLowerCase().includes(query.toLowerCase())
  )
  const totalEmployees = all.reduce((sum, c) => sum + c.employees.length, 0)
  const activeEmployees = all.reduce((sum, c) => sum + c.employees.filter((e) => e.active !== false).length, 0)
  const pendingCount = registered.filter((c) => (c.status || 'pending') === 'pending').length
  const viewing = all.find((c) => c.id === viewingId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Companies</h1>
          <p className="mt-1 text-sm text-gray-500">
            {all.length} compan{all.length !== 1 ? 'ies' : 'y'} · {activeEmployees}/{totalEmployees} employees active.
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
            isNew={registered.some((r) => r.id === c.id)}
            onView={setViewingId}
            onApproveReject={handleStatusChange}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">No companies match your search.</p>
          </div>
        )}
      </div>

      {viewing && viewingId.startsWith('reg-') && (
        <CompanyDetailsModal
          company={viewing}
          isNew
          onClose={() => setViewingId(null)}
          onToggleActive={handleToggleActive}
          onToggleEmployee={handleToggleEmployee}
        />
      )}
    </div>
  )
}
