import { Outlet } from 'react-router-dom'
import { ThemeToggle } from '../ThemeToggle'

/** Telas públicas (login, cadastro, senha): conteúdo + botão de tema no canto. */
export function AuthLayout() {
  return (
    <>
      <ThemeToggle floating />
      <Outlet />
    </>
  )
}
