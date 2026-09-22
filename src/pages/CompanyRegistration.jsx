import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { getLegalDocs } from '../lib/legal'
import { getConfiguredRoles } from '../lib/roles'
import { api, apiEnabled } from '../lib/api'

const industries = ['Technology', 'Healthcare', 'Retail', 'Manufacturing', 'Finance', 'Education', 'Construction', 'Hospitality', 'Other']

const _NOTIFICATION_RECIPIENT = 'jiaespenilla@gmail.com'

function LegalModal({ title, content, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <h3 className="text-lg font-bold text-slate-950">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="touch-44 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto whitespace-pre-line px-6 py-5 text-sm leading-7 text-slate-600">{content}</div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Close</button>
          <button onClick={onConfirm} className="min-h-[44px] rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            I have read and understood
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-base text-slate-950 placeholder:text-slate-400 transition hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmailValid = (v) => EMAIL_RE.test(String(v || '').trim())

export default function CompanyRegistration() {
  usePageTitle('Company Registration')
  const [logo, setLogo] = useState(null) // data URL
  const [submitted, setSubmitted] = useState(false)
  const [submittedSummary, setSubmittedSummary] = useState(null)
  const [companyName, setCompanyName] = useState('')
  const [company, setCompany] = useState({ industry: 'Technology', address: '', city: '', contactPhone: '', contactEmail: '' })
  const [nameError, setNameError] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const formTopRef = useRef(null)
  const [checkingName, setCheckingName] = useState(false)
  const [people, setPeople] = useState(() => {
    const roles = getConfiguredRoles().filter((r) => !r.perms?.settings).map((r) => r.name)
    return [{ name: '', email: '', role: roles[0] || '' }]
  })
  const [showBulkPaste, setShowBulkPaste] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkError, setBulkError] = useState(null)
  const [legalView, setLegalView] = useState(null)
  const [readDocs, setReadDocs] = useState({ terms: false, privacy: false })
  const [legalError, setLegalError] = useState(false)
  const agreementRef = useRef(null)
  // Only roles actually configured by the administrator — no sample/fallback roles.
  // In cloud mode localStorage is cleared for unauthenticated users, so fetch
  // roles from the public endpoint when the local cache is empty.
  const [fetchedRoleNames, setFetchedRoleNames] = useState(null)
  const localRoleNames = getConfiguredRoles().filter((r) => !r.perms?.settings).map((r) => r.name)
  const roleOptions = fetchedRoleNames ?? localRoleNames
  const legal = getLegalDocs()

  useEffect(() => {
    if (fetchedRoleNames !== null) return
    if (localRoleNames.length > 0) return
    if (!apiEnabled()) return
    api('/api/roles').then((roles) => {
      const names = (Array.isArray(roles) ? roles : []).filter((r) => !r.perms?.settings).map((r) => r.name).filter(Boolean)
      if (names.length) {
        setFetchedRoleNames(names)
        setPeople((prev) => prev.map((p) => ({ ...p, role: p.role || names[0] })))
      } else {
        setFetchedRoleNames([])
      }
    }).catch(() => setFetchedRoleNames([]))
  }, [fetchedRoleNames, localRoleNames.length])

  // Live duplicate company-name check — debounced, case-insensitive.
  // Cloud mode hits public /api/companies/check; local mode checks localStorage.
  useEffect(() => {
    const trimmed = companyName.trim()
    if (!trimmed || trimmed.length < 2) {
      setNameError('')
      setCheckingName(false)
      return
    }
    setCheckingName(true)
    const t = setTimeout(async () => {
      try {
        if (apiEnabled()) {
          const res = await api(`/api/companies/check?name=${encodeURIComponent(trimmed)}`)
          if (res.exists) setNameError(`"${trimmed}" is already registered. Please choose a different company name.`)
          else setNameError('')
        }
      } catch {
        setNameError('')
      } finally {
        setCheckingName(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [companyName])

  const confirmRead = (doc) => {
    setReadDocs((prev) => ({ ...prev, [doc]: true }))
    setLegalView(null)
  }
  const bothDocsRead = readDocs.terms && readDocs.privacy
  const [agree, setAgree] = useState(false)

  const setPerson = (i, field, value) =>
    setPeople((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)))

  const addPerson = () =>
    setPeople((prev) => {
      const roles = roleOptions.length ? roleOptions : getConfiguredRoles().filter((r) => !r.perms?.settings).map((r) => r.name)
      return [...prev, { name: '', email: '', role: roles[roles.length - 1] || roles[0] || '' }]
    })

  const removePerson = (i) => setPeople((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))

  const parseBulk = () => {
    const rows = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, email, role] = line.split(',').map((s) => s.trim())
        return { name: name || '', email: email || '', role: roleOptions.includes(role) ? role : roleOptions[roleOptions.length - 1] || '' }
      })
      .filter((r) => r.name || r.email)
    if (rows.length === 0) {
      setBulkError('No valid rows found. Use one person per line: Name, Email, Role.')
      return
    }
    setBulkError(null)
    setPeople((prev) => {
      // Keep valid existing rows, then append parsed ones. First row stays CEO.
      const kept = prev.filter((p, i) => i === 0 || p.name || p.email)
      const merged = [...kept]
      for (const row of rows) merged.push(row)
      return merged
    })
    setBulkText('')
    setShowBulkPaste(false)
  }

  if (submitted) {
    const s = submittedSummary || { name: companyName || 'your company', members: people.length }
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
        <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white text-center shadow-2xl ring-1 ring-white/20">
          <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 to-emerald-300" />
          <div className="p-7 sm:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100">
              <svg className="h-7 w-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-brand-700">Registration received</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Your company is ready for review</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              <span className="font-semibold text-gray-800">{s.name}</span> ({s.members} member{s.members !== 1 ? 's' : ''}) is now pending review by an administrator.
            </p>
            <ol className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-5 text-left text-sm leading-6 text-slate-600 ring-1 ring-slate-100">
              <li className="flex gap-2"><span className="font-bold text-brand-600">1.</span> An administrator reviews and approves your registration.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-600">2.</span> Each team member signs in with their registered email.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-600">3.</span> Set up shifts and start secure clocking from Time Keeping.</li>
            </ol>
            <Link to="/login" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700">Go to login</Link>
          </div>
        </div>
      </main>
    )
  }

  const fail = (msg) => {
    setFormError(msg)
    setSubmitting(false)
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!bothDocsRead) {
      setLegalError(true)
      agreementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const data = company

    const members = people
      .map((p) => ({
        name: p.name.trim(),
        email: p.email.trim().toLowerCase(),
        role: p.role || 'Unassigned',
      }))
      .filter((p) => p.name && p.email)

    if (members.length === 0) {
      fail('Please add at least one team member with a name and email.')
      return
    }
    const badEmail = members.find((m) => !isEmailValid(m.email))
    if (badEmail) {
      fail(`"${badEmail.email}" doesn't look like a valid email. Please fix it and try again.`)
      return
    }
    if (!isEmailValid(data.contactEmail)) {
      fail('Please enter a valid contact email for the company.')
      return
    }
    // Ensure emails are unique
    const emails = new Set()
    for (const m of members) {
      if (emails.has(m.email)) {
        fail(`Duplicate email: ${m.email}. Each team member needs a unique email.`)
        return
      }
      emails.add(m.email)
    }

    // Final duplicate-name guard before submit (covers race conditions)
    const trimmedCompanyName = (companyName || '').trim()
    if (!trimmedCompanyName) {
      fail('Company name is required.')
      return
    }
    if (nameError) {
      fail(nameError)
      return
    }
    setSubmitting(true)

    const ceo = members.find((m) => m.role === 'CEO') || members[0]
    const payload = {
      id: `reg-${Date.now()}`,
      name: trimmedCompanyName || 'Unnamed Company',
      industry: data.industry,
      address: data.address,
      city: data.city,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail || ceo.email,
      registered: new Date().toISOString().slice(0, 10),
      logoName: logo || null,
      status: 'pending',
      active: true,
      owner: { name: ceo.name, title: 'CEO', email: ceo.email },
      employees: members.map((m) => ({ ...m, active: true })),
    }
    if (apiEnabled()) {
      // Cloud mode — saved to the D1 database; admin notification queued server-side.
      try {
        await api('/api/companies', { method: 'POST', body: payload })
      } catch (err) {
        // Server returns 409 for duplicate names — surface as inline error
        if (err.status === 409) setNameError(err.message)
        fail(`Registration failed to save: ${err.message}`)
        return
      }

    }
    setSubmittedSummary({ name: payload.name, members: members.length })
    setSubmitting(false)
    setSubmitted(true)
  }

  const progressSteps = [
    { label: 'Company', detail: 'Organization details', done: !!(companyName.trim() && company.address.trim() && company.city.trim() && isEmailValid(company.contactEmail) && company.contactPhone.trim()) },
    { label: 'Team', detail: 'Owner and employees', done: people.some((person) => person.name.trim() && isEmailValid(person.email)) },
    { label: 'Agreement', detail: 'Terms and privacy', done: bothDocsRead && agree },
  ]

  return (
    <main className="min-h-screen bg-slate-50">
      {legalView && (
        <LegalModal
          title={legalView === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
          content={legal[legalView]}
          onConfirm={() => confirmRead(legalView)}
          onClose={() => setLegalView(null)}
        />
      )}

      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />
          <Link to="/login" className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 sm:px-4 sm:text-sm">
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-10">
        <aside className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl lg:sticky lg:top-6 lg:p-7">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Organization setup</p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Register your company</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">Create your workspace and add the people who will use it.</p>

            <ol className="mt-6 grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3" aria-label="Registration progress">
              {progressSteps.map((step, index) => (
                <li key={step.label} className={`rounded-2xl border p-3 transition lg:flex lg:items-center lg:gap-3 ${step.done ? 'border-emerald-300/25 bg-emerald-300/10' : 'border-white/10 bg-white/[0.05]'}`} aria-current={step.done ? undefined : 'step'}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.done ? 'bg-emerald-300 text-slate-950' : 'bg-white/10 text-white'}`}>
                    {step.done ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : index + 1}
                  </span>
                  <span className="mt-2 block min-w-0 lg:mt-0">
                    <span className="block truncate text-xs font-semibold text-white sm:text-sm">{step.label}</span>
                    <span className="mt-0.5 hidden text-xs text-slate-400 lg:block">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-6 hidden rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-xs leading-5 text-slate-300 lg:block">
              Your registration is reviewed before the workspace becomes active.
            </div>
          </div>
        </aside>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-32px_rgba(15,23,42,0.3)] sm:p-8">
          <div ref={formTopRef} className="scroll-mt-4" />
          {formError && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span className="flex-1">{formError}</span>
              <button type="button" onClick={() => setFormError('')} aria-label="Dismiss error" className="rounded-lg p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
          {/* Section 1 — Company */}
          <section aria-labelledby="sec-company" className="rounded-2xl border border-slate-200 p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow">1</span>
              <div>
                <h2 id="sec-company" className="text-base font-bold text-slate-950 sm:text-lg">Company information</h2>
                <p className="text-xs leading-relaxed text-slate-500">Tell us about your organization for verification and branding.</p>
              </div>
            </div>

            <label className="mb-5 block cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-center text-sm text-slate-500 transition hover:border-brand-300 hover:bg-brand-50/50">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file || !file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) return
                  const r = new FileReader()
                  r.onload = () => setLogo(r.result)
                  r.readAsDataURL(file)
                }}
              />
              <div className="mx-auto flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-gray-200">
                {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : (
                  <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                )}
              </div>
              <p className="mt-2 text-xs font-medium text-gray-700">{logo ? <span className="text-brand-700">Logo ready ✓</span> : 'Upload company logo (optional)'}</p>
              <p className="mt-1 text-[11px] text-gray-400">PNG, JPG or SVG — max 2MB</p>
              {logo && <button type="button" onClick={(ev) => { ev.preventDefault(); setLogo(null) }} className="mt-2 text-xs text-red-600">Remove</button>}
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">Company name: *</span>
                <input
                  name="companyName"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corporation"
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? 'company-name-error' : undefined}
                  className={`mt-1 ${inputCls} ${nameError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : ''} ${checkingName ? 'bg-gray-50' : ''}`}
                />
                {checkingName && !nameError && (
                  <span className="mt-1 block text-xs text-gray-400">Checking availability…</span>
                )}
                {nameError && (
                  <span id="company-name-error" className="mt-1 block rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">
                    {nameError}
                  </span>
                )}
                {!nameError && !checkingName && companyName.trim().length >= 2 && (
                  <span className="mt-1 block text-xs font-medium text-emerald-600">✓ Company name is available</span>
                )}
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">Address: *</span>
                <input name="address" required value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} placeholder="123 Main St, Suite 100" autoComplete="street-address" className={`mt-1 ${inputCls}`} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">City: *</span>
                <input name="city" required value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} placeholder="Makati" autoComplete="address-level2" className={`mt-1 ${inputCls}`} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Industry: *</span>
                <select name="industry" required value={company.industry} onChange={(e) => setCompany({ ...company, industry: e.target.value })} className={`mt-1 ${inputCls}`}>
                  {industries.map((i) => <option key={i}>{i}</option>)}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">Contact phone: *</span>
                <input name="contactPhone" required type="tel" value={company.contactPhone} onChange={(e) => setCompany({ ...company, contactPhone: e.target.value })} placeholder="+63 917 000 0000" autoComplete="tel" className={`mt-1 ${inputCls}`} />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">Contact email: *</span>
                <input name="contactEmail" required type="email" value={company.contactEmail} onChange={(e) => setCompany({ ...company, contactEmail: e.target.value })} placeholder="info@company.com" autoComplete="email" aria-invalid={company.contactEmail ? !isEmailValid(company.contactEmail) : undefined} className={`mt-1 ${inputCls} ${company.contactEmail && !isEmailValid(company.contactEmail) ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : ''}`} />
                {company.contactEmail && !isEmailValid(company.contactEmail) && (
                  <span className="mt-1 block text-xs font-medium text-red-600">Enter a valid email address.</span>
                )}
              </label>
            </div>
          </section>

          <div className="hidden" aria-hidden="true" />

          {/* Section 2 — Team (bulk) */}
          <section aria-labelledby="sec-team" className="rounded-2xl border border-slate-200 p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">2</span>
                <div>
                  <h2 id="sec-team" className="text-base font-bold text-slate-950">Team members</h2>
                  <p className="text-xs text-slate-500">Add your account owner and employees who will sign in.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkPaste(!showBulkPaste)}
                className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
              >
                {showBulkPaste ? 'Cancel paste' : 'Bulk paste'}
              </button>
            </div>

            {showBulkPaste && (
              <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/60 p-4">                <label className="block text-xs font-medium text-brand-800" htmlFor="bulk-paste">
                  Paste your team list — one person per line: <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">Name, Email, Role</code>
                </label>
                <textarea
                  id="bulk-paste"
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={5}
                  placeholder={'Juan Dela Cruz, juan@acme.com, Employee\nMaria Santos, maria@acme.com, HR Manager'}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                />
                {bulkError && <p className="mt-1 text-xs font-medium text-red-600">{bulkError}</p>}
                <button type="button" onClick={parseBulk} className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
                  Add to list
                </button>
              </div>
            )}

            {roleOptions.length === 0 && (
              <p className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                No roles have been configured by the system administrator yet — role selection is unavailable. You can still register team members.
              </p>
            )}

            <div className="space-y-3">
              {people.map((person, i) => (
                <div key={i} className={`grid gap-3 rounded-xl border p-4 shadow-sm transition hover:shadow-md sm:grid-cols-[1fr_1fr_auto_auto] sm:p-3 ${i === 0 ? 'border-brand-200 bg-gradient-to-br from-brand-50 to-white' : 'border-gray-200 bg-white'}`}>
                  <span className="col-span-full mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {i === 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] text-white">Account owner · CEO access</span>}
                    Member {i + 1}
                  </span>
                  <input
                    value={person.name}
                    onChange={(e) => setPerson(i, 'name', e.target.value)}
                    placeholder="Full name *"
                    aria-label={`Member ${i + 1} full name`}
                    className={inputCls}
                  />
                  <input
                    value={person.email}
                    onChange={(e) => setPerson(i, 'email', e.target.value)}
                    placeholder="name@company.com *"
                    type="email"
                    autoComplete="email"
                    aria-label={`Member ${i + 1} email`}
                    aria-invalid={person.email ? !isEmailValid(person.email) : undefined}
                    className={`${inputCls} ${person.email && !isEmailValid(person.email) ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : ''}`}
                  />
                  <select
                    value={person.role}
                    onChange={(e) => setPerson(i, 'role', e.target.value)}
                    aria-label={`Member ${i + 1} role`}
                    disabled={roleOptions.length === 0}
                    className={`${inputCls} sm:w-36`}
                  >
                    {roleOptions.length === 0 ? (
                      <option value="">No roles available</option>
                    ) : (
                      roleOptions.map((r) => <option key={r}>{r}</option>)
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => removePerson(i)}
                    disabled={people.length === 1}
                    title={people.length === 1 ? 'At least one member is required' : 'Remove'}
                    aria-label={`Remove member ${i + 1}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center justify-self-end rounded-lg border border-gray-200 text-red-500 transition enabled:hover:border-red-200 enabled:hover:bg-red-50 enabled:hover:text-red-600 disabled:opacity-30 sm:border-0 sm:justify-self-auto"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addPerson}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-white py-3.5 text-sm font-semibold text-brand-700 shadow-sm transition hover:border-brand-400 hover:bg-brand-50 hover:shadow"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add team member
            </button>
          </section>

          <div className="hidden" aria-hidden="true" />

          {/* Section 3 — Agreement */}
          <section aria-labelledby="sec-agreement" ref={agreementRef} className="rounded-2xl border border-slate-200 p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow">3</span>
              <div>
                <h2 id="sec-agreement" className="text-base font-bold text-slate-950 sm:text-lg">Agreement</h2>
                <p className="text-xs text-slate-500">Review the documents before submitting.</p>
              </div>
            </div>

            <label className={`flex items-start gap-3 rounded-xl border p-4 text-sm text-gray-600 transition ${
              legalError && !bothDocsRead ? 'border-red-300 bg-red-50 ring-2 ring-red-200' : 'border-gray-200 bg-gray-50'
            }`}>
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                disabled={!bothDocsRead}
                required
                aria-label="I agree to the Terms and Privacy Policy"
                className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
              />
              <span>
                I have read and agree to the{' '}
                <button type="button" onClick={() => setLegalView('terms')} className="font-semibold text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700 hover:decoration-brand-600">Terms &amp; Conditions</button>
                {' '}{readDocs.terms ? <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">✓</span> : <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500">•</span>}{' '}and{' '}
                <button type="button" onClick={() => setLegalView('privacy')} className="font-semibold text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700 hover:decoration-brand-600">Privacy Policy</button>
                {' '}{readDocs.privacy ? <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">✓</span> : <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500">•</span>}
              </span>
            </label>
            {!bothDocsRead && (
              <div
                className={`mt-2 flex items-start gap-2.5 rounded-xl p-4 text-xs leading-relaxed ring-1 transition ${
                  legalError ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-amber-50 text-amber-800 ring-amber-200'
                }`}
                role={legalError ? 'alert' : undefined}
              >
                <svg className={`mt-0.5 h-4 w-4 shrink-0 ${legalError ? 'text-red-500' : 'text-amber-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  {legalError ? (
                    <>
                      <span className="font-bold">Before you can submit:</span> please open and read both the{' '}
                      <button type="button" onClick={() => setLegalView('terms')} className="font-semibold underline">Terms &amp; Conditions</button> and{' '}
                      <button type="button" onClick={() => setLegalView('privacy')} className="font-semibold underline">Privacy Policy</button>,
                      then confirm each using “I have read and understood”.
                    </>
                  ) : (
                    <>You must open and read both documents before you can agree and submit.</>
                  )}
                </span>
              </div>
            )}
          </section>

          <button
            type="submit"
            disabled={!!nameError || checkingName || submitting}
            className={`group min-h-12 w-full rounded-xl px-4 py-3.5 text-sm font-semibold shadow-lg transition focus:outline-none focus:ring-4 ${nameError || checkingName || submitting ? 'cursor-not-allowed bg-slate-200 text-slate-500 focus:ring-slate-300/30' : 'bg-brand-600 text-white shadow-brand-600/20 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-xl focus:ring-brand-500/30'}`}
          >
            <span className="inline-flex items-center gap-2">
              {submitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Submitting registration…
                </>
              ) : checkingName ? 'Checking name…' : nameError ? 'Fix company name to continue' : `Submit registration`}
              {!submitting && <span className={`rounded-full bg-white/20 px-2.5 py-1 text-xs ${nameError||checkingName ? 'hidden' : 'group-hover:bg-white/30'}`}>{people.length} member{people.length !== 1 ? 's' : ''}</span>}
            </span>
          </button>

          <p className="text-center text-sm text-gray-500">
            Already registered? <Link to="/login" className="font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2 hover:text-brand-800 hover:decoration-brand-600">Sign in</Link>
          </p>
          <p className="text-center text-[11px] text-slate-400">Secure registration - Encrypted connection</p>
        </form>
      </div>
    </main>
  )
}
