import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { getActiveSettings } from '../lib/systemSettings'

const CONFIG_KEY = 'uw_kiosk_config'

export function loadKioskConfig() {
  try {
    return {
      method: 'fingerprint',
      pinFallback: true,
      requireReAuth: false,
      pinLength: 4,
      lockoutAttempts: 5,
      qrRotation: 'daily',
      camera: 'rear',
      idleTimeout: 60,
      site: 'hq',
      ...JSON.parse(localStorage.getItem(CONFIG_KEY)),
    }
  } catch {
    return { method: 'fingerprint', pinFallback: true, requireReAuth: false, pinLength: 4, lockoutAttempts: 5, qrRotation: 'daily', camera: 'rear', idleTimeout: 60, site: 'hq' }
  }
}

function saveKioskConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

const methods = [
  {
    id: 'fingerprint',
    label: 'Fingerprint',
    tag: 'Default',
    desc: 'Biometric unlock using the device fingerprint sensor. Recommended for mobile kiosks.',
    icon: 'M12 11c0 3.5-1 5.5-2 7m4-9a9 9 0 00-.5 8m2-10.5c1.6 2 2.3 4.6 1.8 7.2M7.5 6.5A9 9 0 0112 5a9 9 0 015.5 1.9M5 9.5A9 9 0 016.2 8',
  },
  {
    id: 'pin',
    label: 'PIN Code',
    tag: null,
    desc: 'Employees enter a personal identification number on a numeric keypad.',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  },
  {
    id: 'qr',
    label: 'QR Code',
    tag: null,
    desc: 'Employees scan their personal QR badge with the kiosk camera.',
    icon: 'M3 9V5a2 2 0 012-2h4m6 0h4a2 2 0 012 2v4m0 6v4a2 2 0 01-2 2h-4m-6 0H5a2 2 0 01-2-2v-4M8 13v3h3m2-6h3v3',
  },
]

const SITES = { hq: 'Head Office', branch1: 'Branch 1 — Makati', branch2: 'Branch 2 — Cebu' }

