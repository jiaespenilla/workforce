// Shared loading-state skeletons — used while a page's data is still fetching
// so users see structure instead of zeros/empty states.
//
// Every loader is branded per page: "CadensIQ – Loading {Page}".
// Pass `page="Dashboard"` (etc.) so users always know what is loading.

export function SkeletonRow({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />
}

function BrandMark({ size = 'h-9 w-9 text-sm' }) {
  return (
    <div className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-emerald-500 font-bold text-white shadow`} aria-hidden="true">
      C
    </div>
  )
}

// Full-page (or inline) branded loader: "CadensIQ – Loading {Page}".
// Use for route transitions and panel-level loading.
export function PageLoader({ page = 'Page', detail, compact = false, className = '' }) {
  return (
    <div className={`${compact ? 'py-8' : 'min-h-[50vh] py-12'} flex flex-col items-center justify-center px-4 text-center ${className}`} role="status" aria-label={`Loading ${page}`}>
      <BrandMark />
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">CadensIQ</p>
      <p className="mt-1 text-lg font-bold text-gray-900">
        Loading {page}
        <span className="ml-1 inline-flex gap-1" aria-hidden="true">
          <span className="animate-bounce text-brand-600" style={{ animationDelay: '0ms' }}>.</span>
          <span className="animate-bounce text-brand-600" style={{ animationDelay: '150ms' }}>.</span>
          <span className="animate-bounce text-brand-600" style={{ animationDelay: '300ms' }}>.</span>
        </span>
      </p>
      <p className="mt-1 max-w-xs text-xs text-gray-500">{detail || 'Fetching the latest updates — this usually takes a few seconds.'}</p>
      <div className="mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full w-1/2 animate-[shimmer_1.2s_infinite] rounded-full bg-gradient-to-r from-brand-500 to-emerald-400" />
      </div>
      <span className="sr-only">Loading {page}…</span>
    </div>
  )
}

// Full-width placeholder rows for tables / lists.
export function SkeletonRows({ rows = 5, className = '', label, page }) {
  const title = page ? `CadensIQ – Loading ${page}` : (label || 'Loading your data…')
  return (
    <div className={className} role="status" aria-label={title}>
      <div className="flex items-center justify-center gap-2.5 px-6 pb-1 pt-5">
        <BrandMark size="h-7 w-7 text-xs" />
        <p className="text-sm font-semibold text-gray-700">{title}<span className="animate-pulse">…</span></p>
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
export function SkeletonCards({ cards = 4, className = '', label, page }) {
  const title = page ? `CadensIQ – Loading ${page}` : (label || 'Loading overview…')
  return (
    <div className={className} role="status" aria-label={title}>
      <div className="mb-3 flex items-center justify-center gap-2.5">
        <BrandMark size="h-7 w-7 text-xs" />
        <p className="text-sm font-semibold text-gray-700">{title}<span className="animate-pulse">…</span></p>
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
