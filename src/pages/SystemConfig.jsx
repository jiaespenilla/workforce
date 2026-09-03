import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { getActiveSettings, getPendingSettings, queueSystemSettings, pushSystemSettingsToServer, pushSystemIconToServer, getSystemTimeZone, isMaintenanceMode, setMaintenanceMode, getSessionTimeoutMinutes, setSessionTimeoutMinutes } from '../lib/systemSettings'
import { getLegalDocs, saveLegalDocs } from '../lib/legal'
import { getConfiguredRoles, saveRolesList, canAction } from '../lib/roles'
import { getSystemIcon, setSystemIcon } from '../lib/documentMeta'
import { SYSTEM_ICON_PRESETS } from '../lib/iconPresets'
import { api, apiEnabled } from '../lib/api'
import { loadVersionHistory, saveVersionHistory, seedInitialHistory } from '../lib/versionHistory'
import { PageLoader } from '../components/Skeleton'
import OrgPanel from './OrgPanel'

const TABS = [
  ['company', 'System Settings', 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z'],
  ['roles', 'Roles & Permissions', 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 1.37a6 6 0 10-6-6 6 6 0 006 6z'],
  ['email', 'Email Notifications', 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'],
  ['legal', 'Terms & Policies', 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'],
  ['organization', 'Organization', 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'],
  ['system', 'System Status', 'M13 10V3L4 14h7v7l9-11h-7z'],
  ['version', 'Version Control', 'M9 5h6M9 12h6M9 19h6m-3-7a3 3 0 110 6 3 3 0 010-6zm-7 7a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2H6a2 2 0 01-2-2v-1z'],
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
// so the numbers always reflect actual registered team members. Responsive: cards stack on mobile, grid on desktop.
function RolesPanel({ roles, onAdd, onRename, onRemove, onTogglePerm }) {
  const [expanded, setExpanded] = useState(null)
  const [roleQuery, setRoleQuery] = useState('')
  const [companies, setCompanies] = useState([])

  useEffect(() => {
    api('/api/companies').then(setCompanies).catch(() => setCompanies([]))
  }, [])

  // Group every registered employee under their role name.
  const membersByRole = {}
  for (const company of companies) {
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium text-gray-600">
            {roles.length} role{roles.length !== 1 ? 's' : ''} · {Object.keys(membersByRole).length} in use
          </p>
          {roles.length > 3 && (
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={roleQuery} onChange={(e)=>setRoleQuery(e.target.value)} placeholder="Search roles…" className="w-36 rounded-full border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/10 sm:w-44" />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98] min-h-[40px] sm:min-h-0"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add role
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center sm:p-10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200">
            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 1.37a6 6 0 10-6-6 6 6 0 006 6zM16 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <p className="mt-3 text-sm font-semibold text-gray-900">No roles configured yet</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 max-w-sm mx-auto">Add your first role — it will immediately become available when companies register their team members.</p>
          <button type="button" onClick={onAdd} className="mt-4 rounded-full bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-brand-700">Create first role</button>
        </div>
      ) : (
        <div className="space-y-4">
          {roles
            .map((r, originalIndex) => ({ r, originalIndex }))
            .filter(({ r }) => !roleQuery || r.name.toLowerCase().includes(roleQuery.toLowerCase()))
            .map(({ r, originalIndex: i }) => {
            const members = membersByRole[r.name.trim()] || []
            const isOpen = expanded === i
            return (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                  <input
                    value={r.name}
                    onChange={(e) => onRename(i, e.target.value)}
                    placeholder="Role name"
                    aria-label={`Role ${i + 1} name`}
                    className="w-full flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 transition placeholder-gray-400 hover:border-gray-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 min-h-[44px] sm:min-w-[160px]"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium tabular-nums ring-1 ${
                        members.length > 0 ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${members.length>0?'bg-brand-500':'bg-gray-300'}`} />
                      {members.length} user{members.length !== 1 ? 's' : ''}
                    </span>
                    {members.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : i)}
                        aria-expanded={isOpen}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 min-h-[32px]"
                      >
                        View
                        <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      title={members.length > 0 ? `${members.length} registered user(s) still use this role` : 'Delete role'}
                      className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-red-500 shadow-sm transition hover:bg-red-50 hover:text-red-600 sm:ml-0"
                      aria-label={`Delete ${r.name || 'role'}`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['dashboard', 'Dashboard'],
                    ['timekeeping', 'Time Keeping'],
                    ['tasks', 'Tasks'],
                    ['payroll', 'Payroll'],
                    ['employees', 'People'],
                    ['shifts', 'Shift Schedules'],
                    ['kiosk', 'Kiosk'],
                    // 'storage' removed (19) — Storage Setup is administrator-only
                    ['settings', 'This Console'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 transition hover:bg-white hover:shadow-sm">
                      <Toggle
                        checked={r.perms?.[key] !== false}
                        onChange={(value) => onTogglePerm(i, key, value)}
                      />
                      <span className="text-xs font-medium text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>

                {/* Action-level permissions */}
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Action buttons shown to this role:</p>
                  <div className="space-y-3">
                    {[
                      ['people', 'People', [['add', 'Add'], ['edit', 'Edit'], ['delete', 'Delete / Status']]],
                      ['tasks', 'Tasks', [['add', 'Add'], ['delete', 'Delete']]],
                      ['locations', 'Work Locations', [['add', 'Add'], ['edit', 'Edit'], ['delete', 'Delete']]],
                    ].map(([module, moduleLabel, actions]) => (
                      <div key={module} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                        <span className="w-full shrink-0 text-xs font-bold uppercase tracking-wide text-gray-500 sm:w-20 sm:normal-case sm:font-semibold sm:text-gray-700 sm:text-xs">{moduleLabel}</span>
                        <div className="flex flex-wrap gap-2">
                          {actions.map(([action, label]) => (
                            <label key={action} className="flex cursor-pointer items-center gap-2 rounded-full border border-white bg-white px-3 py-1.5 shadow-sm hover:shadow">
                              <Toggle
                                checked={canAction(r.perms, module, action)}
                                onChange={(value) => onTogglePerm(i, `actions.${module}.${action}`, value)}
                              />
                              <span className="text-xs font-medium text-gray-700">{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
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
          {roles.filter((r)=> !roleQuery || r.name.toLowerCase().includes(roleQuery.toLowerCase())).length===0 && roleQuery && (
            <p className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">No roles match “{roleQuery}”.</p>
          )}
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
  const [companies, setCompanies] = useState([])
  const [tasks, setTasks] = useState([])
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    api('/api/companies').then(setCompanies).catch(() => setCompanies([]))
    api('/api/tasks').then(setTasks).catch(() => setTasks([]))
    api('/api/notifications').then(setNotifications).catch(() => setNotifications([]))
  }, [])

  const activeCompanies = companies.filter((c) => c.active !== false)
  const employees = companies.flatMap((c) => c.employees)
  const activeEmployees = employees.filter((e) => e.active !== false)
  const pendingCount = companies.filter((c) => (c.status || 'pending') === 'pending').length

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

  const [showReset, setShowReset] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  const canReset = confirmChecked && confirmText.trim() === 'RESET' && !resetting
  const handleReset = async () => {
    if (!canReset) return
    setResetting(true)
    setResetError('')
    try {
      if (apiEnabled()) {
        await api('/api/admin/reset', { method: 'POST', body: { confirm: 'RESET' } })
      }
      // Clear local caches (both modes) — keep user session so admin stays logged in
      const keysToClear = ['uw_companies','uw_ceo_tasks','uw_punches','uw_notifications','uw_shift_schedules','uw_company_locations','uw_kiosk_configs','uw_kiosk_config','uw_org_units']
      keysToClear.forEach((k)=>{ try{ localStorage.removeItem(k)}catch{} })
      setResetSuccess(true)
      setTimeout(()=>{ window.location.reload() }, 1200)
    } catch (err) {
      setResetError(err.message || 'Reset failed.')
    } finally {
      setResetting(false)
    }
  }

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

      {/* Maintenance mode — stacks on mobile for thumb reach */}
      <div className={`rounded-xl border p-4 sm:p-5 ${maintenance ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 sm:text-base">Maintenance mode</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 sm:text-sm">
              When enabled, only administrators can sign in — all other users see a maintenance page.
              Takes effect immediately.
            </p>
          </div>
          <div className="self-start sm:self-auto">
            <Toggle
              checked={maintenance}
              onChange={(value) => {
                setMaintenanceMode(value)
                setMaintenance(value)
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4" data-tick={tick}>
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

      {/* Danger Zone — Reset Data */}
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
        <h3 className="text-sm font-bold text-red-800">Danger Zone</h3>
        <p className="mt-1 text-xs leading-relaxed text-red-700">
          Reset will permanently delete all companies, employees, tasks, attendance, notifications, shift schedules, locations and kiosk configs. System settings and roles are kept, and all company login accounts are removed — only the administrator and platform CEO can sign in afterward. This cannot be undone.
        </p>
        {resetSuccess ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">All data reset — reloading…</p>
        ) : (
          <button type="button" onClick={()=>{setShowReset(true); setConfirmText(''); setConfirmChecked(false); setResetError('')}} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700">Reset Data</button>
        )}
      </div>

      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>!resetting && setShowReset(false)}>
          <div className="absolute inset-0 bg-gray-900/60" />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e)=>e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">Confirm Reset — This cannot be undone</h3>
            <p className="mt-2 text-xs leading-relaxed text-gray-600">
              You are about to <span className="font-semibold text-red-700">permanently delete</span> all tenant data:
            </p>
            <ul className="mt-2 list-disc pl-5 text-xs text-gray-600">
              <li>{companies.length} companies &amp; {employees.length} employees</li>
              <li>{tasks.length} tasks, {notifications.length} notifications, attendance &amp; credentials</li>
              <li>Shift schedules, locations, kiosk configs (per-company)</li>
            </ul>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-200">System name, version, roles and the administrator login will be kept. All company login accounts are removed.</p>

            <label className="mt-4 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <input type="checkbox" checked={confirmChecked} onChange={(e)=>setConfirmChecked(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
              <span className="text-xs leading-relaxed text-gray-700">I understand this will <span className="font-semibold">permanently delete</span> all companies, employees, tasks and related data. I have made a backup if needed.</span>
            </label>

            <label className="mt-3 block text-xs font-medium text-gray-700">Type <span className="font-mono font-bold">RESET</span> to confirm:</label>
            <input value={confirmText} onChange={(e)=>setConfirmText(e.target.value)} placeholder="RESET" autoComplete="off" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-red-500 focus:outline-none focus:ring-4 focus:ring-red-500/10" />

            {resetError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">{resetError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={()=>setShowReset(false)} disabled={resetting} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">Cancel</button>
              <button type="button" onClick={handleReset} disabled={!canReset} className={`rounded-lg px-4 py-2 text-xs font-semibold text-white ${canReset ? 'bg-red-600 hover:bg-red-700' : 'cursor-not-allowed bg-gray-300'}`}>{resetting ? 'Resetting…' : 'Reset Data'}</button>
            </div>
            <p className="mt-3 text-center text-[10px] text-gray-400">Requires typing RESET + checkbox — two-step confirmation.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function VersionPanel({ settings, onSaved }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [version, setVersion] = useState(settings.version || 'v0.1.0')
  const [status, setStatus] = useState('development')
  const [changes, setChanges] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editChanges, setEditChanges] = useState('')
  const [editStatus, setEditStatus] = useState('development')

  useEffect(() => {
    let cancelled = false
    loadVersionHistory().then((list) => {
      if (cancelled) return
      if (!list.length) {
        const seeded = seedInitialHistory(settings.version)
        saveVersionHistory(seeded).then(()=>{})
        setHistory(seeded)
      } else {
        setHistory(list)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [settings.version])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!version.trim() || !changes.trim()) return
    const entry = {
      id: `v-${Date.now()}`,
      version: version.trim(),
      status,
      changes: changes.trim(),
      date: new Date().toISOString().slice(0, 10),
      author: 'Admin',
    }
    const next = [entry, ...history]
    setHistory(next)
    await saveVersionHistory(next)
    // Also sync system version if changed
    if (entry.version !== settings.version) {
      queueSystemSettings({ ...settings, version: entry.version })
      await pushSystemSettingsToServer({ name: settings.name, version: entry.version, timezone: settings.timezone })
      onSaved?.()
    }
    setChanges('')
    setShowAdd(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this version entry?')) return
    const next = history.filter((h)=>h.id!==id)
    setHistory(next)
    await saveVersionHistory(next)
  }

  const startEdit = (entry) => {
    setEditingId(entry.id)
    setEditChanges(entry.changes)
    setEditStatus(entry.status)
  }

  const saveEdit = async (id) => {
    const next = history.map((h)=> h.id===id ? {...h, changes: editChanges.trim() || h.changes, status: editStatus} : h)
    setHistory(next)
    await saveVersionHistory(next)
    setEditingId(null)
  }

  if (loading) return <PageLoader page="System Configuration" compact detail="Loading version history…" />

  return (
    <div className="space-y-5">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-base font-bold text-gray-900">Version Control</h2>
        <p className="mt-0.5 text-sm text-gray-500">Track system changes — current build is <span className="font-semibold">{settings.version}</span> in <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${status==='development'?'bg-amber-100 text-amber-800':'bg-emerald-100 text-emerald-800'}`}>{history[0]?.status || 'development'}</span>. Add entries as you develop.</p>
      </div>

      <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Current Version</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{settings.version}</p>
            <p className="text-xs text-gray-500">{settings.name} · {history[0]?.date || new Date().toISOString().slice(0,10)} · {history[0]?.status || 'development'}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${ (history[0]?.status||'development')==='development' ? 'bg-amber-500 text-white' : (history[0]?.status==='production' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white')}`}>{history[0]?.status || 'development'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Changelog — What changed ({history.length})</h3>
        <button type="button" onClick={()=>setShowAdd(!showAdd)} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">{showAdd ? 'Cancel' : '+ Add version'}</button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="font-medium text-gray-700">Version: *</span>
              <input value={version} onChange={(e)=>setVersion(e.target.value)} required placeholder="v0.2.0" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-gray-700">Status: *</span>
              <select value={status} onChange={(e)=>setStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="font-medium text-gray-700">Date:</span>
              <input type="date" defaultValue={new Date().toISOString().slice(0,10)} disabled className="mt-1 w-full rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm text-gray-400" />
            </label>
          </div>
          <label className="block text-xs">
            <span className="font-medium text-gray-700">What changed: *</span>
            <textarea value={changes} onChange={(e)=>setChanges(e.target.value)} required rows={3} placeholder="e.g., Added favicon presets, per-company kiosk, location management, inactive handling..." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={()=>setShowAdd(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-600">Cancel</button>
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white">Add to history</button>
          </div>
          <p className="text-[11px] text-gray-400">Adding will also update System version to the entered version and sync to D1 for all devices.</p>
        </form>
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
        {history.length===0 && <p className="p-6 text-center text-xs text-gray-400">No versions yet — add your first development entry.</p>}
        {history.map((h, idx)=>(
          <div key={h.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  {h.version} {idx===0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Current</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${h.status==='development'?'bg-amber-100 text-amber-800':h.status==='production'?'bg-emerald-100 text-emerald-800':h.status==='staging'?'bg-blue-100 text-blue-800':'bg-gray-100 text-gray-500'}`}>{h.status}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400">{h.date} · by {h.author}</p>
              </div>
              <div className="flex gap-1">
                {editingId===h.id ? (
                  <>
                    <button type="button" onClick={()=>saveEdit(h.id)} className="rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white">Save</button>
                    <button type="button" onClick={()=>setEditingId(null)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs">Cancel</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={()=>startEdit(h)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">Edit</button>
                    <button type="button" onClick={()=>handleDelete(h.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
                  </>
                )}
              </div>
            </div>
            {editingId===h.id ? (
              <div className="mt-3 space-y-2">
                <select value={editStatus} onChange={(e)=>setEditStatus(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                  <option value="archived">Archived</option>
                </select>
                <textarea value={editChanges} onChange={(e)=>setEditChanges(e.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs" />
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-gray-600">{h.changes}</p>
            )}
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

  const saveSystemSettings = async (e) => {
    e.preventDefault()
    const form = e.target
    const next = {
      name: form.systemName.value.trim() || settings.name,
      version: form.systemVersion.value.trim() || settings.version,
      timezone: form.timezone.value,
    }
    queueSystemSettings(next)
    // Persist to the server too, so every device picks the change up.
    await pushSystemSettingsToServer(next)
    flashSaved()
  }

  const saveOther = (e) => {
    e.preventDefault()
    flashSaved()
  }

  // Roles are edited locally and only persisted when Save is pressed.
  const [initialRolesJson, setInitialRolesJson] = useState(() => JSON.stringify(getConfiguredRoles()))
  const [savingRoles, setSavingRoles] = useState(false)
  const rolesDirty = JSON.stringify(roles) !== initialRolesJson

  const mutateRoles = (updater) => setRoles((prev) => updater(prev))

  const updateRoleName = (index, name) =>
    mutateRoles((prev) => prev.map((r, i) => (i === index ? { ...r, name } : r)))

  const addRole = () =>
    mutateRoles((prev) => [
      ...prev,
      { name: '', users: 0, access: 'Custom scope', perms: { dashboard: true, timekeeping: true, tasks: true, payroll: true, employees: true, shifts: true, kiosk: true, settings: false } },
    ])

  const removeRole = (index) => mutateRoles((prev) => prev.filter((_, i) => i !== index))

  const saveRoles = async () => {
    if (!rolesDirty || savingRoles) return
    // Do not save roles with blank names — require at least one visible character.
    if (roles.some((r) => !r.name?.trim())) return
    setSavingRoles(true)
    try {
      await saveRolesList(roles.map((r) => ({ ...r, name: r.name.trim() })))
      const snap = JSON.stringify(roles.map((r) => ({ ...r, name: r.name.trim() })))
      setInitialRolesJson(snap)
      // Normalize draft to trimmed names so dirty check stays accurate.
      setRoles((prev) => prev.map((r) => ({ ...r, name: r.name.trim() })))
      flashSaved()
    } finally {
      setSavingRoles(false)
    }
  }

  const discardRoles = () => {
    try {
      setRoles(JSON.parse(initialRolesJson))
    } catch {
      setRoles(getConfiguredRoles())
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

  const panelHeader = (title, subtitle) => (
    <div className="border-b border-gray-100 pb-4">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Page header — stacks on mobile, extra breathing room */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration Console</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">System Configuration</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Manage platform-wide settings, roles and policies. Works great on phone, tablet and desktop.</p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-brand-50 px-4 py-2.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200 sm:self-auto animate-pulse">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Saved successfully
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[260px_1fr] xl:grid-cols-[280px_1fr]">
        {/* Sidebar tabs — horizontal snap on mobile, sticky vertical on desktop */}
        <div className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 shadow-sm snap-x snap-mandatory scroll-pl-2 lg:flex-col lg:overflow-visible lg:self-start lg:sticky lg:top-20">
          {TABS.map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id}
              className={`flex shrink-0 snap-start items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition min-h-[44px] ${
                tab === id
                  ? 'bg-brand-600 text-white shadow-sm ring-1 ring-brand-600'
                  : 'text-gray-600 hover:bg-brand-50 hover:text-brand-700 active:bg-brand-100'
              }`}
            >
              <svg className={`h-5 w-5 shrink-0 ${tab === id ? 'text-white' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              <span className="whitespace-nowrap lg:whitespace-normal">{label}</span>
            </button>
          ))}
        </div>

        {/* Panels — responsive padding, max-width for readability */}
        <div className="min-w-0 space-y-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8">
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

              {/* System icon (favicon) — upload kept, plus 3 preset choices (synced to D1) */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">System icon (favicon)</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Displayed on the browser tab next to the page title. Recommended size: 64×64px PNG. Choose a preset or upload your own — synced across devices.
                </p>
                {/* Current preview + remove when set */}
                {systemIcon && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-white p-3">
                    <img src={systemIcon} alt="System icon preview" className="h-12 w-12 rounded-lg border border-gray-200 bg-white object-contain p-1" />
                    <span className="text-xs text-gray-500">Current</span>
                    <button
                      type="button"
                      onClick={() => { setSystemIcon(null); setSystemIconState(null); pushSystemIconToServer('') }}
                      className="ml-auto rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Remove icon
                    </button>
                  </div>
                )}
                {/* Preset selection — 3 choices */}
                <div className="mt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Or choose a preset</p>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {SYSTEM_ICON_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => { setSystemIcon(preset.src); setSystemIconState(preset.src); pushSystemIconToServer(preset.src) }}
                        className={`rounded-xl border-2 bg-white p-3 transition ${systemIcon === preset.src ? 'border-brand-600 ring-2 ring-brand-200' : 'border-gray-200 hover:border-brand-200'}`}
                        title={preset.label}
                      >
                        <img src={preset.src} alt={preset.label} className="h-10 w-10 mx-auto object-contain" />
                        <span className="mt-1 block text-[10px] font-medium text-gray-600">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Upload — always visible, not removed */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100">
                    Upload icon
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        if (file.size > 500 * 1024) { alert('Please choose an image under 500KB.'); e.target.value=''; return }
                        const reader = new FileReader()
                        reader.onload = () => {
                          const dataUrl = reader.result
                          setSystemIcon(dataUrl)
                          setSystemIconState(dataUrl)
                          pushSystemIconToServer(dataUrl)
                        }
                        reader.readAsDataURL(file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <span className="text-xs text-gray-400">PNG/SVG, &lt;500KB. Upload coexists with presets.</span>
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
                <button type="reset" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Discard</button>
                <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">Save changes</button>
              </div>
            </form>
          )}

          {tab === 'roles' && (
            <div className="space-y-5">
              <RolesPanel
                roles={roles}
                onAdd={addRole}
                onRename={updateRoleName}
                onRemove={removeRole}
                onTogglePerm={(index, key, value) =>
                  mutateRoles((prev) =>
                    prev.map((r, i) => {
                      if (i !== index) return r
                      const base = { ...(r.perms || {}) }
                      if (key.includes('.')) {
                        // nested path e.g. "actions.people.add"
                        const parts = key.split('.')
                        let node = base
                        for (let p = 0; p < parts.length - 1; p++) {
                          node[parts[p]] = { ...(node[parts[p]] || {}) }
                          node = node[parts[p]]
                        }
                        node[parts[parts.length - 1]] = value
                      } else {
                        base[key] = value
                      }
                      return { ...r, perms: base }
                    })
                  )
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
                <p className={`text-xs ${rolesDirty ? 'font-medium text-amber-600' : 'text-gray-400'}`}>
                  {roles.some((r) => !r.name?.trim())
                    ? 'Role names cannot be empty — fill in all names before saving.'
                    : rolesDirty
                      ? 'You have unsaved changes — edits, new roles or permission toggles will be lost until saved.'
                      : 'All changes saved.'}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={discardRoles}
                    disabled={!rolesDirty || savingRoles}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium ${!rolesDirty || savingRoles ? 'cursor-not-allowed border-gray-200 text-gray-400' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={saveRoles}
                    disabled={!rolesDirty || savingRoles || roles.some((r) => !r.name?.trim())}
                    className={`rounded-lg px-5 py-2 text-sm font-semibold shadow-sm ${!rolesDirty || savingRoles || roles.some((r) => !r.name?.trim()) ? 'cursor-not-allowed bg-gray-200 text-gray-400' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                  >
                    {savingRoles ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>
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

          {tab === 'version' && <VersionPanel settings={settings} onSaved={flashSaved} />}
        </div>
      </div>
    </div>
  )
}
