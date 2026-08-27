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
  const [pwError, setPwError] = useState(null)
  const [pwSaved, setPwSaved] = useState(false)

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

  const submitPassword = (e) => {
    e.preventDefault()
    setPwError(null)
    setPwSaved(false)
    if (newPw !== confirmPw) {
      setPwError('New password and confirmation do not match.')
      return
    }
    const error = changeOwnPassword(currentPw, newPw)
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Account</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">My Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your personal details and account security.</p>
      </div>

      {user.usingDefaultPassword && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span><span className="font-bold">Security notice:</span> you are using the default password. Update it in the Change Password section below.</span>
        </div>
      )}

      {/* Profile details */}
      <form onSubmit={saveProfile} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-900">Profile details</h2>

        <div className="mt-4 flex items-center gap-4">
          {avatar ? (
            <img src={avatar} alt="Profile" className="h-20 w-20 rounded-full object-cover ring-2 ring-brand-200" onError={(e)=>{e.currentTarget.style.display='none'}} />
          ) : (
            <Avatar user={user} size="h-20 w-20 text-xl" />
          )}
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Upload photo
            </button>
            {avatar && (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                className="ml-2 rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Remove
              </button>
            )}
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
            <p className="mt-1.5 text-[11px] text-gray-400">Shown next to your name across the system. Upload coexists with presets.</p>
          </div>
        </div>

        {/* Preset icon selection — 3 SVG choices, kept alongside upload */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-900">Or choose a preset icon</p>
          <p className="mt-0.5 text-xs text-gray-500">Pick one of 3 SVG presets — applies after Save.</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setAvatar(preset.src)}
                className={`rounded-xl border-2 bg-white p-3 transition ${avatar === preset.src ? 'border-brand-600 ring-2 ring-brand-200' : 'border-gray-200 hover:border-brand-200'}`}
                title={preset.label}
                aria-label={`Select ${preset.label} preset`}
              >
                <img src={preset.src} alt={preset.label} className="h-12 w-12 mx-auto rounded-full object-cover" />
                <span className="mt-1 block text-[10px] font-medium text-gray-600">{preset.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">Presets are lightweight SVGs — upload is preserved. Select a preset then Save changes.</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Full name:</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Contact number:</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+63 917 000 0000"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">Email address (login):</span>
            <input value={user.email} readOnly disabled className="mt-1 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
          </label>
          <div className="text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">Role:</span>
            <p className="mt-1">{user.roleLabel}{user.companyName ? ` · ${user.companyName}` : ''}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          {profileSaved && <span className="text-xs font-medium text-brand-700">Profile updated ✓</span>}
          <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
            Save changes
          </button>
        </div>
      </form>

      {/* Password */}
      <form onSubmit={submitPassword} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-900">Change password</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          {user.usingDefaultPassword
            ? 'You are still using the default password — updating it is strongly recommended.'
            : 'Use at least 8 characters.'}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">Current password:</span>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">New password:</span>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Confirm new password:</span>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />
          </label>
        </div>

        {pwError && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">{pwError}</p>
        )}
        {pwSaved && (
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 ring-1 ring-brand-200">Password changed successfully ✓</p>
        )}

        <div className="mt-5 flex justify-end border-t border-gray-100 pt-4">
          <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
            Update password
          </button>
        </div>
      </form>
    </div>
  )
}
