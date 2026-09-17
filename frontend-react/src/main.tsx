//import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n/I18nProvider.tsx'

createRoot(document.getElementById('root')).render(
  //<StrictMode>
    // I18nProvider sits ABOVE everything, including AuthProvider and the
    // router. Language is not a property of being logged in, and the router
    // must already be inside it so every page can call useT().
    <I18nProvider>
      <App />
    </I18nProvider>
  //</StrictMode>,
)

