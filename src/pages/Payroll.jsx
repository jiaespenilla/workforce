import { usePageTitle } from '../lib/documentMeta'
import { useMemo, useState } from 'react'

const employees = []

const deductions = [
  { label: 'Income tax withholding', pct: 15 },
  { label: 'Social security (SSS)', pct: 4.5 },
  { label: 'Health insurance', pct: 2 },
  { label: 'Retirement contribution', pct: 3 },
]

function peso(n) {
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

export default function Payroll() {
  usePageTitle('Payroll')
  const [tab, setTab] = useState('records')
  const [selected, setSelected] = useState(null)

  const rows = useMemo(() =>
    employees.map((e) => {
      const base = e.type === 'Monthly' ? e.rate : e.rate * e.hours
      const ot = e.type === 'Monthly' ? (e.rate / 168) * e.otHours * 1.25 : e.rate * e.otHours * 1.25
      const gross = base + ot
      const dedTotal = deductions.reduce((s, d) => s + (gross * d.pct) / 100, 0)
      const net = gross - dedTotal
      return { ...e, base, ot, gross, dedTotal, net }
    }), [])

  const totals = rows.reduce(
    (acc, r) => ({ gross: acc.gross + r.gross, ded: acc.ded + r.dedTotal, net: acc.net + r.net }),
    { gross: 0, ded: 0, net: 0 }
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Main Menu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Payroll Management</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Manage salaries, deductions and payroll runs.</p>
        </div>
        <button
          onClick={() => setTab('runs')}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          Run Payroll
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {[['records', 'Employee Records'], ['deductions', 'Deductions'], ['runs', 'Payroll Runs'], ['payslips', 'Payslips']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-brand-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'records' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              ['Gross payroll', totals.gross],
              ['Total deductions', totals.ded],
              ['Net disbursement', totals.net],
            ].map(([label, v]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${label === 'Net disbursement' ? 'text-brand-600' : 'text-gray-900'}`}>{peso(v)}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            {rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500">
                No employee payroll records yet. Employee salary details will appear here once configured.
              </div>
            ) : (
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-6 py-3">Employee</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Base</th>
                  <th className="px-6 py-3">OT Pay</th>
                  <th className="px-6 py-3">Gross</th>
                  <th className="px-6 py-3">Deductions</th>
                  <th className="px-6 py-3">Net Pay</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.role}</div>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{r.type}</td>
                    <td className="px-6 py-3 tabular-nums text-gray-700">{peso(r.base)}</td>
                    <td className="px-6 py-3 tabular-nums text-gray-700">{peso(r.ot)}</td>
                    <td className="px-6 py-3 tabular-nums text-gray-700">{peso(r.gross)}</td>
                    <td className="px-6 py-3 tabular-nums text-red-600">−{peso(r.dedTotal)}</td>
                    <td className="px-6 py-3 font-semibold tabular-nums text-brand-600">{peso(r.net)}</td>
                    <td className="px-6 py-3">
                      <button onClick={() => { setSelected(r); setTab('payslips') }} className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                        Payslip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </>
      )}

      {tab === 'deductions' && (
        <div className="max-w-2xl space-y-4">
          {deductions.map((d, i) => (
            <div key={d.label} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm font-medium text-gray-900">{d.label}</p>
                <p className="text-xs text-gray-500">{d.pct}% of gross pay · statutory</p>
              </div>
              <input type="number" defaultValue={d.pct} step="0.5" className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" data-i={i} />
            </div>
          ))}
          <button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Save deduction rates</button>
        </div>
      )}

      {tab === 'runs' && (
        <div className="max-w-2xl space-y-4">
          <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-emerald-50 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Schedule next run</h2>
            <p className="mt-1 text-sm text-gray-500">No payroll runs scheduled yet.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200">
                <option>Semi-monthly</option><option>Monthly</option><option>Weekly</option><option>Bi-weekly</option>
              </select>
              <input type="date" className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Schedule &amp; Run</button>
            </div>
          </div>
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            No payroll runs yet. Your run history will appear here.
          </div>
        </div>
      )}

      {tab === 'payslips' && (
        <div className="mx-auto max-w-xl">
          {!selected ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
              Select an employee from the Records tab to view their payslip.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md">
              <div className="bg-gradient-to-r from-brand-600 to-emerald-500 p-6 text-white">
                <p className="text-xs uppercase tracking-wide text-brand-100">Payslip — Aug 16–31, 2026</p>
                <p className="mt-1 text-xl font-bold">{selected.name}</p>
                <p className="text-sm text-brand-100">{selected.role}</p>
              </div>
              <div className="space-y-6 p-6">
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Earnings</h3>
                  {[['Base salary', selected.base], [`Overtime (${selected.otHours}h × 1.25)`, selected.ot]].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-1.5 text-sm">
                      <span className="text-gray-600">{l}</span><span className="font-medium tabular-nums text-gray-900">{peso(v)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold">
                    <span>Gross pay</span><span className="tabular-nums">{peso(selected.gross)}</span>
                  </div>
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Deductions</h3>
                  {deductions.map((d) => (
                    <div key={d.label} className="flex justify-between py-1.5 text-sm">
                      <span className="text-gray-600">{d.label} ({d.pct}%)</span>
                      <span className="font-medium tabular-nums text-red-600">−{peso((selected.gross * d.pct) / 100)}</span>
                    </div>
                  ))}
                </section>
                <div className="flex items-center justify-between rounded-lg bg-brand-50 p-4">
                  <span className="font-semibold text-gray-900">Net pay</span>
                  <span className="text-xl font-bold text-brand-600 tabular-nums">{peso(selected.net)}</span>
                </div>
                <button className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Download PDF</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
