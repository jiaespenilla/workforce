// Shared loading-state skeletons — used while a page's data is still fetching
// so users see structure instead of zeros/empty states.

export function SkeletonRow({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />
}

// Full-width placeholder rows for tables / lists.
export function SkeletonRows({ rows = 5, className = '' }) {
  return (
    <div className={`divide-y divide-gray-100 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <SkeletonRow className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonRow className="h-3.5 w-1/3" />
            <SkeletonRow className="h-3 w-1/4" />
          </div>
          <SkeletonRow className="hidden h-6 w-20 rounded-full sm:block" />
          <SkeletonRow className="hidden h-3.5 w-16 sm:block" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}

// Placeholder grid for dashboard stat cards.
export function SkeletonCards({ cards = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SkeletonRow className="h-3 w-24" />
          <SkeletonRow className="mt-3 h-8 w-16" />
          <SkeletonRow className="mt-3 h-3 w-28" />
        </div>
      ))}
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
