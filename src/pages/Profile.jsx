import { useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePageTitle } from '../lib/documentMeta'
import Avatar from '../components/Avatar'
import { AVATAR_PRESETS } from '../lib/avatarPresets'

export default function Profile() {
  usePageTitle('My Profile')
  const { user, updateProfile, changeOwnPassword } = useAuth()
  const fileRef = useRef(null)

  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [avatar, setAvatar] = useState(user?.avatar || null)
  const [profileSaved, setProfileSaved] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwError, setPwError] = useState(null)
  const [pwSaved, setPwSaved] = useState(false)

  const Eye = ({ on }) => (
    on ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
       : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
  )

  if (!user) return null

  const saveProfile = (e) => {
    e.preventDefault()
    updateProfile({ name: name.trim() || user.name, phone: phone.trim(), avatar })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 3000)
  }

  const pickAvatar = (file) => {
    if (!file) return
    if (file.size > 500 * 1024) { alert('Please choose an image under 500KB.'); return }
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return }
    const reader = new FileReader()
    reader.onload = () => setAvatar(reader.result)
    reader.onerror = () => alert('Failed to read image.')
    reader.readAsDataURL(file)
  }

  const submitPassword = async (e) => {
    e.preventDefault()
    setPwError(null)
    setPwSaved(false)
    if (newPw !== confirmPw) {
      setPwError('New password and confirmation do not match.')
      return
    }
    const error = await changeOwnPassword(currentPw, newPw)
    if (error) {
      setPwError(error)
      return
    }
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    setPwSaved(true)
    setTimeout(() => setPwSaved(false), 4000)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Account</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">My Profile</h1>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">Manage your personal details and account security.</p>
        </div>
      </div>

      {user.usingDefaultPassword && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span><span className="font-bold">Security notice:</span> you are using the default password. Update it in the Change Password section below.</span>
        </div>
      )}

      {/* Profile details — stacked on mobile, row on desktop */}
      <form onSubmit={saveProfile} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-gray-900 sm:text-lg">Profile details</h2>
        <p className="mt-1 text-xs text-gray-500">Your avatar appears in headers, People and Dashboard. Pick a preset or upload.</p>

        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div className="relative">
            {avatar ? (
              <img src={avatar} alt="Profile" className="h-24 w-24 rounded-full object-cover ring-2 ring-brand-200 shadow sm:h-20 sm:w-20" onError={(e)=>{e.currentTarget.style.display='none'}} />
            ) : (
              <Avatar user={user} size="h-24 w-24 text-2xl sm:h-20 sm:w-20 sm:text-xl" />
            )}
          </div>
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-full bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-brand-700 min-h-[40px]"
              >
                Upload photo
              </button>
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar(null)}
                  className="rounded-full border border-gray-300 bg-white px-5 py-2.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 min-h-[40px]"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (file.size > 500 * 1024) { alert('Please choose an image under 500KB.'); e.target.value=''; return }
                if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); e.target.value=''; return }
                const reader = new FileReader()
                reader.onload = () => setAvatar(reader.result)
                reader.onerror = () => alert('Failed to read image.')
                reader.readAsDataURL(file)
                e.target.value = ''
              }}
            />
            <p className="text-center text-[11px] leading-relaxed text-gray-400 sm:text-left">Shown next to your name. Upload &lt;500KB coexists with presets below.</p>
          </div>
        </div>

        {/* Preset icon selection — 3 SVG choices, kept alongside upload */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 sm:p-5">
          <p className="text-sm font-semibold text-gray-900">Or choose a preset icon</p>
          <p className="mt-1 text-xs text-gray-500">Pick one of 3 SVG presets — tap to preview, then Save.</p>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
            {AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setAvatar(preset.src)}
                className={`group flex flex-col items-center gap-2 rounded-xl border-2 bg-white p-3 transition sm:p-4 ${avatar === preset.src ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200' : 'border-gray-200 hover:border-brand-200 hover:shadow-sm'}`}
                title={preset.label}
                aria-label={`Select ${preset.label} preset`}
              >
                <img src={preset.src} alt={preset.label} className="h-14 w-14 rounded-full object-cover shadow-sm transition group-hover:scale-105 sm:h-16 sm:w-16" />
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${avatar===preset.src?'bg-brand-600 text-white':'bg-gray-100 text-gray-600'}`}>{preset.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-gray-400">Presets are lightweight — upload is preserved. Selected preset shows ring.</p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Full name:</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 min-h-[44px]"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Contact number:</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+63 917 000 0000"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 min-h-[44px]"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">Email address (login):</span>
            <input value={user.email} readOnly disabled className="mt-1 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500" />
          </label>
          <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">Role</span>
            <p className="mt-1 font-medium text-gray-900">{user.roleLabel}{user.companyName ? <span className="text-gray-500"> · {user.companyName}</span> : ''}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
          {profileSaved && <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Profile updated</span>}
          <button type="submit" className="w-full rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 sm:w-auto min-h-[44px]">
            Save changes
          </button>
        </div>
      </form>

      {/* Password — stacked on mobile */}
      <form onSubmit={submitPassword} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-gray-900 sm:text-lg">Change password</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500 sm:text-sm">
          {user.usingDefaultPassword
            ? 'You are still using the default password — updating it is strongly recommended.'
            : 'Use at least 8 characters. Choose a strong, unique password.'}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">Current password:</span>
            <div className="relative mt-1">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-3 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 min-h-[44px]"
              />
              <button type="button" onClick={()=>setShowCurrent(!showCurrent)} aria-label={showCurrent ? 'Hide' : 'Show'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Eye on={showCurrent} /></button>
            </div>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">New password:</span>
            <div className="relative mt-1">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-3 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 min-h-[44px]"
              />
              <button type="button" onClick={()=>setShowNew(!showNew)} aria-label={showNew ? 'Hide' : 'Show'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Eye on={showNew} /></button>
            </div>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Confirm new password:</span>
            <div className="relative mt-1">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-3 pr-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 min-h-[44px]"
              />
              <button type="button" onClick={()=>setShowConfirm(!showConfirm)} aria-label={showConfirm ? 'Hide' : 'Show'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Eye on={showConfirm} /></button>
            </div>
          </label>
        </div>

        {pwError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700 ring-1 ring-red-200">{pwError}</p>
        )}
        {pwSaved && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Password changed successfully ✓</p>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
          <button type="submit" className="w-full rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 sm:w-auto min-h-[44px]">
            Update password
          </button>
        </div>
      </form>
    </div>
  )
}
