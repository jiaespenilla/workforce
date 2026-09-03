import { useEffect } from 'react'
import { getActiveSettings } from './systemSettings'

// Browser tab title: "<System Name> - <Page>" (e.g. "CadensIQ - Login Page").
export function setPageTitle(page) {
  const name = getActiveSettings().name
  document.title = page ? `${name} - ${page}` : name
}

// Hook version — sets the title on mount (and if the system name changes).
export function usePageTitle(page) {
  useEffect(() => {
    setPageTitle(page)
  }, [page])
}

const ICON_KEY = 'uw_system_icon'

export function getSystemIcon() {
  return localStorage.getItem(ICON_KEY) || null
}

export function setSystemIcon(dataUrl) {
  if (dataUrl) localStorage.setItem(ICON_KEY, dataUrl)
  else localStorage.removeItem(ICON_KEY)
  applyFavicon()
}

// Applies the admin-uploaded favicon to the browser tab.
export function applyFavicon() {
  let link = document.querySelector("link[rel~='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = getSystemIcon() || '/vite.svg'
}

// Public (unauthenticated) surfaces — login, kiosk — hydrate the selected
// system icon straight from the server so they match what signed-in users
// see, even when localStorage was cleared or the device is fresh.
export async function fetchPublicSystemIcon() {
  try {
    const res = await fetch('/api/public/settings')
    if (!res.ok) return getSystemIcon()
    const s = await res.json()
    if (s.system_icon) {
      localStorage.setItem(ICON_KEY, s.system_icon)
      applyFavicon()
      return s.system_icon
    }
    return getSystemIcon()
  } catch {
    return getSystemIcon()
  }
}

// Watches for system-name changes (applied at logout) and refreshes the title.
export function useTitleSync(page) {
  useEffect(() => {
    const t = setInterval(() => setPageTitle(page), 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
