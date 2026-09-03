// Shared loading-state skeletons — used while a page's data is still fetching
// so users see structure instead of zeros/empty states.

export function SkeletonRow({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />
}

// Full-width placeholder rows for tables / lists.
export function SkeletonRows({ rows = 5, className = '', label = 'Loading your data…' }) {
  return (
    <div className={className} role="status" aria-label="Loading">
      <div className="flex items-center justify-center gap-2.5 px-6 pb-2 pt-5">
        <Spinner className="h-5 w-5 text-brand-600" />
        <p className="text-sm font-semibold text-gray-700">{label}</p>
      </div>
      <p className="pb-3 text-center text-xs text-gray-400">Fetching the latest updates — this usually takes a few seconds.</p>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-gray-200">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="relative h-3.5 w-1/3 overflow-hidden rounded-md bg-gray-200">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              </div>
              <div className="relative h-3 w-1/4 overflow-hidden rounded-md bg-gray-100">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              </div>
            </div>
            <SkeletonRow className="hidden h-6 w-20 rounded-full sm:block" />
            <SkeletonRow className="hidden h-3.5 w-16 sm:block" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

// Placeholder grid for dashboard stat cards.
export function SkeletonCards({ cards = 4, className = '', label = 'Loading overview…' }) {
  return (
    <div className={className} role="status" aria-label="Loading">
      <div className="mb-3 flex items-center justify-center gap-2.5">
        <Spinner className="h-5 w-5 text-brand-600" />
        <p className="text-sm font-semibold text-gray-700">{label}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <SkeletonRow className="h-3 w-24" />
            <SkeletonRow className="mt-3 h-8 w-16" />
            <SkeletonRow className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

// Subtle inline spinner used in buttons / headers.
export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
