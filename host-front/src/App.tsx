import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AuthLayout } from './components/layout/AuthLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { Blocklist } from './pages/Blocklist/Blocklist'
import { Calendar } from './pages/Calendar/CalendarPage'
import { Closing } from './pages/Finance/Closing'
import { Finance } from './pages/Finance/Finance'
import { ForgotPassword } from './pages/ForgotPassword/ForgotPassword'
import { Guests } from './pages/Guests/Guests'
import { Login } from './pages/Login/Login'
import { Register } from './pages/Register/Register'
import { Reservations } from './pages/Reservations/Reservations'
import { ResetPassword } from './pages/ResetPassword/ResetPassword'
import { Reviews } from './pages/Reviews/Reviews'

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Telas públicas */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/criar-conta" element={<Register />} />
              <Route path="/esqueci-senha" element={<ForgotPassword />} />
              <Route path="/redefinir-senha" element={<ResetPassword />} />
            </Route>

            {/* Rotas autenticadas (menu lateral) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/cadastro/hospedes" replace />} />
                <Route path="/cadastro/hospedes" element={<Guests />} />
                <Route path="/cadastro/reservas" element={<Reservations />} />
                <Route path="/calendario" element={<Calendar />} />
                <Route path="/financas" element={<Navigate to="/financas/fechamento" replace />} />
                <Route path="/financas/fechamento" element={<Closing />} />
                <Route path="/financas/relatorio" element={<Finance />} />
                <Route path="/avaliacoes" element={<Reviews />} />
                <Route path="/bloqueados" element={<Blocklist />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
