import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Security banner shown while the account still uses the default password.
export default function DefaultPasswordBanner() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('uw_pwd_banner_dismissed') === '1'
  )

  if (!user?.usingDefaultPassword || dismissed) return null

  const dismiss = () => {
    sessionStorage.setItem('uw_pwd_banner_dismissed', '1')
    setDismissed(true)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <div className="text-xs leading-relaxed text-amber-800">
          <p className="font-bold">Security notice</p>
          <p>You are currently using the default password. For your account's safety, please change it now.</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 self-start sm:self-auto">
        <button
          onClick={() => navigate('/profile')}
          className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          Change password
        </button>
        <button
          onClick={dismiss}
          className="rounded-lg border border-amber-300 px-4 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
        >
          Later
        </button>
      </div>
    </div>
  )
}
