// WebAuthn (browser biometric fingerprint) support for the kiosk.
// Wraps @simplewebauthn/server (v13). Fingerprint/passkey scanning uses the
// platform authenticator built into the device (Touch ID, Face ID, Android
// fingerprint) — no external hardware required.

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

/* ---------------- base64url helpers (global btoa/atob, available in Workers) ---------------- */

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

/* ---------------- challenge storage (D1) ---------------- */

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

/* ---------------- helpers ---------------- */

function decodeClientDataJSON(b64url) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(b64url)))
}

/* ---------------- registration ---------------- */

export async function buildRegistrationOptions(env, { username, origin }) {
  const url = new URL(origin || `https://${'localhost'}`)
  const rpID = url.hostname
  const options = await generateRegistrationOptions({
    rpName: 'CadensIQ',
    rpID,
    userName: username,
    userDisplayName: username,
    // Stable but distinct user identifier derived from the email.
    userID: new TextEncoder().encode(`uid:${username}`),
    timeout: 120000,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    },
  })
  await storeChallenge(env, options.challenge, 'register', username, rpID, origin)
  return { ...options, rpID }
}

export async function registerCredential(env, { response }) {
  const client = decodeClientDataJSON(response.response.clientDataJSON)
  const challenge = client.challenge
  const stored = await takeChallenge(env, challenge, 'register')
  if (!stored) throw new WebAuthnError(400, 'Registration session expired or invalid. Try again.')

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: stored.origin,
    expectedRPID: stored.rp_id,
    requireUserVerification: true,
  })
  if (!verification.verified || !verification.registrationInfo) {
    throw new WebAuthnError(400, 'Biometric registration could not be verified.')
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

/* ---------------- authentication (kiosk fingerprint scan) ---------------- */

export async function buildAuthenticationOptions(env, { origin, email }) {
  const url = new URL(origin || `https://${'localhost'}`)
  const rpID = url.hostname
  let allowCredentials = undefined
  if (email) {
    // User-directed scan (shared kiosk, 55): only offer THAT employee's
    // passkey so the OS never shows an account picker a stranger could
    // select a wrong account from.
    const cred = await env.DB.prepare('SELECT * FROM webauthn_credentials WHERE lower(email) = lower(?) LIMIT 1').bind(email).first()
    if (!cred) throw new WebAuthnError(404, 'This employee has no fingerprint enrolled. Register it in Kiosk Setup first.')
    allowCredentials = [{
      id: cred.credential_id,
      type: 'public-key',
      transports: cred.transports ? JSON.parse(cred.transports) : [],
    }]
  }
  const options = await generateAuthenticationOptions({
    rpID,
    timeout: 120000,
    userVerification: 'required',
    ...(allowCredentials ? { allowCredentials } : {}),
  })
  await storeChallenge(env, options.challenge, 'authentication', email ? email.toLowerCase() : null, rpID, origin)
  return { ...options, rpID }
}

export async function verifyAuthentication(env, { response }) {
  const client = decodeClientDataJSON(response.response.clientDataJSON)
  const challenge = client.challenge
  const stored = await takeChallenge(env, challenge, 'authentication')
  if (!stored) throw new WebAuthnError(400, 'Authentication session expired or invalid. Try again.')

  const rawId = response.rawId || response.id
  const cred = await env.DB.prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?').bind(rawId).first()
  if (!cred) throw new WebAuthnError(404, 'This device is not registered for fingerprint.')
  // Shared-kiosk binding (55): when the scan was started for a specific
  // employee (tile tap → allowCredentials), the asserted credential MUST
  // belong to that employee. A different account's credential — e.g. picked
  // from the OS account sheet — is rejected even though its signature is
  // valid, because any enrolled finger unlocks the shared device.
  if (stored.email && String(cred.email || '').toLowerCase() !== String(stored.email).toLowerCase()) {
    throw new WebAuthnError(401, 'This fingerprint does not match the selected employee. Tap your own name and scan again.')
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
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
  if (!verification.verified) throw new WebAuthnError(401, 'Fingerprint verification failed.')
  await env.DB.prepare('UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?')
    .bind(verification.authenticationInfo.newCounter, rawId).run()
  return { email: cred.email }
}

