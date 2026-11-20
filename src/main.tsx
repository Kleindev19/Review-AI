
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// ==========================================
// VERCEL / PWA CHUNK LOADING RECOVERY
// ==========================================

const CHUNK_RELOAD_KEY = 'studyroom-chunk-reload'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()

  const now = Date.now()

  const lastReload = Number(
    sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0'
  )

  // Reload once if the browser is requesting
  // an outdated JavaScript file after deployment.

  if (now - lastReload > 60_000) {
    sessionStorage.setItem(
      CHUNK_RELOAD_KEY,
      String(now)
    )

    window.location.reload()
    return
  }

  console.error(
    'JavaScript chunk is still unavailable after reload.'
  )

  alert(
    'StudyRoom was updated, but a required file could not be loaded. Please reopen the application.'
  )
})

// ==========================================
// REACT APPLICATION
// ==========================================

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
