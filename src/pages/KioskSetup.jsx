import { useEffect, useMemo, useRef, useState } from 'react'
import { usePageTitle } from '../lib/documentMeta'
import { api } from '../lib/api'
import { getCompanyLocations } from '../lib/locations'

function statusLabel(device) {
  if (!device.active) return ['Revoked', 'bg-red-50 text-red-700']
  if (!device.last_seen_at) return ['Not connected', 'bg-gray-100 text-gray-600']
  const recent = Date.now() - new Date(device.last_seen_at).getTime() < 10 * 60 * 1000
  return recent ? ['Connected', 'bg-emerald-50 text-emerald-700'] : ['Offline', 'bg-amber-50 text-amber-700']
}

function pairingBadge(status) {
  if (status === 'used') return ['Used', 'bg-emerald-100 text-emerald-800']
  if (status === 'expired') return ['Expired', 'bg-gray-100 text-gray-600']
  return ['Waiting', 'bg-amber-100 text-amber-800']
}

export default function TimeClockSetup() {
  usePageTitle('Time Clock Setup')
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [locations, setLocations] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [mappings, setMappings] = useState([])
  const [kioskActivity, setKioskActivity] = useState({ codes: [], sessions: [] })
  const [issues, setIssues] = useState([])
  const [phoneEnabled, setPhoneEnabled] = useState(false)
  const [newDevice, setNewDevice] = useState({ name: 'Main entrance terminal', siteId: '' })
  const [newMapping, setNewMapping] = useState({ terminalUserId: '', employeeId: '' })
  const [sim, setSim] = useState({ terminalUserId: '', action: 'in', occurredAt: '' })
  const [revealedSecret, setRevealedSecret] = useState(null)
  const [pairingCode, setPairingCode] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const selectedPanelRef = useRef(null)

  const company = companies.find((item) => item.id === companyId)
  const selected = devices.find((item) => item.id === selectedId)
  const currentPairing = pairingCode ? kioskActivity.codes.find((item) => item.id === pairingCode.pairingId) : null
  const employees = useMemo(() => (company?.employees || []).filter((employee) => employee.active !== false), [company])

  useEffect(() => {
    api('/api/companies').then((result) => {
      const all = (Array.isArray(result) ? result : result.data || []).filter((item) => item.active !== false)
      setCompanies(all)
      setCompanyId((current) => current || all[0]?.id || '')
    }).catch((error) => setNotice({ type: 'error', text: error.message }))
  }, [])

  const loadCompany = async () => {
    if (!companyId) return
    const [deviceRows, locationRows, eventRows, config] = await Promise.all([
      api(`/api/time-clock/admin/devices?companyId=${encodeURIComponent(companyId)}`),
      getCompanyLocations(companyId),
      api(`/api/time-clock/admin/events?companyId=${encodeURIComponent(companyId)}`),
      api(`/api/time-clock/admin/config?companyId=${encodeURIComponent(companyId)}`),
    ])
    setDevices(deviceRows)
    setLocations(locationRows)
    setIssues(eventRows)
    setPhoneEnabled(!!config.personalPhoneEnabled)
    setSelectedId((current) => deviceRows.some((item) => item.id === current) ? current : deviceRows[0]?.id || '')
  }

  useEffect(() => {
    setRevealedSecret(null)
    setPairingCode(null)
    loadCompany().catch((error) => setNotice({ type: 'error', text: error.message }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  useEffect(() => {
    if (!selectedId) { setMappings([]); setKioskActivity({ codes: [], sessions: [] }); return }
    let cancelled = false
    const loadSelected = async () => {
      try {
        await api(`/api/time-clock/admin/devices/${encodeURIComponent(selectedId)}/sync-mappings`, { method: 'POST' })
        const [mappingRows, activity] = await Promise.all([
          api(`/api/time-clock/admin/mappings?deviceId=${encodeURIComponent(selectedId)}`),
          api(`/api/time-clock/admin/kiosk-activity?deviceId=${encodeURIComponent(selectedId)}`),
        ])
        if (!cancelled) { setMappings(mappingRows); setKioskActivity(activity) }
      } catch (error) {
        if (!cancelled) setNotice({ type: 'error', text: error.message })
      }
    }
    loadSelected()
    const timer = setInterval(() => {
      api(`/api/time-clock/admin/kiosk-activity?deviceId=${encodeURIComponent(selectedId)}`)
        .then((activity) => { if (!cancelled) setKioskActivity(activity) })
        .catch(() => {})
    }, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [selectedId])

  const selectDevice = (id, scroll = true) => {
    setSelectedId(id)
    setPairingCode(null)
    if (scroll) {
      setTimeout(() => selectedPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0)
    }
  }

  const savePilot = async (enabled) => {
    setBusy(true)
    try {
      await api('/api/time-clock/admin/config', { method: 'PUT', body: { companyId, personalPhoneEnabled: enabled } })
      setPhoneEnabled(enabled)
      setNotice({ type: 'success', text: enabled ? 'Personal phone clocking enabled.' : 'Personal phone clocking paused.' })
    } catch (error) { setNotice({ type: 'error', text: error.message }) }
    finally { setBusy(false) }
  }

  const createDevice = async () => {
    if (!newDevice.name.trim() || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await api('/api/time-clock/admin/devices', { method: 'POST', body: { companyId, ...newDevice } })
      setRevealedSecret({ deviceId: result.device.id, value: result.signingSecret, version: result.device.secret_version || 1, purpose: 'created' })
      selectDevice(result.device.id, false)
      setNotice({ type: 'success', text: `Terminal created with ${result.automaticMappings || 0} automatic employee mapping(s). Copy the signing secret now; it is shown only for setup.` })
      await loadCompany()
      setTimeout(() => selectedPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0)
    } catch (error) { setNotice({ type: 'error', text: error.message }) }
    finally { setBusy(false) }
  }

  const toggleDevice = async (device) => {
    await api(`/api/time-clock/admin/devices/${encodeURIComponent(device.id)}`, { method: 'PUT', body: { active: !device.active, siteId: device.site_id } })
    await loadCompany()
  }

  const rotateSecret = async (device) => {
    if (!confirm('Replace the lost connector secret? The old secret will stop working immediately.')) return
    setBusy(true)
    try {
      const result = await api(`/api/time-clock/admin/devices/${encodeURIComponent(device.id)}/rotate-secret`, { method: 'POST' })
      setRevealedSecret({ deviceId: device.id, value: result.signingSecret, version: result.secretVersion, purpose: 'replaced' })
      setNotice({ type: 'success', text: 'Replacement secret created. Copy it now; the previous secret no longer works.' })
    } catch (error) { setNotice({ type: 'error', text: error.message }) }
    finally { setBusy(false) }
  }

  const createPairingCode = async (device) => {
    if (busy) return
    setBusy(true)
    try {
      const result = await api(`/api/time-clock/admin/devices/${encodeURIComponent(device.id)}/pairing-code`, { method: 'POST' })
      setPairingCode({ ...result, deviceId: device.id })
      setKioskActivity(await api(`/api/time-clock/admin/kiosk-activity?deviceId=${encodeURIComponent(device.id)}`))
      setNotice({ type: 'success', text: 'Pairing code created. Enter it on the standalone /kiosk page within ten minutes.' })
    } catch (error) { setNotice({ type: 'error', text: error.message }) }
    finally { setBusy(false) }
  }

  const unpairKiosks = async (device) => {
    if (!confirm(`Unpair every browser kiosk connected to ${device.name}?`)) return
    setBusy(true)
    try {
      const result = await api(`/api/time-clock/admin/devices/${encodeURIComponent(device.id)}/unpair-kiosks`, { method: 'POST' })
      setPairingCode(null)
      setNotice({ type: 'success', text: `${result.revoked || 0} kiosk pairing(s) removed.` })
      await loadCompany()
      setKioskActivity(await api(`/api/time-clock/admin/kiosk-activity?deviceId=${encodeURIComponent(device.id)}`))
    } catch (error) { setNotice({ type: 'error', text: error.message }) }
    finally { setBusy(false) }
  }

  const addMapping = async () => {
    if (!selectedId || !newMapping.terminalUserId.trim() || !newMapping.employeeId) return
    setBusy(true)
    try {
      await api('/api/time-clock/admin/mappings', { method: 'POST', body: { deviceId: selectedId, ...newMapping } })
      setNewMapping({ terminalUserId: '', employeeId: '' })
      setMappings(await api(`/api/time-clock/admin/mappings?deviceId=${encodeURIComponent(selectedId)}`))
      await loadCompany()
    } catch (error) { setNotice({ type: 'error', text: error.message }) }
    finally { setBusy(false) }
  }

  const removeMapping = async (id) => {
    await api(`/api/time-clock/admin/mappings/${id}`, { method: 'DELETE' })
    setMappings((rows) => rows.filter((row) => row.id !== id))
  }

  const simulate = async () => {
    if (!selectedId || !sim.terminalUserId || busy) return
    setBusy(true)
    try {
      const result = await api('/api/time-clock/admin/simulator', {
        method: 'POST',
        body: { deviceId: selectedId, ...sim, occurredAt: sim.occurredAt ? new Date(sim.occurredAt).toISOString() : undefined },
      })
      const eventResult = result.results?.[0]
      const accepted = eventResult && eventResult.status !== 'rejected'
      setNotice({
        type: accepted ? 'success' : 'error',
        text: accepted
          ? `Simulator processed a clock-${eventResult.action}. Status: ${eventResult.status}.`
          : `Simulator rejected the event: ${eventResult?.reason || 'Check the terminal mapping.'}`,
      })
      await loadCompany()
    } catch (error) {
      setNotice({ type: 'error', text: `Simulator result: ${error.message}` })
      await loadCompany().catch(() => {})
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administrator</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Time Clock Setup</h1>
          <p className="mt-1 text-sm text-gray-500">Manage personal phone access and workplace fingerprint terminals without storing biometric data.</p>
        </div>
        <label className="text-sm font-medium text-gray-700">Company
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="mt-1 block min-w-64 rounded-lg border border-gray-300 bg-white px-3 py-2">
            {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      {notice && <div className={`rounded-lg px-4 py-3 text-sm ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{notice.text}</div>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Personal phone clocking</h2>
            <p className="mt-1 text-sm text-gray-500">Enable this for office, field, or permanent work-from-home employees. They use their phone’s fingerprint, Face ID, PIN, or pattern—no plug-in device is needed. GPS is requested, but unavailable location does not block a punch.</p>
          </div>
          <button onClick={() => savePilot(!phoneEnabled)} disabled={busy || !companyId} className={`rounded-lg px-4 py-2 text-sm font-semibold ${phoneEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
            {phoneEnabled ? 'Enabled — click to pause' : 'Enable phone clocking'}
          </button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Terminal devices</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input value={newDevice.name} onChange={(event) => setNewDevice({ ...newDevice, name: event.target.value })} placeholder="Terminal name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <select value={newDevice.siteId} onChange={(event) => setNewDevice({ ...newDevice, siteId: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">No site assigned</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </div>
          <button onClick={createDevice} disabled={busy || !companyId} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add terminal</button>
          <div className="mt-4 space-y-2">
            {devices.map((device) => {
              const [label, cls] = statusLabel(device)
              return (
                <button key={device.id} type="button" aria-pressed={selectedId === device.id} aria-controls="selected-terminal-panel" onClick={() => selectDevice(device.id)} className={`w-full rounded-lg border p-4 text-left transition ${selectedId === device.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'}`}>
                  <div className="flex items-start justify-between gap-2"><span className="font-semibold text-gray-900">{device.name}</span><span className={`rounded-full px-2 py-1 text-xs font-medium ${cls}`}>{label}</span></div>
                  <p className="mt-1 text-xs text-gray-500">Last sync: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Never'} · Kiosks: {device.paired_kiosk_count || 0} · Mappings: {device.mapping_count} · Issues: {device.issue_count}</p>
                  <p className={`mt-2 text-xs font-semibold ${selectedId === device.id ? 'text-brand-700' : 'text-gray-500'}`}>{selectedId === device.id ? '✓ Selected — manage below' : 'Click to manage this terminal'}</p>
                </button>
              )
            })}
            {!devices.length && <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No workplace terminal added yet. The simulator works as soon as you add one.</p>}
          </div>
        </section>

        <section id="selected-terminal-panel" ref={selectedPanelRef} className="scroll-mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{selected ? 'Selected terminal' : 'Terminal controls'}</p><h2 className="mt-1 font-semibold text-gray-900">{selected ? selected.name : 'Select a terminal first'}</h2><p className="mt-1 text-xs text-gray-500">{selected ? 'Pair its kiosk, manage its connector secret, and map employees below.' : 'Click a terminal card on the left to manage it.'}</p></div>
            {selected && <button onClick={() => toggleDevice(selected)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">{selected.active ? 'Revoke device' : 'Reactivate'}</button>}
          </div>

          {selected && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">Network-terminal connector secret</h3>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">For safety, a secret is shown only when the terminal is created or when you replace a lost secret. It disappears after refresh and cannot be displayed again. The standalone browser kiosk does not use this secret.</p>
                </div>
                <button onClick={() => rotateSecret(selected)} disabled={busy || !selected.active} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50">Replace lost secret</button>
              </div>
              {revealedSecret?.deviceId === selected.id ? (
                <div className="mt-3 rounded-lg bg-white p-3">
                  <p className="text-xs font-semibold text-amber-800">Copy this {revealedSecret.purpose === 'replaced' ? 'replacement ' : ''}secret now{revealedSecret.version ? ` · Version ${revealedSecret.version}` : ''}</p>
                  <code className="mt-2 block break-all rounded bg-gray-50 p-2 text-xs text-gray-700">{revealedSecret.value}</code>
                  <button onClick={() => navigator.clipboard.writeText(revealedSecret.value)} className="mt-2 text-xs font-semibold text-amber-800">Copy secret</button>
                </div>
              ) : (
                <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-amber-800">No secret is currently displayed. If you already copied it, keep using that copy. If it was lost, create a replacement.</p>
              )}
            </div>
          )}

          <div className="mt-5">
            <h3 className="font-semibold text-gray-900">Employee mappings</h3>
            <p className="mt-1 text-xs text-gray-500">Employees are mapped automatically using their App employee ID. New employees are added to active terminals automatically.</p>
          </div>

          {selected && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Automatic mapping is on.</strong> Enroll each fingerprint in the hardware using the employee’s App ID shown below. Use the manual form only when a vendor device forces a different number.</div>}

          {selected && selected.active ? (
            <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="text-sm font-semibold text-brand-900">Standalone browser kiosk</h3><p className="mt-1 text-xs text-brand-700">Open <strong>/kiosk</strong> on the head-office computer. Employees will not sign in.</p></div>
                <div className="flex gap-2"><button onClick={() => createPairingCode(selected)} disabled={busy} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Create pairing code</button>{Number(selected.paired_kiosk_count) > 0 && <button onClick={() => unpairKiosks(selected)} disabled={busy} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50">Unpair kiosks</button>}</div>
              </div>
              {pairingCode && pairingCode.deviceId === selected.id && (
                <div className="mt-4 rounded-lg bg-white p-4 text-center shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Enter this code at /kiosk</p>
                  <p className="mt-2 font-mono text-3xl font-bold tracking-[0.24em] text-gray-950">{pairingCode.code}</p>
                  <div className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-500">
                    <span>Expires {new Date(pairingCode.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. It works once.</span>
                    {currentPairing && (() => { const [label, cls] = pairingBadge(currentPairing.status); return <span className={`rounded-full px-2 py-1 font-semibold ${cls}`}>{label}</span> })()}
                  </div>
                </div>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-white/80 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-800">Pairing-code log</h4>
                  <div className="mt-2 space-y-2">
                    {kioskActivity.codes.map((entry) => { const [label, cls] = pairingBadge(entry.status); return <div key={entry.id} className="flex items-center justify-between gap-2 text-xs"><span className="text-gray-600">Created {new Date(entry.createdAt).toLocaleString()}{entry.usedAt ? ` · Used ${new Date(entry.usedAt).toLocaleString()}` : ''}</span><span className={`rounded-full px-2 py-1 font-semibold ${cls}`}>{label}</span></div> })}
                    {!kioskActivity.codes.length && <p className="text-xs text-gray-500">No pairing code created yet.</p>}
                  </div>
                </div>
                <div className="rounded-lg bg-white/80 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-800">Paired kiosks</h4>
                  <div className="mt-2 space-y-2">
                    {kioskActivity.sessions.map((session) => <div key={session.id} className="text-xs"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-gray-800">{session.label}</span><span className={`rounded-full px-2 py-1 font-semibold ${session.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>{session.active ? 'Active' : 'Unpaired'}</span></div><p className="mt-1 text-gray-500">Paired {new Date(session.pairedAt).toLocaleString()}{session.lastSeenAt ? ` · Last seen ${new Date(session.lastSeenAt).toLocaleString()}` : ''}</p></div>)}
                    {!kioskActivity.sessions.length && <p className="text-xs text-gray-500">No kiosk has used a code yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          ) : selected ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Reactivate this device before pairing a kiosk.</p> : null}
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Manual vendor-ID exception</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
            <input value={newMapping.terminalUserId} onChange={(event) => setNewMapping({ ...newMapping, terminalUserId: event.target.value })} placeholder="Terminal employee ID" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <select value={newMapping.employeeId} onChange={(event) => setNewMapping({ ...newMapping, employeeId: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choose employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>App ID {employee.id} — {employee.name} — {employee.email}</option>)}</select>
            <button onClick={addMapping} disabled={busy || !selectedId} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Map</button>
          </div>
          <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
            {mappings.map((mapping) => { const automatic = String(mapping.employee_id) === String(mapping.terminal_user_id); return <div key={mapping.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-semibold text-gray-900">{mapping.terminal_user_id} → {mapping.name}</p><p className="text-xs text-gray-500">{mapping.email} · {automatic ? 'Automatic App ID' : 'Manual vendor ID'}</p></div>{automatic ? <span className="text-xs font-semibold text-emerald-700">Managed automatically</span> : <button onClick={() => removeMapping(mapping.id)} className="text-xs font-semibold text-red-600">Remove</button>}</div> })}
            {!mappings.length && <p className="p-4 text-sm text-gray-500">No mappings for the selected terminal.</p>}
          </div>

          <div className="mt-6 border-t border-gray-100 pt-5">
            <h3 className="font-semibold text-gray-900">Terminal simulator</h3>
            <p className="mt-1 text-xs text-gray-500">Test mapping, offline timestamps, duplicate protection, and review flags before purchasing hardware.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input value={sim.terminalUserId} onChange={(event) => setSim({ ...sim, terminalUserId: event.target.value })} placeholder="Terminal employee ID" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <select value={sim.action} onChange={(event) => setSim({ ...sim, action: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="in">Clock in</option><option value="out">Clock out</option></select>
              <input type="datetime-local" value={sim.occurredAt} onChange={(event) => setSim({ ...sim, occurredAt: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button onClick={simulate} disabled={busy || !selectedId} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send simulated event</button>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">Events needing attention</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2">Received</th><th className="px-3 py-2">Terminal</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Reason</th></tr></thead><tbody className="divide-y divide-gray-100">{issues.map((event) => <tr key={event.id}><td className="px-3 py-3">{new Date(event.received_at).toLocaleString()}</td><td className="px-3 py-3">{event.device_name || event.device_id}</td><td className="px-3 py-3">{event.email || 'Unknown mapping'}</td><td className="px-3 py-3 font-semibold">{event.status}</td><td className="px-3 py-3">{event.rejection_reason || 'Late or out of order'}</td></tr>)}{!issues.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No rejected or review-needed events.</td></tr>}</tbody></table></div>
      </section>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        <h2 className="font-semibold">Hardware requirements</h2>
        <p className="mt-2 leading-relaxed">Choose a terminal that keeps fingerprints locally, supplies unique event IDs, employee IDs, timestamps, sequence numbers and clock actions, stores events while offline, keeps its clock synchronized, and can send signed HTTPS batches. A vendor adapter can then translate only that manufacturer’s format.</p>
      </section>
    </div>
  )
}
