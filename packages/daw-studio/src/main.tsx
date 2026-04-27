import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { useDAWStore } from './store/useDAWStore'
if (import.meta.env.DEV) (window as any).__dawStore = useDAWStore

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
