import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useRef, useState } from 'react'
import { Logo } from '../components/Layout'
import { getLegalDocs } from '../lib/legal'
import { getConfiguredRoles } from '../lib/roles'
import { api, apiEnabled } from '../lib/api'

const industries = ['Technology', 'Healthcare', 'Retail', 'Manufacturing', 'Finance', 'Education', 'Construction', 'Hospitality', 'Other']

const _NOTIFICATION_RECIPIENT = 'jiaespenilla@gmail.com'

function LegalModal({ title, content, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-gray-900/50" />
      <div
        className="relative flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto whitespace-pre-line px-6 py-4 text-sm leading-relaxed text-gray-600">{content}</div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Close</button>
          <button onClick={onConfirm} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            I have read and understood
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

export default function CompanyRegistration() {
  usePageTitle('Company Registration')
  const [logo, setLogo] = useState(null) // data URL
  const [submitted, setSubmitted] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [nameError, setNameError] = useState('')
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
        <div className="max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white text-center shadow-lg">
          <div className="h-2 w-full bg-gradient-to-r from-brand-600 to-emerald-400" />
          <div className="p-10">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
              <svg className="h-7 w-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Registration submitted!</h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Your company and team are now pending review by an administrator. Once approved, each team member can sign in with their registered email.
            </p>
            <a href="/login" className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Go to login</a>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!bothDocsRead) {
      setLegalError(true)
      agreementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())

    const members = people
      .map((p) => ({
        name: p.name.trim(),
        email: p.email.trim().toLowerCase(),
        role: p.role || 'Unassigned',
      }))
      .filter((p) => p.name && p.email)

    if (members.length === 0) {
      alert('Please add at least one team member with a name and email.')
      return
    }
    // Ensure emails are unique
    const emails = new Set()
    for (const m of members) {
      if (emails.has(m.email)) {
        alert(`Duplicate email: ${m.email}. Each team member needs a unique email.`)
        return
      }
      emails.add(m.email)
    }

    // Final duplicate-name guard before submit (covers race conditions)
    const trimmedCompanyName = (companyName || data.companyName || '').trim()
    if (!trimmedCompanyName) {
      alert('Company name is required.')
      return
    }
    if (nameError) {
      alert(nameError)
      return
    }

    const ceo = members.find((m) => m.role === 'CEO') || members[0]
    const company = {
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
        await api('/api/companies', { method: 'POST', body: company })
      } catch (err) {
        // Server returns 409 for duplicate names — surface as inline error
        if (err.status === 409) setNameError(err.message)
        alert(`Registration failed to save: ${err.message}`)
        return
      }

    }
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-700 via-brand-600 to-emerald-500 px-4 py-8 sm:py-12">
      {legalView && (
        <LegalModal
          title={legalView === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
          content={legal[legalView]}
          onConfirm={() => confirmRead(legalView)}
          onClose={() => setLegalView(null)}
        />
      )}

      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo light />
          <span className="hidden rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25 sm:inline">
            Step 1 of 1 · Registration
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-7 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-100 sm:p-8">
          {/* Section 1 — Company */}
          <section aria-labelledby="sec-company">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow">1</span>
              <div>
                <h2 id="sec-company" className="text-base font-bold text-gray-900 sm:text-lg">Company information</h2>
                <p className="text-xs leading-relaxed text-gray-500">Tell us about your organization — used for verification and branding.</p>
              </div>
            </div>

            <label className="mb-4 block cursor-pointer rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center text-sm text-gray-500 transition hover:border-brand-300 hover:bg-brand-50/40">
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
                <input name="address" required placeholder="123 Main St, Suite 100" className={`mt-1 ${inputCls}`} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">City: *</span>
                <input name="city" required placeholder="Makati" className={`mt-1 ${inputCls}`} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Industry: *</span>
                <select name="industry" required className={`mt-1 ${inputCls}`}>
                  {industries.map((i) => <option key={i}>{i}</option>)}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">Contact phone: *</span>
                <input name="contactPhone" required type="tel" placeholder="+63 917 000 0000" className={`mt-1 ${inputCls}`} />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">Contact email: *</span>
                <input name="contactEmail" required type="email" placeholder="info@company.com" className={`mt-1 ${inputCls}`} />
              </label>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Section 2 — Team (bulk) */}
          <section aria-labelledby="sec-team">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">2</span>
                <div>
                  <h2 id="sec-team" className="text-base font-bold text-gray-900">Team members</h2>
                  <p className="text-xs text-gray-500">Add your CEO and employees — they'll use these emails to sign in.</p>
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
                    aria-label={`Member ${i + 1} email`}
                    className={inputCls}
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
                    className="flex items-center justify-center rounded-lg px-3 py-2 text-red-500 transition enabled:hover:bg-red-50 enabled:hover:text-red-600 disabled:opacity-30"
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

          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

          {/* Section 3 — Agreement */}
          <section aria-labelledby="sec-agreement" ref={agreementRef}>
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow">3</span>
              <div>
                <h2 id="sec-agreement" className="text-base font-bold text-gray-900 sm:text-lg">Agreement</h2>
                <p className="text-xs text-gray-500">Review and agree to continue</p>
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
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
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
            disabled={!!nameError || checkingName}
            className={`group w-full rounded-xl py-4 text-sm font-semibold shadow-lg transition focus:outline-none focus:ring-4 ${nameError || checkingName ? 'cursor-not-allowed bg-gray-300 text-gray-500 focus:ring-gray-300/30' : 'bg-gradient-to-r from-brand-600 to-brand-700 text-white hover:from-brand-700 hover:to-brand-800 focus:ring-brand-500/30 hover:shadow-xl'}`}
          >
            <span className="inline-flex items-center gap-2">
              {checkingName ? 'Checking name…' : nameError ? 'Fix company name to continue' : `Submit registration`}
              <span className={`rounded-full bg-white/20 px-2.5 py-1 text-xs ${nameError||checkingName ? 'hidden' : 'group-hover:bg-white/30'}`}>{people.length} member{people.length !== 1 ? 's' : ''}</span>
            </span>
          </button>

          <p className="text-center text-sm text-gray-500">
            Already registered? <a href="/login" className="font-semibold text-brand-600 underline decoration-brand-200 underline-offset-2 hover:text-brand-700 hover:decoration-brand-600">Sign in</a>
          </p>
          <p className="text-center text-[11px] text-white/70">Secure registration • Encrypted • GDPR compliant</p>
        </form>
      </div>
    </div>
  )
}
