import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { PageLoader } from '../components/Skeleton'

export default function StorageSetup() {
  usePageTitle('Storage Setup')
  const [companies, setCompanies] = useState([])
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [storageProvider, setStorageProvider] = useState('gdrive')
  const [storageFolderId, setStorageFolderId] = useState('')
  const [storageSaving, setStorageSaving] = useState(false)
  const [storageMsg, setStorageMsg] = useState(null)

  // All companies — storage is configured per company, not globally.
  useEffect(() => {
    api('/api/companies')
      .then((res) => {
        const list = Array.isArray(res) ? res : (res.data || [])
        const active = list.filter((c) => c.active !== false)
        setCompanies(active)
        if (active.length && !active.find((c) => c.id === companyId)) setCompanyId(active[0].id)
      })
      .catch(() => setCompanies([]))
      .finally(() => setLoadingCompanies(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load this company's storage config whenever the selection changes.
  useEffect(() => {
    if (!companyId) return
    setLoadingConfig(true)
    setStorageMsg(null)
    api(`/api/company-settings/${encodeURIComponent(companyId)}`)
      .then((data) => {
        const cfg = data?.attachment_storage
        setStorageProvider(cfg?.provider || 'gdrive')
        setStorageFolderId(cfg?.folderId || '')
      })
      .catch(() => {})
      .finally(() => setLoadingConfig(false))
  }, [companyId])

  const company = companies.find((c) => c.id === companyId)

  const saveStorage = async () => {
    if (!companyId) return
    setStorageSaving(true)
    setStorageMsg(null)

    try {
      await api(`/api/company-settings/${encodeURIComponent(companyId)}`, {
        method: 'PUT',
        body: { attachment_storage: { provider: storageProvider, folderId: storageFolderId } }
      })
      setStorageMsg({
        type: 'success',
        msg: `Storage saved for ${company?.name || 'company'}: ${storageProvider}${storageProvider === 'gdrive' && storageFolderId ? ` → ${storageFolderId.slice(0, 8)}…` : ''}`
      })
    } catch (err) {
      setStorageMsg({ type: 'error', msg: err.message || 'Failed to save' })
    } finally {
      setStorageSaving(false)
      setTimeout(() => setStorageMsg(null), 4000)
    }
  }

  // Step-by-step guide — adapts to the selected provider.
  const guideSteps = {
    d1: [
      <>Select <strong>Built-in (D1 Data URL)</strong> as the provider above.</>,
      <>Click <strong>Save Storage</strong> — task attachments will be stored directly in Cloudflare D1.</>,
      <>No extra configuration is needed. Note: each file is capped at <strong>5 MB</strong> (stored as a Data URL).</>,
    ],
    r2: [
      <>In the Cloudflare Dashboard go to <strong>R2 → Create bucket</strong> and name it <span className="font-mono">workforce-documents</span>.</>,
      <>Bind the bucket to the Worker as <span className="font-mono">R2</span> (see <span className="font-mono">worker/wrangler.jsonc</span>) and redeploy the worker.</>,
      <>Select <strong>Cloudflare R2 (workforce-documents)</strong> above and click <strong>Save Storage</strong>.</>,
      <>Verify: attach a file to any task, then open the bucket in the Cloudflare Dashboard — the object should appear.</>,
    ],
    gdrive: [
      <>In Google Cloud Console, create a project, enable the <strong>Google Drive API</strong>, and create a <strong>Service Account</strong>.</>,
      <>Create a JSON key for the service account and hand it to your admin to run <span className="font-mono">npx wrangler secret put GDRIVE_SERVICE_KEY</span> (inside <span className="font-mono">worker/</span>).</>,
      <>In Google Drive, create (or pick) a folder for attachments and <strong>share it with the service account e-mail as Editor</strong>.</>,
      <>Copy the Folder ID from the address bar: <span className="font-mono break-all">https://drive.google.com/drive/folders/&lt;FOLDER_ID&gt;</span></>,
      <>Select <strong>Google Drive</strong>, paste the Folder ID above, and click <strong>Save Storage</strong>.</>,
      <>Verify: attach a file to any task — the file should appear in the shared Drive folder.</>,
    ],
  }
  const steps = [...(guideSteps[storageProvider] || []), <>After saving, reload this page — the selected provider (and Folder ID) must persist.</>]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Settings</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Storage Setup</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Choose where each company's task documents are stored. For GDrive, paste the shared Folder ID (from Drive URL).</p>
        </div>
        <label className="block w-full text-sm sm:w-64 sm:shrink-0">
          <span className="font-medium text-gray-700">Configuring for company:</span>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            disabled={loadingCompanies}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            {companies.length === 0 && <option value="">{loadingCompanies ? 'Loading companies…' : 'No active companies'}</option>}
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      {loadingCompanies ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><PageLoader page="Storage Setup" compact detail="Loading companies…" /></div>
      ) : !companyId ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-900">No company to configure</p>
          <p className="mt-1 text-xs text-gray-500">Add an active company first, then set up its storage here.</p>
        </div>
      ) : (
      <>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Attachment Storage Setup</h3>
            <p className="mt-1 text-xs text-gray-500">
              For <span className="font-semibold text-gray-800">{company?.name}</span> · Built-in uses D1 with Data URLs (5 MB limit per file).
            </p>
          </div>
          {loadingConfig && <span className="text-xs font-medium text-gray-400">Loading saved config…</span>}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block text-xs font-medium text-gray-700">Provider
            <select
              value={storageProvider}
              onChange={(e) => setStorageProvider(e.target.value)}
              disabled={loadingConfig}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="d1">Built-in (D1 Data URL)</option>
              <option value="r2">Cloudflare R2 (workforce-documents)</option>
              <option value="gdrive">Google Drive</option>
            </select>
          </label>

          <label className="block flex-1 text-xs font-medium text-gray-700">GDrive Folder ID
            <input
              value={storageFolderId}
              onChange={(e) => setStorageFolderId(e.target.value)}
              placeholder="1AbC... from https://drive.google.com/drive/folders/..."
              disabled={storageProvider !== 'gdrive' || loadingConfig}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
            />
          </label>

          <button
            disabled={storageSaving || loadingConfig}
            onClick={saveStorage}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {storageSaving ? 'Saving…' : 'Save Storage'}
          </button>
        </div>

        {storageMsg && (
          <p className={`mt-2 rounded-lg px-3 py-2 text-xs ring-1 ${storageMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>{storageMsg.msg}</p>
        )}

        <p className="mt-2 text-[11px] text-gray-400">Built-in stores as Data URL in D1 (5 MB limit). R2 requires Dashboard &gt; R2 enable. GDrive requires service account JSON stored as secret <span className="font-mono">GDRIVE_SERVICE_KEY</span> (ask admin).</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">Step-by-step Setup Guide</h3>
        <p className="mt-1 text-xs text-gray-500">
          Follow the steps for the currently selected provider:
          {' '}<strong>{storageProvider === 'd1' ? 'Built-in (D1)' : storageProvider === 'r2' ? 'Cloudflare R2' : 'Google Drive'}</strong>.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-gray-600">
          {steps.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </div>
      </>
      )}
    </div>
  )
}
