import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePageTitle } from '../lib/documentMeta'
import { getAllCompanies, loadRegisteredCompanies } from '../lib/companies'
import { getConfiguredRoles } from '../lib/roles'

export default function AddEmployee() {
  usePageTitle('Add Employee')
  const { user } = useAuth()
  const companies = loadRegisteredCompanies()

  // Default to the signed-in CEO's own company.
  const defaultCompanyId =
    companies.find((c) => c.name === user?.companyName)?.id || companies[0]?.id || ''

  const [companyId, setCompanyId] = useState(defaultCompanyId)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(() => {
    const roles = getConfiguredRoles().filter((r) => !r.perms.settings).map((r) => r.name)
    return roles[roles.length - 1] || ''
  })
  const [error, setError] = useState(null)
  const [savedName, setSavedName] = useState(null)

  const roleOptions = getConfiguredRoles().filter((r) => !r.perms.settings).map((r) => r.name)
  const selectedCompany = companies.find((c) => c.id === companyId)
  const existingEmployees = selectedCompany?.employees || []

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

  const submit = (e) => {
    e.preventDefault()
    setError(null)
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!selectedCompany) return setError('No company available. Register a company first.')
    if (!cleanName) return setError('Please enter the employee\u2019s full name.')
    if (!cleanEmail) return setError('Please enter the employee\u2019s email address.')

    const allEmployees = getAllCompanies().flatMap((c) =>
      c.employees.map((e) => (e.email || '').toLowerCase())
    )
    if (allEmployees.includes(cleanEmail)) {
      return setError(`The email ${cleanEmail} is already used by another team member.`)
    }

    try {
      const updated = loadRegisteredCompanies().map((c) =>
        c.id === companyId
          ? { ...c, employees: [...c.employees, { name: cleanName, email: cleanEmail, role: role || 'Unassigned', active: true }] }
          : c
      )
      localStorage.setItem('uw_companies', JSON.stringify(updated))
      setSavedName(`${cleanName} (${cleanEmail})`)
      setName('')
      setEmail('')
    } catch {
      setError('Unable to save — storage unavailable.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Add Employee</h1>
        <p className="mt-1 text-sm text-gray-500">Add a new team member. They can sign in right away using their registered email.</p>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Company:</span>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            disabled={companies.length <= 1 && !!user?.companyName}
            className={inputCls}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Full name: *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Juan Dela Cruz" className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Email address: *</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" placeholder="juan@company.com" className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Role:</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={roleOptions.length === 0} className={inputCls}>
              {roleOptions.length === 0 ? (
                <option value="">No roles available</option>
              ) : (
                roleOptions.map((r) => <option key={r}>{r}</option>)
              )}
            </select>
          </label>
        </div>

        {roleOptions.length === 0 && (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            No roles have been configured by the system administrator yet — the employee will be listed as “Unassigned”.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700 ring-1 ring-red-200">{error}</p>
        )}
        {savedName && (
          <p className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            {savedName} added successfully — they can now sign in with the default password.
          </p>
        )}

        <div className="flex justify-end border-t border-gray-100 pt-4">
          <button type="submit" className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
            + Add employee
          </button>
        </div>
      </form>

      {/* Current team of the selected company */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-900">Current team ({existingEmployees.length})</h2>
        <p className="mt-0.5 text-xs text-gray-400">{selectedCompany?.name || '—'}</p>
        <ul className="mt-4 divide-y divide-gray-100">
          {existingEmployees.map((emp) => (
            <li key={emp.email} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <p className="font-medium text-gray-900">{emp.name}</p>
                <p className="text-xs text-gray-400">{emp.email}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                emp.active !== false ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
              }`}>
                {emp.active !== false ? 'Active' : 'Inactive'}
              </span>
            </li>
          ))}
          {existingEmployees.length === 0 && (
            <li className="py-6 text-center text-xs text-gray-400">No team members yet.</li>
          )}
        </ul>
      </section>
    </div>
  )
}
