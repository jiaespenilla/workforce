// Profile avatar: shows the uploaded photo when available, otherwise initials.
export default function Avatar({ user, size = 'h-9 w-9 text-xs' }) {
  if (user?.avatar) {
    return <img src={user.avatar} alt={user?.name || 'Profile'} className={`${size} shrink-0 rounded-full object-cover`} onError={(e)=>{e.currentTarget.style.display='none'}} />
  }
  return (
    <div className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white`}>
      {user?.initials || '?'}
    </div>
  )
}
