import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AuthLayout } from './components/layout/AuthLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { AssociateLayout } from './components/layout/AssociateLayout'
import { Associates } from './pages/Associates/Associates'
import { AssociateHome } from './pages/AssociateArea/AssociateHome'
import { AssociateInspection } from './pages/AssociateArea/AssociateInspection'
import { AssociateReview } from './pages/AssociateArea/AssociateReview'
import { Blocklist } from './pages/Blocklist/Blocklist'
import { Calendar } from './pages/Calendar/CalendarPage'
import { Closing } from './pages/Finance/Closing'
import { Finance } from './pages/Finance/Finance'
import { ForgotPassword } from './pages/ForgotPassword/ForgotPassword'
import { Guests } from './pages/Guests/Guests'
import { Inventory } from './pages/Inventory/Inventory'
import { Login } from './pages/Login/Login'
import { Register } from './pages/Register/Register'
import { Reservations } from './pages/Reservations/Reservations'
import { ResetPassword } from './pages/ResetPassword/ResetPassword'
import { Reviews } from './pages/Reviews/Reviews'
import { Fees } from './pages/Settings/Fees'

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
                <Route path="/associados" element={<Associates />} />
                <Route path="/inventario" element={<Inventory />} />
                <Route path="/avaliacoes" element={<Reviews />} />
                <Route path="/bloqueados" element={<Blocklist />} />
                <Route path="/ajustes" element={<Navigate to="/ajustes/taxas" replace />} />
                <Route path="/ajustes/taxas" element={<Fees />} />
              </Route>
            </Route>

            {/* Área do associado: simples, feita para o celular */}
            <Route element={<ProtectedRoute area="associate" />}>
              <Route element={<AssociateLayout />}>
                <Route path="/associado" element={<AssociateHome />} />
                <Route path="/associado/reserva/:id/vistoria" element={<AssociateInspection />} />
                <Route path="/associado/reserva/:id/avaliacao" element={<AssociateReview />} />
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
