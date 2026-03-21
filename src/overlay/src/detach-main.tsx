import './assets/overlay.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import DetachApp from './DetachApp'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <DetachApp />
    </StrictMode>
)
