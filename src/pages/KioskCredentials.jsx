import { usePageTitle } from '../lib/documentMeta'
import PersonalTimeClock from '../components/PersonalTimeClock'

export default function PhonePasskeys() {
  usePageTitle('My Phone Passkeys')
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Account security</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">My Phone Passkeys</h1>
        <p className="mt-1 text-sm text-gray-500">Add more than one personal phone, review when each was used, or remove a lost device.</p>
      </div>
      <PersonalTimeClock manageOnly />
      <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-5 text-sm leading-relaxed text-brand-900 shadow-sm">
        The app never receives or stores your fingerprint or face scan. Your phone keeps that information and sends only a secure approval.
      </div>
    </div>
  )
}
