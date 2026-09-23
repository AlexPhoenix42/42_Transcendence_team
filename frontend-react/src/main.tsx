//import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Onglet ouvert avant un rebuild : ses chunks JS n'existent plus (404) ->
// on recharge pour récupérer la nouvelle version. Une fois par 10 s au plus,
// pour ne pas boucler si le fichier manque vraiment.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('chunkReloadAt') || 0)
    if (Date.now() - last < 10000) return
    sessionStorage.setItem('chunkReloadAt', String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  //<StrictMode>
    <App />
  //</StrictMode>,
)

