import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AgentsApp } from '@/app/AgentsApp'
import '@/app/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentsApp />
  </StrictMode>,
)
