// Crypto helpers — PBKDF2 hashing, HMAC tokens, timing-safe compare
import { PBKDF2_ITERATIONS } from './constants.js'

const enc = new TextEncoder()

export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hmac(text, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function pbkdf2(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations },
    key,
    256
  )
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  return `pbkdf2:${iterations}:${await pbkdf2(password, salt, iterations)}`
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

export async function verifyPassword(password, user) {
  if (user.password_hash.startsWith('pbkdf2:')) {
    const [, iterations, hash] = user.password_hash.split(':')
    const candidate = await pbkdf2(password, user.password_salt, Number(iterations))
    return { ok: timingSafeEqual(candidate, hash), legacy: false }
  }
  const candidate = await sha256(`${user.password_salt}:${password}`)
  return { ok: timingSafeEqual(candidate, user.password_hash), legacy: true }
}

export async function upgradeUserPassword(env, userId, password) {
  const salt = crypto.randomUUID()
  await env.DB.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?')
    .bind(salt, await hashPassword(password, salt), userId).run()
}

export function b64url(text) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createToken(user, secret) {
  const payload = b64url(JSON.stringify({ sub: user.email, role: user.role, name: user.name, exp: Date.now() + 1000 * 60 * 60 * 12 }))
  const sig = await hmac(payload, secret)
  return `${payload}.${sig}`
}

export async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if (!timingSafeEqual(await hmac(payload, secret), sig)) return null
  try {
    // createToken encodes with the URL-safe base64 alphabet (+/→-_);
    // atob only understands the standard alphabet, so convert back first.
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (!data.exp || data.exp < Date.now()) return null
    return data
  } catch {
    return null
  }
}

export async function verifySecret(value, salt, stored) {
  if (stored && stored.startsWith('pbkdf2:')) {
    const [, iterations, hash] = stored.split(':')
    return timingSafeEqual(await pbkdf2(value, salt, Number(iterations)), hash)
  }
  return timingSafeEqual(await sha256(`${salt}:${value}`), stored)
}
