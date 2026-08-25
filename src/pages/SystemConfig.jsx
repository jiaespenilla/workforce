import { useState } from 'react'
import { getActiveSettings, getPendingSettings, queueSystemSettings } from '../lib/systemSettings'

const DEFAULT_ROLES = [
  { name: 'Administrator', users: 1, access: 'System configuration only — sole account: admin_celestine', perms: { mainMenu: false, kiosk: false, settings: true } },
  { name: 'HR Manager', users: 3, access: 'Full workforce suite', perms: { mainMenu: true, kiosk: true, settings: false } },
  { name: 'Team Lead', users: 6, access: 'Dashboard, timekeeping & tasks', perms: { mainMenu: true, kiosk: true, settings: false } },
  { name: 'Employee', users: 42, access: 'Own records & kiosk punch', perms: { mainMenu: true, kiosk: true, settings: false } },
]

function loadRoles() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_roles'))
    return Array.isArray(stored) && stored.length ? stored : DEFAULT_ROLES
  } catch {
    return DEFAULT_ROLES
  }
}

function Toggle({ defaultOn = true }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-300'}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export default function SystemConfig() {
  const [tab, setTab] = useState('company')
  const [saved, setSaved] = useState(false)
  const [roles, setRoles] = useState(loadRoles)
  const settings = getActiveSettings()
  const pending = getPendingSettings()
  const tabs = [
    ['company', 'System Settings'],
    ['roles', 'Roles & Permissions'],
    ['email', 'Email Notifications'],
    ['system', 'System Status'],
  ]

  const saveSystemSettings = (e) => {
    e.preventDefault()
    const form = e.target
    queueSystemSettings({
      name: form.systemName.value.trim() || settings.name,
      version: form.systemVersion.value.trim() || settings.version,
      timezone: form.timezone.value,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const saveOther = (e) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const updateRoleName = (index, name) => {
    setRoles((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, name } : r))
      localStorage.setItem('uw_roles', JSON.stringify(next))
      return next
    })
  }

  const addRole = () => {
    setRoles((prev) => {
      const next = [...prev, { name: 'New Role', users: 0, access: 'Custom scope', perms: { mainMenu: true, kiosk: true, settings: false } }]
      localStorage.setItem('uw_roles', JSON.stringify(next))
      return next
    })
  }

  const removeRole = (index) => {
    setRoles((prev) => {
      if (prev[index].name === 'Administrator') return prev
      const next = prev.filter((_, i) => i !== index)
      localStorage.setItem('uw_roles', JSON.stringify(next))
      return next
    })
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">System Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">Restricted to administrator accounts.</p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-2 self-start rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 ring-1 ring-brand-200 sm:self-auto">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Changes saved — applied after sign out
          </span>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-brand-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'company' && (
        <form onSubmit={saveSystemSettings} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">System Details</h2>
          <p className="mt-1 text-sm text-gray-500">These values identify the platform across all client devices.</p>
          {pending && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
              You have unsaved-pending changes — they will take effect after you sign out.
            </p>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-gray-700">System name</span>
              <input name="systemName" defaultValue={settings.name} required className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">System version</span>
              <input name="systemVersion" defaultValue={settings.version} required className={`${inputCls} tabular-nums`} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Time zone</span>
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
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
            <button type="reset" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Discard</button>
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">Save changes</button>
          </div>
        </form>
      )}

      {tab === 'roles' && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-3">
            <p className="text-xs text-gray-500">Administrators are restricted to this console. Workforce roles receive the full suite and kiosk access. Click a role name to rename it.</p>
            <button
              type="button"
              onClick={addRole}
              className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              + Add role
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Users</th>
                  <th className="px-6 py-3">Access scope</th>
                  <th className="px-6 py-3 text-center">Main Menu</th>
                  <th className="px-6 py-3 text-center">Kiosk</th>
                  <th className="px-6 py-3 text-center">This Console</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roles.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <input
                        value={r.name}
                        onChange={(e) => updateRoleName(i, e.target.value)}
                        className="w-full min-w-[120px] rounded-md border border-transparent px-2 py-1 font-medium text-gray-900 transition hover:border-gray-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        aria-label="Role name"
                      />
                    </td>
                    <td className="px-6 py-3 tabular-nums text-gray-600">{r.users}</td>
                    <td className="px-6 py-3 text-gray-500">{r.access}</td>
                    <td className="px-6 py-3 text-center"><Toggle defaultOn={r.perms.mainMenu} /></td>
                    <td className="px-6 py-3 text-center"><Toggle defaultOn={r.perms.kiosk} /></td>
                    <td className="px-6 py-3 text-center"><Toggle defaultOn={r.perms.settings} /></td>
                    <td className="px-6 py-3 text-right">
                      {r.name !== 'Administrator' && (
                        <button
                          type="button"
                          onClick={() => removeRole(i)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${r.name}`}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'email' && (
        <form onSubmit={saveOther} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Email Notifications</h2>
            <p className="mt-1 text-sm text-gray-500">Delivery settings for automated system emails.</p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">SMTP not configured</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-700">
              The SMTP host and from address are required before notification emails (including new company registrations to{' '}
              <span className="font-semibold">jiaespenilla@gmail.com</span>) can be delivered. Until then, registration notifications are queued locally.
              Common Gmail SMTP settings: host <span className="font-semibold">smtp.gmail.com</span>, port 587, using an app password.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">SMTP host</span>
              <input name="smtpHost" placeholder="e.g. smtp.gmail.com" className={inputCls} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">From address</span>
              <input name="fromAddress" type="email" placeholder="e.g. no-reply@yourdomain.com" className={inputCls} />
            </label>
          </div>

          <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">New company registrations</p>
                <p className="mt-0.5 text-xs text-gray-500">Sends a notification whenever a new company completes registration.</p>
              </div>
              <Toggle />
            </div>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-gray-700">Default recipient</span>
              <input type="email" defaultValue="jiaespenilla@gmail.com" required className={`${inputCls} max-w-md`} />
            </label>
          </div>

          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
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
                <Toggle />
              </div>
            ))}
          </div>

          <div className="flex justify-end border-t border-gray-100 pt-5">
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">Save changes</button>
          </div>
        </form>
      )}

      {tab === 'system' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['System status', 'All systems operational'],
            ['Database', 'PostgreSQL 16 · Connected'],
            ['Storage used', '64% of 500 GB'],
            ['Last backup', 'Today, 03:00 AM'],
            ['App version', `${settings.version} (stable)`],
            ['Email queue', '0 pending · Healthy'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{k}</p>
              </div>
              <p className="mt-2 text-sm font-medium text-gray-900">{v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
