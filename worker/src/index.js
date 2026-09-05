// Unified Workforce API — Cloudflare Worker (D1 + R2)
// Thin router: request handlers live in src/routes/* (grouped by domain),
// shared helpers in src/lib/*. Route evaluation order mirrors the original
// single-file router (public routes run before the auth gate).

import { json, cors } from './lib/http.js'
import { requireAuth } from './lib/auth.js'
import { ensureSeed, migrateCompanySettings, migrateTaskColumns, migrateTaskAssigneeId, migrateAttendanceOvertime, migrateEmployeePay, migratePayrollRuns, migrateUserProfile } from './lib/seed.js'
import * as publicRoutes from './routes/public.js'
import * as authRoutes from './routes/auth.js'
import * as settingsRoutes from './routes/settings.js'
import * as companyRoutes from './routes/companies.js'
import * as taskRoutes from './routes/tasks.js'
import * as attendanceRoutes from './routes/attendance.js'
import * as payrollRoutes from './routes/payroll.js'
import * as credentialRoutes from './routes/credentials.js'
import * as orgUnitRoutes from './routes/orgUnits.js'
import * as kioskAdminRoutes from './routes/kioskAdmin.js'
import * as notificationRoutes from './routes/notifications.js'
import * as adminRoutes from './routes/admin.js'

// Order matters: these run without a token (login, registration, kiosk…).
const PUBLIC_HANDLERS = [publicRoutes.handle]

// Authenticated routes, evaluated in order; the first match wins.
const API_HANDLERS = [
  authRoutes.handle,
  settingsRoutes.handle,
  companyRoutes.handle,
  taskRoutes.handle,
  attendanceRoutes.handle,
  payrollRoutes.handle,
  credentialRoutes.handle,
  orgUnitRoutes.handle,
  kioskAdminRoutes.handle,
  notificationRoutes.handle,
  adminRoutes.handle,
]

async function firstMatch(handlers, ctx) {
  for (const handle of handlers) {
    const res = await handle(ctx)
    if (res) return res
  }
  return null
}

let migrationsPromise = null
async function ensureMigrations(env) {
  if (!migrationsPromise) {
    migrationsPromise = (async () => {
      await ensureSeed(env)
      await Promise.all([
        migrateCompanySettings(env),
        migrateTaskColumns(env),
        migrateTaskAssigneeId(env),
        migrateAttendanceOvertime(env),
        migrateEmployeePay(env),
        migratePayrollRuns(env),
        migrateUserProfile(env),
      ])
    })().catch((e) => { migrationsPromise = null; throw e })
  }
  await migrationsPromise
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)

      // API requests → router (seeds the database on first use)
      if (url.pathname.startsWith('/api/')) {
        await ensureMigrations(env)
        return await route(request, env)
      }

      // Static assets (JS/CSS/images) → let Cloudflare cache them (fingerprinted filenames)
      // Only treat known static extensions as assets; SPA fallback handles everything else.
      if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map|json)$/i)) {
        return env.ASSETS.fetch(request)
      }

      // HTML pages (/, /login, /register, etc.) → always fetch fresh, no CDN cache.
      // This prevents stale "Unified Workforce" after deploys.
      const assetRequest = new Request(request.url, request)
      assetRequest.headers.set('Cache-Control', 'no-store')
      const assetResponse = await env.ASSETS.fetch(assetRequest)
      const body = await assetResponse.arrayBuffer()
      return new Response(body, {
        status: assetResponse.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'CDN-Cache-Control': 'no-store',
        },
      })
    } catch (err) {
      return json({ error: err.message || 'Server error' }, err.status || 500, request)
    }
  },
}

async function route(request, env) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = request.method

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) })

  /* ---- public ---- */
  const publicRes = await firstMatch(PUBLIC_HANDLERS, { request, env, url, path, method })
  if (publicRes) return publicRes

  /* ---- authenticated ---- */
  const claims = await requireAuth(request, env)
  const ctx = { request, env, url, path, method, claims, isAdmin: claims.role === 'administrator' }
  const apiRes = await firstMatch(API_HANDLERS, ctx)
  if (apiRes) return apiRes

  return json({ error: 'Not found' }, 404, request)
}
