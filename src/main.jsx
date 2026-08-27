import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { resetDataIfNeeded } from './lib/dataVersion'
import { applyFavicon } from './lib/documentMeta'
import { cleanStaleLocalStorage } from './lib/api'
import { prefetchServerSettings } from './lib/systemSettings'

cleanStaleLocalStorage()
resetDataIfNeeded()
applyFavicon()

// Fetch server settings before rendering so the UI shows correct data immediately.
prefetchServerSettings().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  )
})
