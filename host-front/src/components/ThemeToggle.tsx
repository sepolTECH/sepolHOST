import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export function ThemeToggle({ floating = false, className = '' }: { floating?: boolean; className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'

  return (
    <button
      type="button"
      className={`theme-toggle ${floating ? 'theme-toggle--floating' : ''} ${className}`}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <Sun className="icon-sun" strokeWidth={1.8} aria-hidden />
      <Moon className="icon-moon" strokeWidth={1.8} aria-hidden />
    </button>
  )
}
