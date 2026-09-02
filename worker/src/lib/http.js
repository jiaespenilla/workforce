// HTTP helpers — JSON, CORS, request parsing, error
export function cors(request) {
  const origin = request ? request.headers.get('Origin') : null
  // Same-origin by default; only echo Origin when present (Worker serves SPA same-origin).
  // For strict production, set ALLOWED_ORIGINS env var as comma-separated list.
  if (origin) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Vary': 'Origin',
    }
  }
  return {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }
}

export const json = (data, status = 200, request) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(request) },
  })

export function HttpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}
