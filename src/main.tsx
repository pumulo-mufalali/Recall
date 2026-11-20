import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Roboto, bundled with the app (variable weight, upright and italic) so it works offline.
import '@fontsource-variable/roboto/wght.css'
import '@fontsource-variable/roboto/wght-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
