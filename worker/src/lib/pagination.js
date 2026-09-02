// Pagination helpers shared by list endpoints.

export function parsePagination(url, maxLimit = 50) {
  const rawLimit = url.searchParams.get('limit')
  const rawOffset = url.searchParams.get('offset')
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const hasPagination = rawLimit !== null || rawOffset !== null || q
  let limit = rawLimit !== null ? Math.max(0, parseInt(rawLimit, 10) || 0) : 0
  let offset = rawOffset !== null ? Math.max(0, parseInt(rawOffset, 10) || 0) : 0
  if (limit > maxLimit) limit = maxLimit
  return { limit, offset, q, hasPagination }
}

export function paginate(data, { limit, offset, q, hasPagination }, searchFields = []) {
  let filtered = data
  if (q && searchFields.length) {
    filtered = data.filter((row) =>
      searchFields.some((f) => String(row[f] || '').toLowerCase().includes(q))
    )
  }
  const total = filtered.length
  if (!hasPagination) return filtered
  // hasPagination true: return paginated envelope even if limit==0 (means filtered set)
  if (limit > 0) filtered = filtered.slice(offset, offset + limit)
  return { data: filtered, total, limit, offset, q }
}
