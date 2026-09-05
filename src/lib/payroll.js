// Payroll computation — pure functions (no DOM/API) so the math is unit-testable.
//
// Money model (item 49):
//   Hourly employee → base = pay_rate × hours worked (from clock-in/out pairs)
//   Monthly employee → base = pay_rate (full period) ; OT hourly = pay_rate / 168
//   Overtime pay = OT hourly × 1.25 × OT hours (OT comes from flagged punch sessions)
//   Deductions = % of gross, configurable on the Deductions tab
//   Net pay (the actual money needed to disburse) = gross − deductions
//
// Employees without pay_type/pay_rate are flagged `missing` and excluded from
// totals until their salary is configured (the page offers an inline editor).

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Default statutory-style deductions (percent of gross). Editable on the page
// and persisted per-browser until saved.
export const DEFAULT_DEDUCTIONS = [
  { label: 'Income tax withholding', pct: 15 },
  { label: 'Social security (SSS)', pct: 4.5 },
  { label: 'Health insurance (PhilHealth)', pct: 2 },
  { label: 'Retirement contribution (PAG-IBIG)', pct: 3 },
]

const DEDUCTIONS_KEY = 'uw_payroll_deductions'

export function loadDeductions() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEDUCTIONS_KEY))
    if (Array.isArray(raw) && raw.every((d) => d && typeof d.label === 'string' && Number.isFinite(Number(d.pct)))) {
      return raw.map((d) => ({ label: d.label, pct: Number(d.pct) }))
    }
  } catch {}
  return DEFAULT_DEDUCTIONS.map((d) => ({ ...d }))
}

export function saveDeductions(list) {
  try { localStorage.setItem(DEDUCTIONS_KEY, JSON.stringify(list)) } catch {}
}

