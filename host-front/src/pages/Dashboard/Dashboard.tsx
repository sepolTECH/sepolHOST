import { useAuth } from '../../contexts/AuthContext'
import './Dashboard.css'

// Tela provisória pós-login — será substituída pelo restante da aplicação
export function Dashboard() {
  const { user, signOut } = useAuth()

  return (
    <main className="dash">
      <header className="dash__header">
        <span className="dash__brand">SEPOL<span>HOST</span></span>
        <button className="dash__logout" onClick={signOut}>
          Sair
        </button>
      </header>
      <section className="dash__content">
        <h1>Olá, {user?.name.split(' ')[0]}</h1>
        <p>Login realizado com sucesso. O painel será construído aqui.</p>
      </section>
    </main>
  )
}