export default function KioskSetup() {
  usePageTitle('Kiosk Setup')
  const [config, setConfig] = useState(loadKioskConfig)
  const [saved, setSaved] = useState(false)

  const update = (key, value) => setConfig((c) => ({ ...c, [key]: value }))

  // Live preview stays in sync while editing.
  useEffect(() => {
    setConfig((c) => c)
  }, [])

  const save = (e) => {
    e.preventDefault()
    saveKioskConfig(config)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10'
  const systemName = getActiveSettings().name

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Kiosk Setup</h1>
          <p className="mt-1 text-sm text-gray-500">Configure how employees authenticate at time-keeping kiosks. Saved settings are applied to every kiosk view.</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {saved && (
            <span className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Configuration saved
            </span>
          )}
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">Save configuration</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Authentication Method</h2>
            <p className="mt-1 text-sm text-gray-500">Select the primary sign-in method for kiosk devices.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {methods.map((m) => (
                <label
                  key={m.id}
                  className={`relative cursor-pointer rounded-xl border-2 p-4 transition ${
                    config.method === m.id ? 'border-brand-500 bg-brand-50/60' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" name="method" value={m.id} checked={config.method === m.id} onChange={() => update('method', m.id)} className="sr-only" />
                  {m.tag && (
                    <span className="absolute -top-2.5 right-3 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{m.tag}</span>
                  )}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.method === m.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                    </svg>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-gray-900">{m.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{m.desc}</p>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Method Options</h2>
            {config.method === 'fingerprint' && (
              <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Allow PIN fallback</p>
                    <p className="text-xs text-gray-500">Permit PIN entry when the fingerprint sensor is unavailable or fails.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!config.pinFallback}
                    onChange={(e) => update('pinFallback', e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Require re-authentication after checkout</p>
                    <p className="text-xs text-gray-500">Prevents duplicate punches on shared devices.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!config.requireReAuth}
                    onChange={(e) => update('requireReAuth', e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </div>
              </div>
            )}
            {config.method === 'pin' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">PIN length:</span>
                  <select value={String(config.pinLength)} onChange={(e) => update('pinLength', Number(e.target.value))} className={inputCls}>
                    <option value="4">4 digits</option>
                    <option value="6">6 digits</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Lockout after failed attempts:</span>
                  <select value={String(config.lockoutAttempts)} onChange={(e) => update('lockoutAttempts', Number(e.target.value))} className={inputCls}>
                    <option value="3">3 attempts</option>
                    <option value="5">5 attempts</option>
                    <option value="0">No lockout</option>
                  </select>
                </label>
              </div>
            )}
            {config.method === 'qr' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Badge QR rotation:</span>
                  <select value={config.qrRotation} onChange={(e) => update('qrRotation', e.target.value)} className={inputCls}>
                    <option value="static">Static (never expires)</option>
                    <option value="daily">Rotate daily</option>
                    <option value="weekly">Rotate weekly</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Camera device:</span>
                  <select value={config.camera} onChange={(e) => update('camera', e.target.value)} className={inputCls}>
                    <option value="rear">Rear camera (mobile)</option>
                    <option value="front">Front camera</option>
                  </select>
                </label>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Device Settings</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Idle timeout:</span>
                <select value={String(config.idleTimeout)} onChange={(e) => update('idleTimeout', Number(e.target.value))} className={inputCls}>
                  <option value="30">30 seconds</option>
                  <option value="60">60 seconds</option>
                  <option value="120">2 minutes</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Assigned branch / site:</span>
                <select value={config.site} onChange={(e) => update('site', e.target.value)} className={inputCls}>
                  {Object.entries(SITES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
            </div>
          </section>
        </div>

        <aside className="self-start lg:sticky lg:top-24">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Live Preview</p>
          <Preview method={config.method} systemName={systemName} site={SITES[config.site]} />
        </aside>
      </div>
    </form>
  )
}

function Preview({ method, systemName, site }) {
  return (
    <div className="mx-auto w-56 rounded-[2rem] border border-gray-200 bg-gray-900 p-2 shadow-xl">
      <div className="mx-auto mb-1 h-1.5 w-16 rounded-full bg-gray-700" />
      <div className="flex h-96 flex-col items-center justify-between rounded-[1.6rem] bg-gradient-to-b from-brand-600 to-emerald-500 px-4 py-6 text-white">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-100">{systemName}</p>
          {site && <p className="mt-0.5 text-[9px] text-emerald-100/80">{site}</p>}
        </div>
        <div className="flex flex-col items-center gap-3">
          {method === 'fingerprint' && (
            <>
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/40">
                <svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.5-1 5.5-2 7m4-9a9 9 0 00-.5 8m2-10.5c1.6 2 2.3 4.6 1.8 7.2M7.5 6.5A9 9 0 0112 5a9 9 0 015.5 1.9M5 9.5A9 9 0 016.2 8" />
                </svg>
              </div>
              <p className="text-xs font-medium text-emerald-100">Touch the sensor to sign in</p>
            </>
          )}
          {method === 'pin' && (
            <>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((i) => <span key={i} className="h-3.5 w-3.5 rounded-full bg-white/30 ring-1 ring-white/50" />)}
              </div>
              <div className="grid w-44 grid-cols-3 gap-1.5">
                {['1','2','3','4','5','6','7','8','','0','OK'].map((k, i) => (
                  <span key={i} className={`rounded-lg py-2 text-center text-xs font-semibold ${k === 'OK' ? 'bg-gray-900/40 text-white' : k ? 'bg-white/15 ring-1 ring-white/25' : ''}`}>{k}</span>
                ))}
              </div>
            </>
          )}
          {method === 'qr' && (
            <>
              <svg viewBox="0 0 21 21" className="h-32 w-32 rounded-xl bg-white p-2 fill-gray-900">
                <path d="M0 0h7v7H0zM2 2v3h3V2zM14 0h7v7h-7zM16 2v3h3V2zM0 14h7v7H0zM2 16v3h3v-3zM10 0h2v2h-2zM10 4h2v2h-2zM4 10h2v2H4zM8 8h2v2H8zM12 10h2v2h-2zM10 14h2v2h-2zM14 14h2v2h-2zM18 14h2v2h-2zM16 10h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>
              </svg>
              <p className="text-xs font-medium text-emerald-100">Scan your employee QR badge</p>
            </>
          )}
        </div>
        <div className="w-full rounded-lg bg-white/10 py-2 text-center text-[10px] font-medium text-emerald-100 ring-1 ring-white/20">
          Check In / Check Out
        </div>
      </div>
    </div>
  )
}
