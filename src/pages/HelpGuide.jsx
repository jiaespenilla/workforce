import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getActiveSettings } from '../lib/systemSettings'
import { usePageTitle } from '../lib/documentMeta'
import { buildGuideSections, buildGuideHtml, QUICK_ANSWERS } from '../lib/helpGuide'

// (76) Help & Guide — a full page (was a modal), written in plain language and
// exportable to PDF via the browser's print dialog (same export pattern as the
// task/attendance reports).
export default function HelpGuide() {
  usePageTitle('Help & Guide')
  const { user } = useAuth()
  const navigate = useNavigate()
  const settings = getActiveSettings()
  const sections = buildGuideSections({ role: user?.role, perms: user?.perms })

  // Same print-window approach as the Dashboard's PDF export: a clean,
  // standalone document the browser can save as PDF.
  const downloadPdf = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(buildGuideHtml({
      role: user?.role,
      perms: user?.perms,
      roleLabel: user?.roleLabel,
      systemName: settings.name,
      version: settings.version,
    }))
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Help &amp; Guide</h1>
          <p className="mt-1 text-sm text-gray-500">
            A plain-language walkthrough of everything <span className="font-semibold text-gray-700">{user?.roleLabel}</span> can use —
            and answers to the questions people ask most.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadPdf}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Download PDF
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((s) => (
          <section key={s.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">{s.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{s.intro}</p>
            <ul className="mt-3 space-y-2">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-gray-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-900">Quick answers</h2>
        <p className="mt-1 text-sm text-gray-500">The questions people ask most.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {QUICK_ANSWERS.map((f) => (
            <div key={f.q} className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
              <p className="text-sm font-semibold text-gray-900">{f.q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500">Prefer paper? The PDF above matches this page exactly for your role.</p>
        <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-brand-400 hover:text-brand-700">
          Go back
        </button>
      </div>
    </div>
  )
}
