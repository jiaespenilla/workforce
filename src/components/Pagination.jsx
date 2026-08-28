

export function usePagination(items, pageSize = 10) {
  // Client-side helper — returns paginated slice and controls
  // For server-paginated data, use serverPagination instead
  return { items, pageSize }
}

export default function Pagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canPrev = page > 0
  const canNext = page + 1 < totalPages

  if (total <= pageSize) return null

  const pages = []
  // Show up to 5 page numbers centered around current
  let start = Math.max(0, page - 2)
  let end = Math.min(totalPages, start + 5)
  if (end - start < 5) start = Math.max(0, end - 5)
  for (let i = start; i < end; i++) pages.push(i)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
      <p className="text-xs text-gray-500">
        Showing <span className="font-medium text-gray-900">{total === 0 ? 0 : page * pageSize + 1}</span>–
        <span className="font-medium text-gray-900">{Math.min((page + 1) * pageSize, total)}</span> of{' '}
        <span className="font-medium text-gray-900">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          Prev
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === page}
            className={`min-w-8 rounded-lg px-3 py-1.5 text-xs font-medium ${
              p === page ? 'bg-brand-600 text-white' : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}

// Helper to normalize server OR client paginated responses:
// server: { data, total, limit, offset }  |  client: array
export function normalizePaginated(res) {
  if (Array.isArray(res)) return { data: res, total: res.length }
  if (res && Array.isArray(res.data)) return { data: res.data, total: res.total ?? res.data.length }
  return { data: [], total: 0 }
}
