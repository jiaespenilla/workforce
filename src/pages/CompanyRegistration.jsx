import { useState } from 'react'
import { Logo } from '../components/Layout'

const industries = ['Technology', 'Healthcare', 'Retail', 'Manufacturing', 'Finance', 'Education', 'Construction', 'Hospitality', 'Other']

const NOTIFICATION_RECIPIENT = 'jiaespenilla@gmail.com'

export default function CompanyRegistration() {
  const [logoName, setLogoName] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md rounded-2xl border border-brand-200 bg-white p-10 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
            <svg className="h-7 w-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Registration submitted!</h1>
          <p className="mt-2 text-sm text-gray-500">Your application is now pending review. We'll notify you once an administrator approves your registration.</p>
          <a href="/login" className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Go to login</a>
        </div>
      </div>
    )
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'

  const handleSubmit = (e) => {
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    const company = {
      id: `reg-${Date.now()}`,
      name: data.companyName || 'Unnamed Company',
      industry: data.industry,
      address: data.address,
      city: data.city,
      country: data.country,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail || data.ownerEmail,
      registered: new Date().toISOString().slice(0, 10),
      logoName,
      status: 'pending',
      active: true,
      owner: { name: data.ownerName, title: data.jobTitle, email: data.ownerEmail },
      employees: [
        {
          name: data.ownerName || 'Owner',
          email: data.ownerEmail || '',
          role: data.jobTitle || 'Administrator',
          active: true,
        },
      ],
    }
    try {
      const existing = JSON.parse(localStorage.getItem('uw_companies')) || []
      localStorage.setItem('uw_companies', JSON.stringify([company, ...existing]))
      const notifications = JSON.parse(localStorage.getItem('uw_notifications')) || []
      notifications.push({
        id: `notif-${Date.now()}`,
        to: NOTIFICATION_RECIPIENT,
        subject: `New company registration: ${company.name}`,
        body: `A new company has registered on Unified Workforce.\n\nCompany: ${company.name}\nIndustry: ${company.industry}\nLocation: ${company.city}, ${company.country}\nContact email: ${company.contactEmail}\nRegistered: ${company.registered}\n\nOwner: ${company.employees[0].name} (${company.employees[0].email})`,
        createdAt: new Date().toISOString(),
        status: 'pending-smtp',
      })
      localStorage.setItem('uw_notifications', JSON.stringify(notifications))
    } catch {
      // storage unavailable — registration still succeeds in UI
    }
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 via-brand-500 to-emerald-400 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-center"><Logo light /></div>
        <form
          className="space-y-8 rounded-2xl bg-white p-6 shadow-xl sm:p-10"
          onSubmit={handleSubmit}
        >
          <div>
            <h1 className="text-xl font-bold text-gray-900">Company Registration</h1>
            <p className="mt-1 text-sm text-gray-500">Set up your organization on Unified Workforce.</p>
          </div>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-600">Company Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">Company name *</span>
                <input name="companyName" required placeholder="Acme Corporation" className={inputCls} />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">Address *</span>
                <input name="address" required placeholder="123 Main St, Suite 100" className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">City *</span>
                <input name="city" required className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Country *</span>
                <input name="country" required className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Contact phone *</span>
                <input name="contactPhone" required type="tel" placeholder="+1 (555) 000-0000" className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Contact email *</span>
                <input name="contactEmail" required type="email" placeholder="info@company.com" className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Industry / business type *</span>
                <select name="industry" required className={inputCls}>
                  {industries.map((i) => <option key={i}>{i}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Number of employees</span>
                <select className={inputCls}>
                  <option>1–10</option><option>11–50</option><option>51–200</option><option>201–1000</option><option>1000+</option>
                </select>
              </label>
            </div>
            <div className="mt-4">
              <span className="block text-sm font-medium text-gray-700">Company logo</span>
              <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 hover:border-brand-400 hover:bg-brand-50 transition">
                <svg className="h-8 w-8 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span>{logoName ? logoName : 'Click to upload a PNG or SVG logo'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setLogoName(e.target.files?.[0]?.name)} />
              </label>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-600">Owner / Administrator</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Full name *</span>
                <input name="ownerName" required className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Job title *</span>
                <input name="jobTitle" required placeholder="CEO" className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Email address *</span>
                <input name="ownerEmail" required type="email" className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Phone number *</span>
                <input name="ownerPhone" required type="tel" className={inputCls} />
              </label>
            </div>
          </section>

          <label className="flex items-start gap-3 text-sm text-gray-600">
            <input required type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
            <span>I agree to the <a href="#" className="font-medium text-brand-600 underline">Terms &amp; Conditions</a> and <a href="#" className="font-medium text-brand-600 underline">Privacy Policy</a>.</span>
          </label>

          <button type="submit" className="w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2">
            Submit registration
          </button>
          <p className="text-center text-sm text-gray-500">
            Already registered? <a href="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in</a>
          </p>
        </form>
      </div>
    </div>
  )
}
