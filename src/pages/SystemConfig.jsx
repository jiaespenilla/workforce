import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { getActiveSettings, getPendingSettings, queueSystemSettings, getSystemTimeZone, isMaintenanceMode, setMaintenanceMode, getSessionTimeoutMinutes, setSessionTimeoutMinutes } from '../lib/systemSettings'
import { getLegalDocs, saveLegalDocs } from '../lib/legal'
import { getConfiguredRoles, saveRolesList } from '../lib/roles'
import { getAllCompanies } from '../lib/companies'
import { getSystemIcon, setSystemIcon, applyFavicon } from '../lib/documentMeta'
import OrgPanel from './OrgPanel'

const TABS = [
  ['company', 'System Settings', 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z'],
  ['roles', 'Roles & Permissions', 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 1.37a6 6 0 10-6-6 6 6 0 006 6z'],
  ['email', 'Email Notifications', 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'],
  ['legal', 'Terms & Policies', 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'],
  ['organization', 'Organization', 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'],
  ['system', 'System Status', 'M13 10V3L4 14h7v7l9-11h-7z'],
]

// Controlled toggle — persists via onChange (used for role permissions & maintenance).
// Enhanced design: wider pill with check/x icons for at-a-glance state.
function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      role="switch"
      aria-checked={!!checked}
      title={checked ? 'Enabled' : 'Disabled'}
      className={`relative h-7 w-14 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-4 ${
        checked ? 'bg-brand-600 focus:ring-brand-500/30' : 'bg-gray-300 focus:ring-gray-300/50'
      }`}
    >
      <span
        className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-all duration-200 ${
          checked ? 'left-[34px]' : 'left-1'
        }`}
      >
        {checked ? (
          <svg className="h-3 w-3 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </span>
      <span
        className={`absolute top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-wide transition-all ${
          checked ? 'left-1.5 text-white' : 'right-1.5 text-white'
        }`}
      >
        {checked ? 'On' : 'Off'}
      </span>
    </button>
  )
}

// Decorative/local toggle for preference lists that aren't persisted yet.
function LocalToggle({ defaultOn = false }) {
  const [on, setOn] = useState(defaultOn)
  return <Toggle checked={on} onChange={setOn} />
}

// Roles & Permissions panel — user counts are computed from real company registrations,
// so the numbers always reflect actual registered team members.
function RolesPanel({ roles, onAdd, onRename, onRemove, onTogglePerm }) {
  const [expanded, setExpanded] = useState(null)

  // Group every registered employee under their role name.
  const membersByRole = {}
  for (const company of getAllCompanies()) {
    for (const emp of company.employees) {
      const roleName = (emp.role || '').trim() || 'Unassigned'
      if (!membersByRole[roleName]) membersByRole[roleName] = []
      membersByRole[roleName].push({ name: emp.name, email: emp.email, company: company.name })
    }
  }

  // Roles present in registrations but not configured by the admin.
  const unconfigured = Object.keys(membersByRole).filter(
    (name) => !roles.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())
  )

  return (
    <div>
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-base font-bold text-gray-900">Roles &amp; Permissions</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          These roles appear in company registration and across the CEO &amp; employee views.
          User counts come from actual registrations — expand a role to see who holds it and from which companies.
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {roles.length} configured role{roles.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          + Add role
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
          <svg className="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 1.37a6 6 0 10-6-6 6 6 0 006 6zM16 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p className="text-sm font-medium text-gray-900">No roles configured yet</p>
          <p className="mt-1 text-xs text-gray-500">Add your first role — it will immediately become available when companies register their team members.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((r, i) => {
            const members = membersByRole[r.name.trim()] || []
            const isOpen = expanded === i
            return (
              <div key={i} className="rounded-xl border border-gray-200 p-4 transition hover:border-brand-200">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    value={r.name}
                    onChange={(e) => onRename(i, e.target.value)}
                    placeholder="Role name"
                    aria-label={`Role ${i + 1} name`}
                    className="min-w-[140px] flex-1 rounded-lg border border-transparent bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 transition placeholder-gray-400 hover:border-gray-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs tabular-nums ring-1 ${
                      members.length > 0 ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
                    }`}
                  >
                    {members.length} user{members.length !== 1 ? 's' : ''} registered
                  </span>
                  {members.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      View members
                      <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    title={members.length > 0 ? `${members.length} registered user(s) still use this role` : 'Delete role'}
                    className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${r.name || 'role'}`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 pl-1 text-xs text-gray-600">
                  {[
                    ['dashboard', 'Dashboard'],
                    ['timekeeping', 'Time Keeping'],
                    ['tasks', 'Tasks'],
                    ['payroll', 'Payroll'],
                    ['employees', 'Employees'],
                    ['kiosk', 'Kiosk'],
                    ['settings', 'This Console'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2">
                      <Toggle
                        checked={r.perms?.[key] !== false}
                        onChange={(value) => onTogglePerm(i, key, value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                {isOpen && members.length > 0 && (
                  <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50">
                    {members.map((m) => (
                      <div key={`${m.company}-${m.email}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                        <span className="font-medium text-gray-900">{m.name}</span>
                        <span className="text-gray-400">{m.email}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 ring-1 ring-gray-200">{m.company}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {unconfigured.length > 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
          Registered teams are using roles not in this list: <span className="font-semibold">{unconfigured.join(', ')}</span>.
          Add them above (or update the registrations) so they stay aligned across the system.
        </p>
      )}
    </div>
  )
}

// System Status — real-time metrics computed from actual stored data.
function StatusPanel({ settings }) {
  const [now, setNow] = useState(new Date())
  const [maintenance, setMaintenance] = useState(isMaintenanceMode())
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Re-read metrics periodically so the panel stays current.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

  const tz = getSystemTimeZone()
  const companies = getAllCompanies()
  const activeCompanies = companies.filter((c) => c.active !== false)
  const employees = companies.flatMap((c) => c.employees)
  const activeEmployees = employees.filter((e) => e.active !== false)
  const pendingCount = companies.filter((c) => (c.status || 'pending') === 'pending').length

  let notifications = []
  let tasks = []
  try {
    notifications = JSON.parse(localStorage.getItem('uw_notifications')) || []
    tasks = JSON.parse(localStorage.getItem('uw_ceo_tasks')) || []
  } catch { /* ignore */ }

  let storageBytes = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('uw_')) storageBytes += (localStorage.getItem(key) || '').length + key.length
  }
  const storageKb = (storageBytes / 1024).toFixed(1)

  const metrics = [
    ['Registered companies', `${companies.length} (${activeCompanies.length} active · ${companies.length - activeCompanies.length} inactive)`],
    ['Pending approvals', String(pendingCount)],
    ['Team members', `${employees.length} registered · ${activeEmployees.length} active`],
    ['Tasks', `${tasks.filter((t) => t.status !== 'completed').length} open · ${tasks.filter((t) => t.status === 'completed').length} completed`],
    ['Registration notifications', `${notifications.length} queued (SMTP pending)`],
    ['Local storage used', `${storageKb} KB`],
    ['System version', settings.version],
    ['Time zone', tz],
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">System Status</h2>
          <p className="mt-0.5 text-sm text-gray-500">Live overview computed from real platform data.</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-gray-900">
            {now.toLocaleTimeString([], { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-xs text-gray-400">{now.toLocaleDateString([], { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </div>

      {/* Maintenance mode */}
      <div className={`rounded-xl border p-4 ${maintenance ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Maintenance mode</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
              When enabled, only administrators can sign in — all other users see a maintenance page.
              Takes effect immediately.
            </p>
          </div>
          <Toggle
            checked={maintenance}
            onChange={(value) => {
              setMaintenanceMode(value)
              setMaintenance(value)
            }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-tick={tick}>
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Platform</p>
          </div>
          <p className="mt-2 text-sm font-medium text-gray-900">Operational{maintenance ? ' · Maintenance mode ON' : ''}</p>
        </div>
        {metrics.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-gray-200 p-5 transition hover:border-brand-200 hover:shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{k}</p>
            <p className="mt-2 text-sm font-medium text-gray-900">{v}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SystemConfig() {
  usePageTitle('System Configuration')
  const [tab, setTab] = useState('company')
  const [saved, setSaved] = useState(false)
  const [roles, setRoles] = useState(getConfiguredRoles)
  const [legalDocs, setLegalDocs] = useState(getLegalDocs)
  const [systemIcon, setSystemIconState] = useState(getSystemIcon)
  const settings = getActiveSettings()
  const pending = getPendingSettings()

  const flashSaved = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const saveSystemSettings = (e) => {
    e.preventDefault()
    const form = e.target
    queueSystemSettings({
      name: form.systemName.value.trim() || settings.name,
      version: form.systemVersion.value.trim() || settings.version,
      timezone: form.timezone.value,
    })
    flashSaved()
  }

  const saveOther = (e) => {
    e.preventDefault()
    flashSaved()
  }

  const mutateRoles = (updater) =>
    setRoles((prev) => {
      const next = updater(prev)
      saveRolesList(next)
      return next
    })

  const updateRoleName = (index, name) =>
    mutateRoles((prev) => prev.map((r, i) => (i === index ? { ...r, name } : r)))

  const addRole = () =>
    mutateRoles((prev) => [
      ...prev,
      { name: '', users: 0, access: 'Custom scope', perms: { mainMenu: true, kiosk: true, settings: false } },
    ])

  const removeRole = (index) => mutateRoles((prev) => prev.filter((_, i) => i !== index))

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

  const panelHeader = (title, subtitle) => (
    <div className="border-b border-gray-100 pb-4">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration Console</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">System Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">Manage platform-wide settings, roles and policies.</p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700 ring-1 ring-brand-200 sm:self-auto">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Saved successfully
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Sidebar tabs — vertical on desktop, horizontal scroll on mobile */}
        <div className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 shadow-sm lg:flex-col lg:overflow-visible lg:self-start">
          {TABS.map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                tab === id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-brand-50 hover:text-brand-700'
              }`}
            >
              <svg className={`h-5 w-5 shrink-0 ${tab === id ? 'text-white' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              {label}
            </button>
          ))}
        </div>

        {/* Panels */}
        <div className="min-w-0 space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          {tab === 'company' && (
            <form onSubmit={saveSystemSettings} className="space-y-5">
              {panelHeader('System Details', `These values identify "${settings.name}" across all client devices.`)}
              {pending && (
                <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                  You have pending changes — they will take effect after you sign out.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-gray-700">System name:</span>
                  <input name="systemName" defaultValue={settings.name} required className={inputCls} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">System version:</span>
                  <input name="systemVersion" defaultValue={settings.version} required className={`${inputCls} tabular-nums`} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Time zone:</span>
                  <select name="timezone" className={inputCls} defaultValue={settings.timezone}>
                    <option>(GMT+08:00) Asia/Manila</option>
                    <option>(GMT+00:00) UTC — Coordinated Universal Time</option>
                    <option>(GMT-05:00) America/New_York</option>
                    <option>(GMT+00:00) Europe/London</option>
                    <option>(GMT+01:00) Europe/Paris</option>
                    <option>(GMT+09:00) Asia/Tokyo</option>
                  </select>
                </label>
              </div>

              {/* Session time-out */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">Idle session time-out</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                  Automatically signs out users after this many minutes of inactivity. Users are warned one minute before.
                  Applies immediately to all signed-in users. Set 0 to disable.
                </p>
                <label className="mt-3 block w-40 text-sm">
                  <span className="font-medium text-gray-700">Minutes:</span>
                  <input
                    type="number"
                    min="0"
                    defaultValue={getSessionTimeoutMinutes()}
                    onChange={(e) => setSessionTimeoutMinutes(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                  />
                </label>
              </div>

              {/* System icon (favicon) */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">System icon (favicon)</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Displayed on the browser tab next to the page title. Recommended size: 64×64px PNG.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {systemIcon ? (
                    <>
                      <img src={systemIcon} alt="System icon preview" className="h-12 w-12 rounded-lg border border-gray-200 bg-white object-contain p-1" />
                      <button
                        type="button"
                        onClick={() => { setSystemIcon(null); setSystemIconState(null) }}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove icon
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100">
                      Upload icon
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => {
                            const dataUrl = reader.result
                            setSystemIcon(dataUrl)
                            setSystemIconState(dataUrl)
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
                <button type="reset" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Discard</button>
                <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">Save changes</button>
              </div>
            </form>
          )}

          {tab === 'roles' && (
            <RolesPanel
              roles={roles}
              onAdd={addRole}
              onRename={updateRoleName}
              onRemove={removeRole}
              onTogglePerm={(index, key, value) =>
                mutateRoles((prev) =>
                  prev.map((r, i) => (i === index ? { ...r, perms: { ...r.perms, [key]: value } } : r))
                )
              }
            />
          )}

          {tab === 'email' && (
            <form onSubmit={saveOther} className="space-y-5">
              {panelHeader('Email Notifications', 'Delivery settings for automated system emails.')}

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">SMTP not yet configured</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  The SMTP host and from address are required before notification emails (including new company registrations to{' '}
                  <span className="font-semibold">jiaespenilla@gmail.com</span>) can be delivered. Until then, notifications are queued locally.
                  Gmail settings: host <span className="font-semibold">smtp.gmail.com</span>, port 587, app password.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">SMTP host:</span>
                  <input name="smtpHost" placeholder="e.g. smtp.gmail.com" className={inputCls} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">From address:</span>
                  <input name="fromAddress" type="email" placeholder="e.g. no-reply@yourdomain.com" className={inputCls} />
                </label>
              </div>

              <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">New company registrations</p>
                    <p className="mt-0.5 text-xs text-gray-500">Notifies you whenever a new company completes registration.</p>
                  </div>
                  <LocalToggle defaultOn />
                </div>
                <label className="mt-4 block text-sm">
                  <span className="font-medium text-gray-700">Default recipient:</span>
                  <input type="email" defaultValue="jiaespenilla@gmail.com" required className={`${inputCls} max-w-md`} />
                </label>
              </div>

              <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {[
                  ['Daily attendance summary', 'Send digest of check-ins to managers'],
                  ['Payroll processed alert', 'Notify employees when payslips are ready'],
                  ['Task assignment notice', 'Email assignees on new tasks'],
                  ['Pending approval reminders', 'Remind approvers every 24 hours'],
                ].map(([title, desc]) => (
                  <div key={title} className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{title}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                    <LocalToggle defaultOn />
                  </div>
                ))}
              </div>

              <div className="flex justify-end border-t border-gray-100 pt-5">
                <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">Save changes</button>
              </div>
            </form>
          )}

          {tab === 'legal' && (
            <div className="space-y-5">
              {panelHeader('Terms & Policies', 'Shown to companies during registration. Changes apply immediately to the registration page.')}
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Terms & Conditions</span>
                <textarea
                  value={legalDocs.terms}
                  onChange={(e) => setLegalDocs({ ...legalDocs, terms: e.target.value })}
                  rows={9}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Privacy Policy:</span>
                <textarea
                  value={legalDocs.privacy}
                  onChange={(e) => setLegalDocs({ ...legalDocs, privacy: e.target.value })}
                  rows={9}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                />
              </label>
              <div className="flex items-center justify-between border-t border-gray-100 pt-5">
                <button
                  type="button"
                  onClick={() => setLegalDocs(getLegalDocs())}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  onClick={() => { saveLegalDocs(legalDocs); flashSaved() }}
                  className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
                >
                  Save documents
                </button>
              </div>
            </div>
          )}

          {tab === 'organization' && <OrgPanel />}

          {tab === 'system' && <StatusPanel settings={settings} />}
        </div>
      </div>
    </div>
  )
}
