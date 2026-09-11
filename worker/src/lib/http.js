// HTTP helpers — JSON, CORS, request parsing, error responses

// Origins allowed to receive CORS headers, from the ALLOWED_ORIGINS env var
// (comma-separated, e.g. "https://app.example.com,https://staging.example.com").
// Same-origin requests and localhost dev servers are always allowed.
let allowedOrigins = []
export function setAllowedOrigins(list) {
  allowedOrigins = (Array.isArray(list) ? list : String(list || '').split(','))
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean)
}

function originAllowed(origin, request) {
  const o = String(origin || '').toLowerCase()
  if (!o) return false
  if (allowedOrigins.includes(o)) return true
  // Local development (vite dev server etc.)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true
  // Same-origin: the SPA is served by this Worker, so the Origin host must
  // match the request host.
  try {
    return new URL(o).host === new URL(request.url).host
  } catch {
    return false
  }
}

export function cors(request) {
  const origin = request ? request.headers.get('Origin') : null
  const base = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }
  // SECURITY: only echo the Origin header for origins we actually allow —
  // never reflect arbitrary origins (unless ALLOWED_ORIGINS includes them).
  if (origin && originAllowed(origin, request)) {
    return { ...base, 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
  }
  return base
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

// Trim and cap the length of free-text input. Public, unauthenticated
// endpoints must never persist verbatim client strings.
export function clampText(value, max) {
  const s = String(value ?? '').trim()
  if (!s) return null
  return s.slice(0, max)
}

// Map an error to a JSON response without leaking internals: errors carrying
// a .status (HttpError / WebAuthnError) keep their client-safe message;
// anything else is logged server-side and returned as a generic 500.
export function toErrorResponse(err, request) {
  if (err && err.status) {
    return json({ error: err.message || 'Request failed' }, err.status, request)
  }
  console.error('Unhandled API error:', (err && (err.stack || err.message)) || err)
  return json({ error: 'Internal server error' }, 500, request)
}
