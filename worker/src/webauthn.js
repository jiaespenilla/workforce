// Personal-device WebAuthn/passkey support. The phone verifies the employee
// with fingerprint, Face ID, or its local PIN; the server stores public keys only.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'

export class WebAuthnError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function b64urlFromBytes(bytes) {
  let bin = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(input) {
  let b64 = String(input).replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000

async function storeChallenge(env, challenge, kind, email, rpID, origin) {
  await env.DB.prepare(
    'INSERT INTO webauthn_challenges (challenge, kind, email, rp_id, origin, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(challenge, kind, email || null, rpID, origin, Date.now() + CHALLENGE_TTL_MS).run()
}

async function takeChallenge(env, challenge, kind) {
  const row = await env.DB.prepare('SELECT * FROM webauthn_challenges WHERE challenge = ? AND kind = ?')
    .bind(challenge, kind).first()
  if (!row) return null
  await env.DB.prepare('DELETE FROM webauthn_challenges WHERE challenge = ?').bind(challenge).run()
  if (row.expires_at < Date.now()) return null
  return row
}

function decodeClientDataJSON(b64url) {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(b64url)))
  } catch {
    throw new WebAuthnError(400, 'The passkey response is invalid.')
  }
}

// The expected origin comes from the HTTP request, never from browser JSON.
export function expectedWebAuthnOrigin(request, env = {}) {
  const requestUrl = new URL(request.url)
  const header = request.headers.get('Origin')
  if (!header) return requestUrl.origin
  let origin
  try { origin = new URL(header).origin } catch { throw new WebAuthnError(403, 'Untrusted app origin.') }
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  const lower = origin.toLowerCase()
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(lower)
  if (new URL(origin).host !== requestUrl.host && !configured.includes(lower) && !local) {
    throw new WebAuthnError(403, 'Untrusted app origin.')
  }
  return origin
}

export async function buildRegistrationOptions(env, { username, request, kind = 'mobile-register' }) {
  const origin = expectedWebAuthnOrigin(request, env)
  const rpID = new URL(origin).hostname
  const existing = await env.DB.prepare(
    'SELECT credential_id, transports FROM webauthn_credentials WHERE lower(email) = lower(?) AND revoked_at IS NULL'
  ).bind(username).all().then((result) => result.results || [])
  const options = await generateRegistrationOptions({
    rpName: 'CadensIQ',
    rpID,
    userName: username,
    userDisplayName: username,
    userID: new TextEncoder().encode(`uid:${username}`),
    timeout: 120000,
    attestationType: 'none',
    excludeCredentials: existing.map((credential) => ({
      id: credential.credential_id,
      type: 'public-key',
      transports: credential.transports ? JSON.parse(credential.transports) : [],
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
  })
  await storeChallenge(env, options.challenge, kind, username.toLowerCase(), rpID, origin)
  return { ...options, rpID }
}

export async function registerCredential(env, { response, kind = 'mobile-register' }) {
  const client = decodeClientDataJSON(response?.response?.clientDataJSON)
  const stored = await takeChallenge(env, client.challenge, kind)
  if (!stored) throw new WebAuthnError(400, 'Registration session expired or invalid. Try again.')
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: client.challenge,
    expectedOrigin: stored.origin,
    expectedRPID: stored.rp_id,
    requireUserVerification: true,
  })
  if (!verification.verified || !verification.registrationInfo) {
    throw new WebAuthnError(400, 'Passkey registration could not be verified.')
  }
  const { credential } = verification.registrationInfo
  return {
    email: stored.email,
    credentialId: credential.id,
    publicKey: b64urlFromBytes(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports || ['internal'],
  }
}

export async function buildAuthenticationOptions(env, { request, email, kind = 'mobile-punch' }) {
  const origin = expectedWebAuthnOrigin(request, env)
  const rpID = new URL(origin).hostname
  const credentials = await env.DB.prepare(
    'SELECT credential_id, transports FROM webauthn_credentials WHERE lower(email) = lower(?) AND revoked_at IS NULL ORDER BY id'
  ).bind(email).all().then((result) => result.results || [])
  if (!credentials.length) throw new WebAuthnError(404, 'Register a passkey on this phone before clocking in or out.')
  const options = await generateAuthenticationOptions({
    rpID,
    timeout: 120000,
    userVerification: 'required',
    allowCredentials: credentials.map((credential) => ({
      id: credential.credential_id,
      type: 'public-key',
      transports: credential.transports ? JSON.parse(credential.transports) : [],
    })),
  })
  await storeChallenge(env, options.challenge, kind, email.toLowerCase(), rpID, origin)
  return { ...options, rpID }
}

export async function verifyAuthentication(env, { response, kind = 'mobile-punch' }) {
  const client = decodeClientDataJSON(response?.response?.clientDataJSON)
  const stored = await takeChallenge(env, client.challenge, kind)
  if (!stored) throw new WebAuthnError(400, 'Passkey check expired or was already used. Try again.')
  const rawId = response.rawId || response.id
  const cred = await env.DB.prepare(
    'SELECT * FROM webauthn_credentials WHERE credential_id = ? AND revoked_at IS NULL'
  ).bind(rawId).first()
  if (!cred) throw new WebAuthnError(404, 'This passkey is not active.')
  if (String(cred.email || '').toLowerCase() !== String(stored.email || '').toLowerCase()) {
    throw new WebAuthnError(401, 'This passkey belongs to a different employee.')
  }
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: client.challenge,
    expectedOrigin: stored.origin,
    expectedRPID: stored.rp_id,
    requireUserVerification: true,
    credential: {
      id: cred.credential_id,
      publicKey: base64UrlToBytes(cred.public_key),
      counter: cred.counter,
      transports: cred.transports ? JSON.parse(cred.transports) : [],
    },
  })
  if (!verification.verified) throw new WebAuthnError(401, 'Passkey verification failed.')
  const usedAt = new Date().toISOString()
  await env.DB.prepare('UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?')
    .bind(verification.authenticationInfo.newCounter, usedAt, rawId).run()
  return { email: cred.email, credentialId: cred.credential_id, usedAt }
}
