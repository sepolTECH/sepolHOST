import { LogOut } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import '../../styles/ui.css'
import { useAuth } from '../../contexts/AuthContext'
import { Logo } from '../Logo'
import { ThemeToggle } from '../ThemeToggle'
import './AssociateLayout.css'

/** Estrutura da área do associado: sem menu lateral, só topo simples + conteúdo em coluna única. */
export function AssociateLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="ap">
      <header className="ap__top">
        <Logo className="ap__logo" />
        <div className="ap__top-actions">
          <ThemeToggle />
          <button type="button" className="ap__exit" onClick={signOut}>
            <LogOut aria-hidden />
            Sair
          </button>
        </div>
      </header>
      <main className="ap__main">
        <p className="ap__hello">
          Olá, <strong>{user?.name.split(' ')[0]}</strong>
        </p>
        <Outlet />
      </main>
    </div>
  )
}
