import logoLight from '../assets/logo-sepolhost.png'
import logoDark from '../assets/logo-sepolhost-dark.png'
import { useTheme } from '../contexts/ThemeContext'

/** Logo da Sepol Host na versão certa para o tema atual. */
export function Logo({ className }: { className?: string }) {
  const { theme } = useTheme()
  return <img src={theme === 'dark' ? logoDark : logoLight} alt="Sepol Host" className={className} />
}
