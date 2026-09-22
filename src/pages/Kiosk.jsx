import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { fetchPublicSystemIcon, usePageTitle } from '../lib/documentMeta'
import { scanFingerprint, scannerAvailable, subscribeToFingerprintScans } from '../lib/kioskScanner'

const SESSION_KEY = 'uw_standalone_kiosk_session'

function sessionHeaders(token) {
  return token ? { 'X-Time-Clock-Kiosk': token } : {}
}

export default function Kiosk() {
  usePageTitle('Head Office Time Clock')
  const [token, setToken] = useState(() => localStorage.getItem(SESSION_KEY) || '')
  const [status, setStatus] = useState(null)
  const [code, setCode] = useState('')
  const [kioskName, setKioskName] = useState(() => navigator.userAgentData?.platform || navigator.platform || 'Head office kiosk')
  const [readerReady, setReaderReady] = useState(() => scannerAvailable())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const processingRef = useRef(false)

  useEffect(() => { fetchPublicSystemIcon() }, [])

  useEffect(() => {
    const timer = setInterval(() => setReaderReady(scannerAvailable()), 2000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!token) { setStatus(null); return }
    api('/api/time-clock/kiosk/status', { headers: sessionHeaders(token) })
      .then(setStatus)
      .catch(() => {
        localStorage.removeItem(SESSION_KEY)
        setToken('')
        setStatus(null)
        setNotice({ type: 'error', text: 'This kiosk needs to be paired again by an administrator.' })
      })
  }, [token])

  const pair = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await api('/api/time-clock/kiosk/pair', {
        method: 'POST',
        body: { code: code.trim(), name: kioskName.trim() },
      })
      localStorage.setItem(SESSION_KEY, result.token)
      setToken(result.token)
      setCode('')
      setNotice({ type: 'success', text: 'Kiosk paired successfully. Employees can now use the fingerprint reader.' })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally { setBusy(false) }
  }

  const sendScan = useCallback(async ({ terminalUserId, eventId }) => {
    if (!token || processingRef.current) return
    processingRef.current = true
    setBusy(true)
    setNotice({ type: 'info', text: 'Fingerprint recognized. Recording attendance…' })
    try {
      const result = await api('/api/time-clock/kiosk/punch', {
        method: 'POST',
        headers: sessionHeaders(token),
        body: { terminalUserId, eventId: eventId || crypto.randomUUID() },
      })
      setNotice({
        type: 'success',
        text: `${result.employeeName || 'Employee'} successfully clocked ${result.action === 'in' ? 'in' : 'out'} at ${new Date(result.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      })
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    } finally {
      processingRef.current = false
      setBusy(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return undefined
    return subscribeToFingerprintScans(sendScan)
  }, [token, sendScan])

  const startScan = async () => {
    if (busy) return
    setNotice({ type: 'info', text: 'Waiting for fingerprint…' })
    try { await sendScan(await scanFingerprint()) }
    catch (error) { setNotice({ type: 'error', text: error.message }) }
  }

  const unpair = async () => {
    if (!confirm('Unpair this kiosk computer? An administrator will need to create a new pairing code.')) return
    try { await api('/api/time-clock/kiosk/session', { method: 'DELETE', headers: sessionHeaders(token) }) } catch { /* clear this computer even if offline */ }
    localStorage.removeItem(SESSION_KEY)
    setToken('')
    setStatus(null)
    setNotice(null)
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-900/80 via-slate-950 to-slate-950" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden="true" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      <section className="relative w-full max-w-2xl rounded-3xl border border-white bg-white p-6 shadow-2xl ring-1 ring-white/20 sm:p-10">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand-600">Standalone workplace device</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Head Office Time Clock</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">No employee login is required. Fingerprint information stays inside the reader.</p>
        </div>

        {notice && (
          <div className={`mt-6 rounded-xl px-4 py-3 text-center text-sm font-medium ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800' : notice.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
            {notice.text}
          </div>
        )}

        {!token ? (
          <form onSubmit={pair} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold text-gray-900">Pair this kiosk once</h2>
              <p className="mt-1 text-sm text-gray-500">Ask an administrator to generate a pairing code in Time Clock Setup.</p>
            </div>
            <label className="block text-sm font-medium text-gray-700">Kiosk name
              <input value={kioskName} onChange={(event) => setKioskName(event.target.value.slice(0, 80))} required className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block text-sm font-medium text-gray-700">One-time pairing code
              <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} required autoComplete="one-time-code" inputMode="text" placeholder="ABCD2345" className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-4 text-center font-mono text-2xl font-bold tracking-[0.28em] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </label>
            <button disabled={busy || code.length !== 8} className="min-h-12 w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-50">{busy ? 'Pairing…' : 'Pair this kiosk'}</button>
          </form>
        ) : (
          <div className="mt-8">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-center">
              <p className="font-semibold text-gray-900">{status?.deviceName || 'Loading kiosk…'}</p>
              <p className="mt-1 text-sm text-gray-500">{status?.companyName || 'Checking secure pairing'}</p>
              <div className={`mx-auto mt-5 flex h-28 w-28 items-center justify-center rounded-full ${readerReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                <svg className="h-16 w-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" d="M12 11a1 1 0 100 2 1 1 0 000-2zm-4.5 1a4.5 4.5 0 019 0c0 3.5-1.5 6.5-4.5 8m-7.5-8a7.5 7.5 0 0115 0c0 2.7-.6 5.2-1.9 7.3M3 9.5a9.5 9.5 0 0118 4.2M8.5 16.5c.7-1.3 1-2.8 1-4.5a2.5 2.5 0 015 0c0 4-1.4 7.2-4.2 9.5" /></svg>
              </div>
              <h2 className="mt-4 text-xl font-bold text-gray-950">{readerReady ? 'Ready for fingerprint' : 'Fingerprint connector needed'}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{readerReady ? 'Place your finger on the connected reader.' : 'The kiosk is paired, but the manufacturer-specific reader connector is not installed on this computer yet.'}</p>
              <button type="button" onClick={startScan} disabled={busy || !readerReady || !status} className="mt-5 min-h-14 w-full rounded-xl bg-brand-600 px-6 py-3 text-lg font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45">{busy ? 'Processing…' : 'Scan fingerprint'}</button>
            </div>
            <div className="mt-5 flex items-center justify-between text-xs text-gray-400">
              <span>Secure device pairing active</span>
              <button type="button" onClick={unpair} className="font-semibold text-gray-500 hover:text-red-600">Unpair this kiosk</button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
