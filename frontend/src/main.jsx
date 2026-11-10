
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { LayoutProvider } from './contexts/LayoutContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { IdiomaProvider } from './i18n/IdiomaProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <IdiomaProvider>
          <ThemeProvider>
            <LayoutProvider>
              <App />
            </LayoutProvider>
          </ThemeProvider>
        </IdiomaProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
