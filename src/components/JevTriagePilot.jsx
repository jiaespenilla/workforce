import { useEffect, useState } from 'react'
import { api, apiEnabled } from '../lib/api'

export default function JevTriagePilot() {
  const [pilot, setPilot] = useState(null)
  const [sampleId, setSampleId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!apiEnabled()) return
    let active = true
    api('/api/admin/jev-triage')
      .then((data) => {
        if (!active) return
        setPilot(data)
        setSampleId(data.samples?.[0]?.id || '')
      })
      .catch((err) => { if (active) setError(err.message || 'Could not load the Jev test.') })
    return () => { active = false }
  }, [])

  const sample = pilot?.samples?.find(({ id }) => id === sampleId)

  const runSample = async () => {
    if (!sampleId || busy) return
    setBusy(true)
    setResult(null)
    setError('')
    try {
      setResult(await api('/api/admin/jev-triage', { method: 'POST', body: { sampleId } }))
    } catch (err) {
      setError(err.message || 'Jev could not evaluate this sample.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-base font-bold text-gray-900">Jev attendance triage test</h2>
        <p className="mt-0.5 text-sm text-gray-500">Check how Jev categorizes sample clock issues for manual review.</p>
      </div>

      <p className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-relaxed text-brand-900">
        This test sends only preset, fictional reports to TypeSafe. It does not read or change employee punches or payroll.
      </p>

      {!apiEnabled() && <p className="text-sm text-gray-600">The Jev test requires the cloud API.</p>}
      {apiEnabled() && !pilot && !error && <p className="text-sm text-gray-500">Loading samples…</p>}
      {pilot && !pilot.configured && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Jev is not connected yet. Add a TypeSafe API key to the Cloudflare Worker to run these samples.
        </p>
      )}

      {pilot && (
        <>
          <label className="block text-sm font-medium text-gray-700" htmlFor="jev-sample">Sample attendance report</label>
          <select
            id="jev-sample"
            value={sampleId}
            onChange={(event) => { setSampleId(event.target.value); setResult(null); setError('') }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          >
            {pilot.samples.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
          {sample && <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">“{sample.report}”</p>}
          <button
            type="button"
            onClick={runSample}
            disabled={!pilot.configured || !sampleId || busy}
            className="min-h-[44px] rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Checking with Jev…' : 'Run Jev test'}
          </button>
        </>
      )}

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {result && sample && (
        <div role="status" className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Jev suggests: {result.category}</p>
          <p className="text-sm text-gray-600">Expected for this sample: {sample.expected}</p>
          <p className="text-xs text-gray-500">{result.matchedExpected ? 'Matches the sample category' : 'Different from the sample category'} · Confidence: {Math.round(result.confidence * 100)}% · {result.model}</p>
          <p className="text-xs font-medium text-amber-800">A person must review every attendance exception before any record is changed.</p>
        </div>
      )}
    </div>
  )
}
