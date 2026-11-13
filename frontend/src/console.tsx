import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConsoleApp } from '@/app/ConsoleApp'
import '@/app/styles/console.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConsoleApp />
  </StrictMode>,
)