// PHP peso formatter — always two decimals so payroll columns line up.
export function peso(n) {
  const v = Number(n) || 0
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Hours [h]:mm like the TimeKeeping reports (e.g. 40:30).
export function fmtHours(hours) {
  const totalMin = Math.round(Math.max(0, Number(hours) || 0) * 60)
  return Math.floor(totalMin / 60) + ':' + String(totalMin % 60).padStart(2, '0')
}

// CEO / administrators are not clock-tracked (same rule as TimeKeeping) so
// they are excluded from payroll computation.
export function isExemptEmployee(emp) {
  return /^(ceo|administrator|admin)$/i.test(String(emp?.role || ''))
}

// Sessionize punches → { hours, otHours }.
// Mirrors TimeKeeping: in→out pairs; OT minutes come from overtime_minutes
// (flagged sessions), with a fallback to the legacy boolean flag.
export function sessionize(punches) {
  const sorted = [...(punches || [])].sort((a, b) => new Date(a.time) - new Date(b.time))
  let totalMs = 0
  let otMs = 0
  let lastIn = null
  const hasMinutes = sorted.some((p) => p.overtime_minutes !== undefined && p.overtime_minutes !== null)
  for (const p of sorted) {
    if (p.type === 'in') { lastIn = new Date(p.time); continue }
    if (p.type !== 'out' || !lastIn) continue
    const dur = Math.max(0, new Date(p.time) - lastIn)
    totalMs += dur
    if (hasMinutes) otMs += (Number(p.overtime_minutes) || 0) * 60000
    else if (p.overtime) otMs += dur
    lastIn = null
  }
  return { hours: totalMs / 3600000, otHours: otMs / 3600000 }
}

// Pay period boundaries for a frequency + anchor date (local time).
// Returns { start, end } as Date objects.
export function periodRange(frequency, anchor) {
  const d = new Date(anchor)
  const y = d.getFullYear()
  const m = d.getMonth()
  const sod = (yy, mm, dd) => { const x = new Date(yy, mm, dd); x.setHours(0, 0, 0, 0); return x }
  const eod = (yy, mm, dd) => { const x = new Date(yy, mm, dd); x.setHours(23, 59, 59, 999); return x }
  if (frequency === 'monthly') return { start: sod(y, m, 1), end: eod(y, m + 1, 0) }
  if (frequency === 'semi-monthly') {
    if (d.getDate() <= 15) return { start: sod(y, m, 1), end: eod(y, m, 15) }
    return { start: sod(y, m, 16), end: eod(y, m + 1, 0) }
  }
  if (frequency === 'bi-weekly') {
    const monday = sod(y, m, d.getDate() - ((d.getDay() + 6) % 7))
    const start = new Date(monday); start.setDate(start.getDate() - 7)
    const end = new Date(monday); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  // weekly — Monday..Sunday
  const start = sod(y, m, d.getDate() - ((d.getDay() + 6) % 7))
  const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999)
  return { start, end }
}

// Human label for a period, e.g. "Sep 1 – Sep 15, 2026".
export function periodLabel({ start, end }) {
  const s = start.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const e = end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  return s + ' – ' + e
}

// Move the anchor date one period back/forward.
export function shiftPeriod(anchor, frequency, dir) {
  const d = new Date(anchor)
  const n = dir >= 0 ? 1 : -1
  if (frequency === 'monthly') { d.setMonth(d.getMonth() + n); return d }
  if (frequency === 'semi-monthly') { d.setDate(d.getDate() + 15 * n); return d }
  if (frequency === 'bi-weekly') { d.setDate(d.getDate() + 14 * n); return d }
  d.setDate(d.getDate() + 7 * n)
  return d
}

// Compute payroll rows for one period.
//   employees    — [{ id, name, email, role, active, payType, payRate, companyName }]
//   attendance   — punch rows [{ email, type, time, overtime, overtime_minutes }]
//                 (out-of-period punches are ignored via period.start/end)
//   deductions   — [{ label, pct }]
export function computePayrollRows({ employees, attendance, deductions, period }) {
  const list = Array.isArray(deductions) ? deductions : DEFAULT_DEDUCTIONS
  const byEmail = new Map()
  for (const p of attendance || []) {
    const t = new Date(p.time).getTime()
    if (period && (t < period.start.getTime() || t > period.end.getTime())) continue
    const arr = byEmail.get(p.email) || []
    arr.push(p)
    byEmail.set(p.email, arr)
  }

  const rows = []
  for (const emp of employees || []) {
    if (emp.active === false || isExemptEmployee(emp)) continue
    const { hours, otHours } = sessionize(byEmail.get(emp.email))
    const payType = String(emp.payType || '').toLowerCase()
    const payRate = Number(emp.payRate)
    const missing = []
    if (payType !== 'monthly' && payType !== 'hourly') missing.push('pay type')
    if (!Number.isFinite(payRate) || payRate <= 0) missing.push('pay rate')

    let base = 0
    let otPay = 0
    let otHourly = 0
    if (!missing.length) {
      if (payType === 'monthly') {
        base = round2(payRate)
        otHourly = payRate / 168
      } else {
        otHourly = payRate
        base = round2(payRate * hours)
      }
      otPay = round2(otHourly * 1.25 * otHours)
    }
    const gross = round2(base + otPay)
    const dedLines = missing.length ? [] : list.map((d) => ({ label: d.label, pct: Number(d.pct) || 0, amount: round2((gross * (Number(d.pct) || 0)) / 100) }))
    const dedTotal = round2(dedLines.reduce((s, d) => s + d.amount, 0))
    const net = round2(gross - dedTotal)
    rows.push({
      id: emp.id,
      name: emp.name,
      email: emp.email,
      role: emp.role,
      companyName: emp.companyName,
      avatar: emp.avatar || null,
      payType: payType === 'monthly' || payType === 'hourly' ? payType : null,
      payRate: Number.isFinite(payRate) && payRate > 0 ? payRate : null,
      hours: round2(hours),
      otHours: round2(otHours),
      base,
      otPay,
      otHourly: round2(otHourly),
      gross,
      deductions: dedLines,
      dedTotal,
      net,
      missing,
    })
  }
  return rows
}

// Totals over the configured (non-missing) rows — the actual money needed.
export function payrollTotals(rows) {
  const configured = (rows || []).filter((r) => !r.missing.length)
  return {
    employeeCount: configured.length,
    missingCount: (rows || []).length - configured.length,
    gross: round2(configured.reduce((s, r) => s + r.gross, 0)),
    deductions: round2(configured.reduce((s, r) => s + r.dedTotal, 0)),
    net: round2(configured.reduce((s, r) => s + r.net, 0)),
    base: round2(configured.reduce((s, r) => s + r.base, 0)),
    otPay: round2(configured.reduce((s, r) => s + r.otPay, 0)),
    hours: round2(configured.reduce((s, r) => s + r.hours, 0)),
    otHours: round2(configured.reduce((s, r) => s + r.otHours, 0)),
  }
}

// Printable payslip HTML (opens a print window → Save as PDF).
export function payslipHtml(row, period, { systemName = 'CadensIQ' } = {}) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const label = periodLabel(period)
  const earnings = [
    ['Base pay' + (row.payType === 'hourly' ? ' (' + fmtHours(row.hours) + ' h × ' + peso(row.payRate) + ')' : ''), row.base],
    ['Overtime (' + fmtHours(row.otHours) + ' h × 1.25 × ' + peso(row.otHourly) + '/h)', row.otPay],
  ]
  return '<html><head><meta charset="utf-8"><title>Payslip — ' + esc(row.name) + ' — ' + esc(label) + '</title>'
    + '<style>@page{size:A4;margin:16mm}body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;margin:0}'
    + '.cover{background:linear-gradient(135deg,#065f46,#059669 60%,#34d399);color:#fff;border-radius:12px;padding:24px 28px}'
    + '.cover h1{margin:0;font-size:22px}.cover p{margin:3px 0;font-size:12px;opacity:.92}'
    + 'table{border-collapse:collapse;width:100%;margin-top:18px}th,td{border:1px solid #e5e7eb;padding:9px 12px;text-align:left}th{background:#ecfdf5;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#065f46}'
    + '.num{text-align:right;white-space:nowrap}.total td{font-weight:bold;background:#ecfdf5}'
    + '.net{display:flex;justify-content:space-between;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 18px;margin-top:18px;font-size:16px;font-weight:bold}'
    + '.foot{margin-top:22px;font-size:10px;color:#9ca3af;text-align:center}</style></head><body>'
    + '<div class="cover"><h1>' + esc(systemName) + ' — Payslip</h1><p>Pay period: ' + esc(label) + ' · ' + esc(row.payType === 'hourly' ? 'Hourly rate' : 'Monthly salary') + '</p>'
    + '<p>' + esc(row.name) + ' · ' + esc(row.role || 'Unassigned') + ' · ' + esc(row.companyName || '') + '</p><p>' + esc(row.email) + '</p></div>'
    + '<table><thead><tr><th>Earnings</th><th class="num">Amount</th></tr></thead><tbody>'
    + earnings.map(([l, v]) => '<tr><td>' + esc(l) + '</td><td class="num">' + esc(peso(v)) + '</td></tr>').join('')
    + '<tr class="total"><td>Gross pay</td><td class="num">' + esc(peso(row.gross)) + '</td></tr></tbody></table>'
    + '<table><thead><tr><th>Deductions</th><th class="num">Amount</th></tr></thead><tbody>'
    + row.deductions.map((d) => '<tr><td>' + esc(d.label + ' (' + d.pct + '%)') + '</td><td class="num">−' + esc(peso(d.amount)) + '</td></tr>').join('')
    + '<tr class="total"><td>Total deductions</td><td class="num">−' + esc(peso(row.dedTotal)) + '</td></tr></tbody></table>'
    + '<div class="net"><span>NET PAY</span><span>' + esc(peso(row.net)) + '</span></div>'
    + '<p class="foot">Generated ' + esc(new Date().toLocaleString()) + ' · This payslip is computer-generated — no signature required.</p></body></html>'
}

export function openPayslipPrint(row, period, opts) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(payslipHtml(row, period, opts))
  win.document.close()
  win.focus()
  win.print()
}