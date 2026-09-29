import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import '../../styles/ui.css'
import { Logo } from '../Logo'
import { ThemeToggle } from '../ThemeToggle'
import './AppLayout.css'
import { Sidebar } from './Sidebar'

/** Estrutura da área logada: menu lateral fixo + conteúdo. */
export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="app">
      {/* onNavigate fecha o menu (mobile) ao escolher uma página */}
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      {menuOpen && <div className="app__backdrop" onClick={() => setMenuOpen(false)} aria-hidden />}

      {/* Barra superior — só aparece em telas pequenas */}
      <header className="app__topbar">
        <button type="button" className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
          <Menu size={20} strokeWidth={1.8} />
        </button>
        <Logo className="app__topbar-logo" />
        <ThemeToggle />
      </header>

      <main className="app__content">
        <Outlet />
      </main>
    </div>
  )
}
