import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { useDAWStore } from './store/useDAWStore'

// Expose the store on `window` in dev builds for diagnostics.  Declared on a
// minimal ambient global so no `any` is needed at the call site.
declare global {
  interface Window { __dawStore?: typeof useDAWStore }
}

if (import.meta.env.DEV) window.__dawStore = useDAWStore

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
