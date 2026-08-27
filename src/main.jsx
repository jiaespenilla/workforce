import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { resetDataIfNeeded } from './lib/dataVersion'
import { applyFavicon } from './lib/documentMeta'
import { cleanStaleLocalStorage } from './lib/api'
import { prefetchServerSettings } from './lib/systemSettings'
import { prefetchRoles } from './lib/roles'

cleanStaleLocalStorage()
resetDataIfNeeded()
applyFavicon()

// Render immediately — never gate first paint on the network.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

// Hydrate server-managed data (settings, roles) in the background so branding
// updates as soon as it arrives, without blocking the initial render.
Promise.all([prefetchServerSettings(), prefetchRoles()]).catch(() => {})
