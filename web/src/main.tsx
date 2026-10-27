import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FlashSalePage } from '@/features/flash-sale/flash-sale-page'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FlashSalePage />
  </StrictMode>,
)
