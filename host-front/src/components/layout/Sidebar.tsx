import { ChevronDown, LogOut } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Logo } from '../Logo'
import { ThemeToggle } from '../ThemeToggle'
import { MENU, type MenuItem } from './menu'

interface SidebarProps {
  open: boolean
  onNavigate: () => void
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { user, signOut } = useAuth()
  const initials = (user?.name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Menu principal">
      <div className="sidebar__brand">
        <Logo className="sidebar__logo" />
      </div>

      <nav className="sidebar__nav">
        {MENU.map((item) => (
          <SidebarItem key={item.label} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__user">
          <span className="sidebar__avatar" aria-hidden>
            {initials}
          </span>
          <div className="sidebar__user-info">
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
        </div>
        <div className="sidebar__actions">
          <ThemeToggle />
          <button type="button" className="sidebar__logout" onClick={signOut}>
            <LogOut size={16} strokeWidth={1.8} />
            Sair
          </button>
        </div>
      </div>
    </aside>
  )
}

function SidebarItem({ item, onNavigate }: { item: MenuItem; onNavigate: () => void }) {
  const location = useLocation()
  const Icon = item.icon
  const childActive = item.children?.some((c) => location.pathname.startsWith(c.to)) ?? false
  const [expanded, setExpanded] = useState(childActive)

  // Abre o grupo automaticamente quando uma página dele passa a ficar ativa
  // (ex.: redirecionamento após o login). Ajuste de estado durante o render,
  // como recomendado pelo React, em vez de useEffect.
  const [wasActive, setWasActive] = useState(childActive)
  if (childActive !== wasActive) {
    setWasActive(childActive)
    if (childActive) setExpanded(true)
  }

  // Item simples (sem submenu)
  if (!item.children) {
    return (
      <NavLink to={item.to!} className="sidebar__item" onClick={onNavigate}>
        <Icon className="sidebar__icon" strokeWidth={1.7} />
        <span className="sidebar__label">{item.label}</span>
      </NavLink>
    )
  }

  const submenuId = `submenu-${item.label}`
  return (
    <div className={`sidebar__group ${expanded ? 'is-expanded' : ''}`}>
      <button
        type="button"
        className={`sidebar__item ${childActive ? 'active' : ''}`}
        aria-expanded={expanded}
        aria-controls={submenuId}
        onClick={() => setExpanded((v) => !v)}
      >
        <Icon className="sidebar__icon" strokeWidth={1.7} />
        <span className="sidebar__label">{item.label}</span>
        <ChevronDown className="sidebar__chevron" strokeWidth={1.8} />
      </button>
      <div className="sidebar__submenu" id={submenuId}>
        <div className="sidebar__submenu-inner">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className="sidebar__subitem"
              onClick={onNavigate}
              tabIndex={expanded ? undefined : -1}
            >
              <span className="sidebar__dot" aria-hidden />
              {child.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}
