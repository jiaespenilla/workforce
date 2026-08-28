// HTTP helpers — JSON, CORS, request parsing, error
export function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
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
