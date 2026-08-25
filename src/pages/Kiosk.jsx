import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const employees = [
  { id: 1, name: 'Sarah Chen' },
  { id: 2, name: 'Miguel Torres' },
  { id: 3, name: 'Ana Reyes' },
]

export default function Kiosk() {
  const [now, setNow] = useState(new Date())
  const [employee, setEmployee] = useState(employees[0])
  const [message, setMessage] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const punch = (type) => {
    setMessage({
      type,
      text: `${type === 'in' ? 'Checked in' : 'Checked out'} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Have a great ${type === 'in' ? 'shift' : 'day'}, ${employee.name.split(' ')[0]}!`,
    })
    setTimeout(() => setMessage(null), 5000)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-600 to-emerald-500 p-6 text-white">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-bold text-brand-600">U</div>
          <span className="text-lg font-semibold">Kiosk</span>
        </div>
        <Link to="/" className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">Exit kiosk</Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 py-8">
        <div className="text-center">
          <p className="text-6xl font-bold tabular-nums sm:text-7xl">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <p className="mt-2 text-lg text-brand-100">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="w-full">
          <label htmlFor="kiosk-employee" className="mb-1 block text-center text-sm font-medium text-brand-100">Select your name</label>
          <select
            id="kiosk-employee"
            value={employee.id}
            onChange={(e) => setEmployee(employees.find((x) => x.id === Number(e.target.value)))}
            className="w-full rounded-xl border-0 bg-white px-4 py-4 text-base font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-white/40"
          >
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => punch('in')}
            className="flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-brand-700 shadow-xl transition active:scale-95 hover:bg-brand-50"
          >
            <svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <span className="text-xl font-bold">CHECK IN</span>
          </button>
          <button
            onClick={() => punch('out')}
            className="flex flex-col items-center gap-3 rounded-3xl bg-gray-900/20 py-10 text-white ring-2 ring-white/60 shadow-xl transition active:scale-95 hover:bg-gray-900/30"
          >
            <svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="text-xl font-bold">CHECK OUT</span>
          </button>
        </div>

        {message && (
          <div className={`w-full rounded-2xl px-5 py-4 text-center text-base font-semibold shadow-lg ${message.type === 'in' ? 'bg-white text-brand-700' : 'bg-gray-900 text-white'}`}>
            {message.text}
          </div>
        )}

        <p className="text-center text-sm text-brand-100">Welcome! Tap check-in when you start and check-out when you leave.</p>
      </main>
    </div>
  )
}
