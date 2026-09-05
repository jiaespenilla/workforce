import { usePageTitle } from '../lib/documentMeta'
import { useEffect, useMemo, useState } from 'react'
import { api, apiEnabled } from '../lib/api'
import { getActiveSettings } from '../lib/systemSettings'
import { SkeletonRows } from '../components/Skeleton'
import Avatar from '../components/Avatar'
import {
  computePayrollRows, payrollTotals, periodRange, periodLabel, shiftPeriod,
  loadDeductions, saveDeductions, peso, fmtHours, openPayslipPrint,
} from '../lib/payroll'

const FREQUENCIES = [
  ['semi-monthly', 'Semi-monthly'],
  ['monthly', 'Monthly'],
  ['weekly', 'Weekly'],
  ['bi-weekly', 'Bi-weekly'],
]

const isoDay = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

// Set-salary modal — fills the "missing items" (pay type + rate) so the
// employee enters the payroll computation.
function SalaryModal({ employee, onClose, onSaved }) {
  const [payType, setPayType] = useState(employee.payType || 'monthly')
  const [payRate, setPayRate] = useState(employee.payRate || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    const rate = Number(payRate)
    if (!Number.isFinite(rate) || rate <= 0) { setError('Enter a rate greater than 0.'); return }
    setSaving(true)
    setError(null)
    try {
      await api('/api/employees/' + employee.id, { method: 'PUT', body: { payType, payRate: rate } })
      onSaved()
    } catch (err) {
      setError(err.message || 'Could not save the salary.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" />
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h3 className="text-base font-bold text-gray-900">Set salary — {employee.name}</h3>
        <p className="mt-1 text-sm text-gray-500">This employee is missing pay details and is excluded from payroll totals until they are set.</p>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-gray-700">Pay type</span>
          <select value={payType} onChange={(e) => setPayType(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200">
            <option value="monthly">Monthly salary</option>
            <option value="hourly">Hourly rate</option>
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="font-medium text-gray-700">{payType === 'hourly' ? 'Hourly rate (₱/hour)' : 'Monthly salary (₱/month)'}</span>
          <input
            type="number" min="0" step="0.01" inputMode="decimal" required autoFocus
            value={payRate} onChange={(e) => setPayRate(e.target.value)}
            placeholder={payType === 'hourly' ? 'e.g. 95.50' : 'e.g. 22000'}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Saving…' : 'Save salary'}
          </button>
        </div>
      </form>
    </div>
  )
}

// Payroll Management — live records from the API: employees (with pay fields),
// attendance punches for the selected pay period, and saved payroll runs.
export default function Payroll() {
  usePageTitle('Payroll')
  const [tab, setTab] = useState('records')
  const [frequency, setFrequency] = useState('semi-monthly')
  const [anchor, setAnchor] = useState(new Date())
  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [runs, setRuns] = useState([])
  const [deductions, setDeductions] = useState(() => loadDeductions())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [selected, setSelected] = useState(null)
  const [salaryFor, setSalaryFor] = useState(null)
  const [runConfirm, setRunConfirm] = useState(false)
  const [savingRun, setSavingRun] = useState(false)

  const period = useMemo(() => periodRange(frequency, anchor), [frequency, anchor])
  const pLabel = periodLabel(period)

  const reload = async () => {
    setRefreshing(true)
    setError(null)
    try {
      if (!apiEnabled()) {
        setEmployees([]); setAttendance([]); setRuns([])
        setError('Payroll needs the backend API (cloud mode). Open the deployed app or set VITE_API_URL in dev to load real records.')
      } else {
        const [cs, att, rn] = await Promise.all([
          api('/api/companies').catch(() => []),
          api('/api/attendance?from=' + encodeURIComponent(period.start.toISOString()) + '&to=' + encodeURIComponent(period.end.toISOString())),
          api('/api/payroll/runs').catch(() => []),
        ])
        const comps = Array.isArray(cs) ? cs : (cs.data || [])
        setEmployees(comps.flatMap((c) => (c.employees || []).map((e) => ({ ...e, companyName: c.name, companyId: c.id }))))
        setAttendance(Array.isArray(att) ? att : (att.data || []))
        setRuns(Array.isArray(rn) ? rn : (rn.data || []))
      }
    } catch (err) {
      setError(err.message || 'Could not load payroll data.')
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  // Reload when the pay period changes (attendance is range-scoped).
  useEffect(() => { reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) reload() }, [frequency, anchor]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => computePayrollRows({ employees, attendance, deductions, period }),
    [employees, attendance, deductions, period]
  )
  const totals = useMemo(() => payrollTotals(rows), [rows])
  const missingRows = rows.filter((r) => r.missing.length)
  const systemName = getActiveSettings().name || 'CadensIQ'

  const persistDeductions = () => {
    saveDeductions(deductions)
    setNotice('Deduction rates saved — payroll totals updated.')
    setTimeout(() => setNotice(null), 3500)
  }

  const runPayroll = async () => {
    setSavingRun(true)
    try {
      await api('/api/payroll/runs', {
        method: 'POST',
        body: {
          frequency,
          periodStart: isoDay(period.start),
          periodEnd: isoDay(period.end),
          employeeCount: totals.employeeCount,
          gross: totals.gross,
          deductions: totals.deductions,
          net: totals.net,
          details: rows.filter((r) => !r.missing.length).map((r) => ({
            name: r.name, role: r.role, payType: r.payType, payRate: r.payRate,
            hours: r.hours, otHours: r.otHours, base: r.base, otPay: r.otPay,
            gross: r.gross, dedTotal: r.dedTotal, net: r.net,
          })),
        },
      })
      setRunConfirm(false)
      setTab('runs')
      setNotice('Payroll run saved — see it in the run history.')
      setTimeout(() => setNotice(null), 4000)
      await reload()
    } catch (err) {
      setError(err.message || 'Could not save the payroll run.')
      setRunConfirm(false)
    } finally {
      setSavingRun(false)
    }
  }

  const deleteRun = async (id) => {
    try {
      await api('/api/payroll/runs/' + id, { method: 'DELETE' })
      setRuns((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      setError(err.message || 'Could not delete the run.')
    }
  }

  const navBtn = 'inline-flex items-center rounded-md px-2.5 py-1.5 text-sm text-gray-600 transition hover:bg-white hover:text-gray-900'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Payroll Management</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Live salary computation from timekeeping records — gross, deductions and net disbursement per pay period.</p>
        </div>
        <button
          onClick={() => setRunConfirm(true)}
          disabled={loading || totals.employeeCount === 0}
          title={totals.employeeCount === 0 ? 'No salary-configured employees for this period yet' : 'Save this payroll run to history'}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          Run Payroll
        </button>
      </div>

      {notice && (
        <p className="rounded-lg bg-brand-50 px-4 py-3 text-xs font-medium text-brand-800 ring-1 ring-brand-200">{notice}</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {/* Pay period selector */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          aria-label="Pay frequency"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        >
          {FREQUENCIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          <button onClick={() => setAnchor((a) => shiftPeriod(a, frequency, -1))} className={navBtn} title="Previous period">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => setAnchor(new Date())} className={'rounded-md px-3 py-1.5 text-sm font-medium transition ' + (period.start <= new Date() && period.end >= new Date() ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900')}>
            Current
          </button>
          <button onClick={() => setAnchor((a) => shiftPeriod(a, frequency, 1))} className={navBtn} title="Next period">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z" /></svg>
          {pLabel}
        </span>
        <button onClick={reload} disabled={refreshing} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:text-gray-900 disabled:opacity-50">
          <svg className={'h-3.5 w-3.5' + (refreshing ? ' animate-spin' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.2-3.3M4 15a8 8 0 0014.2 3.3" /></svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {[['records', 'Employee Records'], ['deductions', 'Deductions'], ['runs', 'Payroll Runs'], ['payslips', 'Payslips']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={'flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ' + (tab === id ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-brand-50')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'records' && (
        <>
          {/* Actual money needed this period */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['Employees on payroll', String(totals.employeeCount), 'text-gray-900', totals.missingCount > 0 ? totals.missingCount + ' need salary info' : 'All salary details set'],
              ['Gross payroll', peso(totals.gross), 'text-gray-900', fmtHours(totals.hours) + ' h + ' + fmtHours(totals.otHours) + ' h OT'],
              ['Total deductions', '−' + peso(totals.deductions), 'text-red-600', 'Statutory contributions'],
              ['Net disbursement', peso(totals.net), 'text-brand-600', 'Actual money needed to pay'],
            ].map(([label, v, tone, sub]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500">{label}</p>
                <p className={'mt-1 text-xl font-bold tabular-nums sm:text-2xl ' + tone}>{v}</p>
                <p className="mt-1 text-[11px] text-gray-400">{sub}</p>
              </div>
            ))}
          </div>

          {/* Missing pay details — added via the Set salary editor */}
          {missingRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <svg className="h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              <p className="min-w-0 flex-1 text-sm text-amber-800">
                <span className="font-semibold">{missingRows.length} employee(s) missing pay details</span> — excluded from totals until pay type and rate are set: {missingRows.slice(0, 4).map((r) => r.name).join(', ')}{missingRows.length > 4 ? '…' : ''}
              </p>
              <button onClick={() => setSalaryFor(missingRows[0])} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600">
                Set salary
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <SkeletonRows rows={6} page="Payroll" />
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500">
                No active employees found. Add people from the People page to start building payroll.
              </div>
            ) : (
              <table className="w-full min-w-[1020px] text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left sm:px-6">Employee</th>
                    <th className="px-3 py-3 text-left">Type / Rate</th>
                    <th className="px-3 py-3 text-right">Hours</th>
                    <th className="px-3 py-3 text-right">OT</th>
                    <th className="px-3 py-3 text-right">Base</th>
                    <th className="px-3 py-3 text-right">OT Pay</th>
                    <th className="px-3 py-3 text-right">Gross</th>
                    <th className="px-3 py-3 text-right">Deductions</th>
                    <th className="px-3 py-3 text-right">Net Pay</th>
                    <th className="px-4 py-3 sm:px-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 sm:px-6">
                        <div className="flex items-center gap-3">
                          <Avatar user={{ name: r.name, initials: r.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(), avatar: r.avatar }} size="h-9 w-9 text-xs" />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{r.name}</div>
                            <div className="text-xs text-gray-500">{r.role || 'Unassigned'}{r.companyName ? ' · ' + r.companyName : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {r.missing.length ? (
                          <button onClick={() => setSalaryFor(r)} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-200" title={'Missing: ' + r.missing.join(', ')}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                            Set salary
                          </button>
                        ) : (
                          <>
                            <div className="font-medium capitalize text-gray-700">{r.payType}</div>
                            <div className="text-xs tabular-nums text-gray-500">{peso(r.payRate)}{r.payType === 'hourly' ? '/h' : '/mo'}</div>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.missing.length ? '—' : fmtHours(r.hours)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.missing.length ? '—' : fmtHours(r.otHours)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.missing.length ? '—' : peso(r.base)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.missing.length ? '—' : peso(r.otPay)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-900">{r.missing.length ? '—' : peso(r.gross)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-600">{r.missing.length ? '—' : '−' + peso(r.dedTotal)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-brand-600">{r.missing.length ? '—' : peso(r.net)}</td>
                      <td className="px-4 py-3 text-right sm:px-6">
                        {r.missing.length ? (
                          <button onClick={() => setSalaryFor(r)} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">Add info</button>
                        ) : (
                          <button onClick={() => { setSelected(r); setTab('payslips') }} className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                            Payslip
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {!loading && rows.length > 0 && totals.employeeCount > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 text-sm font-bold text-gray-900">
                      <td className="px-4 py-3 sm:px-6" colSpan={2}>Totals — {pLabel}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmtHours(totals.hours)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmtHours(totals.otHours)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{peso(totals.base)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{peso(totals.otPay)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{peso(totals.gross)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-600">−{peso(totals.deductions)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-brand-600">{peso(totals.net)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
          <p className="text-xs text-gray-400">CEOs and administrators are excluded (not clock-tracked). Overtime pays 1.25× — for monthly salaries the OT hour rate = salary ÷ 168. Hours come from TimeKeeping clock-in/out records.</p>
        </>
      )}

      {tab === 'deductions' && (
        <div className="max-w-2xl space-y-4">
          <p className="text-sm text-gray-500">Deduction rates are applied as a percentage of each employee's gross pay for the selected period. Saving updates the payroll totals immediately.</p>
          {deductions.map((d, i) => (
            <div key={d.label} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{d.label}</p>
                <p className="text-xs text-gray-500">{d.pct}% of gross pay · statutory</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  type="number" min="0" max="100" step="0.5"
                  value={d.pct}
                  onChange={(e) => setDeductions((prev) => prev.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) || 0 } : x)))}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  aria-label={d.label + ' rate'}
                />
                <span className="text-sm font-semibold text-gray-400">%</span>
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Preview at current totals</p>
            {deductions.map((d) => (
              <div key={d.label} className="mt-1 flex justify-between text-sm">
                <span className="text-gray-600">{d.label} ({d.pct}%)</span>
                <span className="font-medium tabular-nums text-gray-900">{peso((totals.gross * d.pct) / 100)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-brand-200 pt-2 text-sm font-bold">
              <span>Total deductions</span>
              <span className="tabular-nums">{peso(totals.deductions)}</span>
            </div>
          </div>
          <button onClick={persistDeductions} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Save deduction rates</button>
        </div>
      )}

      {tab === 'runs' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-emerald-50 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Run payroll for {pLabel}</h2>
            <p className="mt-1 text-sm text-gray-500">Saves a snapshot of the current computation to the run history — the actual money needed to disburse.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-white/80 p-3 ring-1 ring-brand-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Gross</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{peso(totals.gross)}</p>
              </div>
              <div className="rounded-lg bg-white/80 p-3 ring-1 ring-brand-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Deductions</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-red-600">−{peso(totals.deductions)}</p>
              </div>
              <div className="rounded-lg bg-white/80 p-3 ring-1 ring-brand-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Net disbursement</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-brand-600">{peso(totals.net)}</p>
              </div>
            </div>
            <button
              onClick={() => setRunConfirm(true)}
              disabled={savingRun || totals.employeeCount === 0}
              className="mt-4 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingRun ? 'Saving…' : 'Schedule & Run'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <SkeletonRows rows={3} page="Payroll runs" />
            ) : runs.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500">No payroll runs yet. Your run history will appear here.</div>
            ) : (
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left sm:px-6">Period</th>
                    <th className="px-3 py-3 text-left">Frequency</th>
                    <th className="px-3 py-3 text-right">Employees</th>
                    <th className="px-3 py-3 text-right">Gross</th>
                    <th className="px-3 py-3 text-right">Deductions</th>
                    <th className="px-3 py-3 text-right">Net Paid</th>
                    <th className="px-3 py-3 text-left">Run date</th>
                    <th className="px-4 py-3 sm:px-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runs.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 sm:px-6">{r.periodStart} → {r.periodEnd}</td>
                      <td className="px-3 py-3 capitalize text-gray-600">{r.frequency}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.employeeCount}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{peso(r.gross)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-600">−{peso(r.deductions)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-brand-600">{peso(r.net)}</td>
                      <td className="px-3 py-3 text-gray-500">{r.createdAt || '—'}</td>
                      <td className="px-4 py-3 text-right sm:px-6">
                        <button onClick={() => deleteRun(r.id)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'payslips' && (
        <div className="mx-auto max-w-xl">
          {!selected ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
              Select an employee from the Records tab to view their payslip.
            </div>
          ) : selected.missing.length ? (
            <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-10 text-center">
              <p className="text-sm font-semibold text-amber-800">{selected.name} is missing pay details ({selected.missing.join(', ')}).</p>
              <button onClick={() => setSalaryFor(selected)} className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">Set salary</button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md">
              <div className="bg-gradient-to-r from-brand-600 to-emerald-500 p-6 text-white">
                <p className="text-xs uppercase tracking-wide text-brand-100">Payslip — {pLabel}</p>
                <p className="mt-1 text-xl font-bold">{selected.name}</p>
                <p className="text-sm text-brand-100">{selected.role || 'Unassigned'}{selected.companyName ? ' · ' + selected.companyName : ''}</p>
              </div>
              <div className="space-y-6 p-6">
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Earnings</h3>
                  {[
                    ['Base pay' + (selected.payType === 'hourly' ? ' (' + fmtHours(selected.hours) + ' h × ' + peso(selected.payRate) + '/h)' : ' (monthly salary)'), selected.base],
                    ['Overtime (' + fmtHours(selected.otHours) + ' h × 1.25)', selected.otPay],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between gap-4 py-1.5 text-sm">
                      <span className="text-gray-600">{l}</span><span className="font-medium tabular-nums text-gray-900">{peso(v)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold">
                    <span>Gross pay</span><span className="tabular-nums">{peso(selected.gross)}</span>
                  </div>
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Deductions</h3>
                  {selected.deductions.map((d) => (
                    <div key={d.label} className="flex justify-between gap-4 py-1.5 text-sm">
                      <span className="text-gray-600">{d.label} ({d.pct}%)</span>
                      <span className="font-medium tabular-nums text-red-600">−{peso(d.amount)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold">
                    <span>Total deductions</span><span className="tabular-nums text-red-600">−{peso(selected.dedTotal)}</span>
                  </div>
                </section>
                <div className="flex items-center justify-between rounded-lg bg-brand-50 p-4">
                  <span className="font-semibold text-gray-900">Net pay</span>
                  <span className="text-xl font-bold tabular-nums text-brand-600">{peso(selected.net)}</span>
                </div>
                <button onClick={() => openPayslipPrint(selected, period, { systemName })} className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                  Download PDF
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {salaryFor && (
        <SalaryModal
          employee={salaryFor}
          onClose={() => setSalaryFor(null)}
          onSaved={() => { setSalaryFor(null); reload() }}
        />
      )}

      {runConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !savingRun && setRunConfirm(false)}>
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">Run payroll for {pLabel}?</h3>
            <p className="mt-1 text-sm text-gray-500">This saves a permanent snapshot to the payroll run history.</p>
            <div className="mt-4 space-y-1.5 rounded-lg bg-gray-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Employees</span><span className="font-semibold tabular-nums">{totals.employeeCount}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Gross</span><span className="font-semibold tabular-nums">{peso(totals.gross)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Deductions</span><span className="font-semibold tabular-nums text-red-600">−{peso(totals.deductions)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5"><span className="font-semibold">Net disbursement</span><span className="font-bold tabular-nums text-brand-600">{peso(totals.net)}</span></div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setRunConfirm(false)} disabled={savingRun} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={runPayroll} disabled={savingRun} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
                {savingRun ? 'Saving…' : 'Confirm & save run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}