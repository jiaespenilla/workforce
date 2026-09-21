import { useEffect, useMemo, useState } from 'react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { api, apiEnabled } from '../lib/api'

function deviceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Personal phone'
  return `${platform} passkey`.slice(0, 60)
}

function locationForPunch() {
  if (!navigator.geolocation) return Promise.resolve({ status: 'unsupported' })
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => finish({ status: 'unavailable' }), 8000)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer)
        finish({
          status: 'granted',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      (error) => {
        clearTimeout(timer)
        finish({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' })
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 },
    )
  })
}

function friendlyError(error, fallback) {
  if (error?.name === 'NotAllowedError') return 'Phone verification was cancelled. Nothing was recorded.'
  return error?.message || fallback
}

export default function PersonalTimeClock({ clockedIn = false, onPunch, manageOnly = false }) {
  const [passkeys, setPasskeys] = useState([])
  const [name, setName] = useState(() => deviceName())
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [pending, setPending] = useState(null)
  const supported = useMemo(() => typeof window !== 'undefined' && !!window.PublicKeyCredential, [])

  const load = async () => {
    if (!apiEnabled()) return
    try { setPasskeys(await api('/api/time-clock/passkeys')) } catch (error) { setNotice({ type: 'error', text: error.message }) }
  }

  useEffect(() => { load() }, [])

  const register = async () => {
    if (busy || !supported) return
    setBusy('register')
    setNotice(null)
    try {
      const optionsJSON = await api('/api/time-clock/passkeys/register/options', { method: 'POST' })
      const response = await startRegistration({ optionsJSON })
      await api('/api/time-clock/passkeys/register/verify', { method: 'POST', body: { response, name } })
      await load()
      setNotice({ type: 'success', text: 'This phone is ready for secure clocking.' })
    } catch (error) {
      setNotice({ type: 'error', text: friendlyError(error, 'Could not register this phone.') })
    } finally { setBusy('') }
  }

  const sendPunch = async (saved = pending, continueAfterVerification = false) => {
    if (!saved || (busy && !continueAfterVerification)) return
    setBusy('punch')
    setNotice({ type: 'info', text: 'Sending your verified punch…' })
    try {
      const result = await api('/api/time-clock/clock-punch', { method: 'POST', body: saved })
      setPending(null)
      setNotice({
        type: 'success',
        text: `${result.action === 'in' ? 'Clocked in' : 'Clocked out'} successfully at ${new Date(result.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.${result.locationStatus === 'granted' ? ' Location recorded.' : ' Location was not available.'}`,
      })
      onPunch?.(result)
    } catch (error) {
      setPending(saved)
      setNotice({ type: 'error', text: `${error.message || 'Network error.'} Your punch was not marked successful; use Retry to safely send the same request.` })
    } finally { setBusy('') }
  }

  const punch = async () => {
    if (busy || !supported || passkeys.length === 0) return
    setBusy('verify')
    setNotice({ type: 'info', text: 'Checking location before phone verification…' })
    try {
      const location = await locationForPunch()
      const optionsJSON = await api('/api/time-clock/clock-options', { method: 'POST' })
      const response = await startAuthentication({ optionsJSON })
      const request = { requestId: crypto.randomUUID(), response, location }
      setPending(request)
      setBusy('')
      await sendPunch(request, true)
    } catch (error) {
      setNotice({ type: 'error', text: friendlyError(error, 'Could not verify this punch.') })
      setBusy('')
    }
  }

  const revoke = async (id) => {
    if (busy || !confirm('Remove this phone passkey? It will no longer be able to clock in or out.')) return
    setBusy('revoke')
    try {
      await api(`/api/time-clock/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await load()
      setNotice({ type: 'success', text: 'Phone passkey removed.' })
    } catch (error) { setNotice({ type: 'error', text: error.message }) }
    finally { setBusy('') }
  }

  if (!apiEnabled()) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Personal phone clocking needs the online server and is not available in local demo mode.</div>
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Secure personal phone</p>
          <h2 className="mt-1 text-xl font-bold text-gray-900">{manageOnly ? 'My phone passkeys' : 'Clock in or out'}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
            Your fingerprint or Face ID stays on your phone. The app receives only a secure approval from the phone.
          </p>
        </div>
        {!manageOnly && (
          <button
            type="button"
            onClick={punch}
            disabled={!!busy || !supported || passkeys.length === 0}
            className="min-h-14 rounded-xl bg-brand-600 px-8 py-3 text-base font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'verify' ? 'Verifying…' : busy === 'punch' ? 'Sending…' : clockedIn ? 'Clock Out' : 'Clock In'}
          </button>
        )}
      </div>

      {notice && (
        <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800' : notice.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
          {notice.text}
        </div>
      )}
      {pending && !busy && (
        <button type="button" onClick={() => sendPunch()} className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100">Retry the same punch safely</button>
      )}

      <div className="mt-5 border-t border-gray-100 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium text-gray-700">
            Name this phone
            <input value={name} onChange={(event) => setName(event.target.value.slice(0, 60))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          </label>
          <button type="button" onClick={register} disabled={!!busy || !supported || !name.trim()} className="min-h-11 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
            {busy === 'register' ? 'Registering…' : 'Register this phone'}
          </button>
        </div>
        {!supported && <p className="mt-2 text-xs text-red-600">This browser does not support phone passkeys.</p>}

        <div className="mt-4 space-y-2">
          {passkeys.map((passkey) => (
            <div key={passkey.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{passkey.name}</p>
                <p className="text-xs text-gray-500">{passkey.lastUsedAt ? `Last used ${new Date(passkey.lastUsedAt).toLocaleString()}` : `Added ${new Date(passkey.createdAt).toLocaleDateString()}`}</p>
              </div>
              <button type="button" onClick={() => revoke(passkey.id)} disabled={!!busy} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Remove</button>
            </div>
          ))}
          {passkeys.length === 0 && <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">Register this phone before your first punch.</p>}
        </div>
      </div>
    </section>
  )
}
