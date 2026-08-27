// TEMPLATE for new admin pages — copy this to keep width/header aligned with Companies/System Config/Profile/Shift Schedules
// All admin pages sit inside AdminLayout's <div class="mx-auto max-w-6xl ...">, so use `space-y-6` (no extra max-w) and the same header pattern.

import { usePageTitle } from '../lib/documentMeta'

export default function NewPageTemplate() {
  usePageTitle('New Page')
  return (
    <div className="space-y-6">
      {/* Header — aligned */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Administration / Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Page Title</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Short description — works on phone, tablet and desktop.</p>
        </div>
        {/* optional action: <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Action</button> */}
      </div>

      {/* Content cards — use rounded-xl border bg-white p-4 sm:p-6 shadow-sm */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">Your content here — this card width matches Companies & System Config because outer is `space-y-6` (no max-w-3xl).</p>
      </div>
    </div>
  )
}
