import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ApiError } from '../../services/api'
import { EMAIL_RE, validatePassword } from '../../utils/password'
import '../Login/Login.css'
import { Logo } from '../../components/Logo'
import { collapseSpaces, maskEmail } from '../../utils/text'

type Status = 'idle' | 'loading' | 'success' | 'error'

// Atraso escalonado da animação de entrada de cada bloco
const delay = (i: number) => ({ '--i': i }) as CSSProperties

export function Register() {
  const { user, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)

  if (user && status !== 'success') return <Navigate to={from} replace />

  const busy = status === 'loading' || status === 'success'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return

    if (!name.trim() || !email.trim() || !password || !confirm) return fail('Preencha todos os campos')
    if (name.trim().length < 2) return fail('Informe seu nome')
    if (!EMAIL_RE.test(email.trim())) return fail('E-mail inválido')
    const passwordError = validatePassword(password)
    if (passwordError) return fail(passwordError)
    if (password !== confirm) return fail('As senhas não coincidem')

    setStatus('loading')
    setError('')
    try {
      await signUp(name.trim(), email.trim(), password)
      setStatus('success')
      setTimeout(() => navigate(from, { replace: true }), 700)
    } catch (err) {
      fail(err instanceof ApiError ? err.message : 'Erro ao criar conta')
    }
  }

  function fail(message: string) {
    setError(message)
    setStatus('error')
    setShakeKey((k) => k + 1)
  }

  return (
    <main className="login">
      <form
        key={shakeKey}
        className={`login__card ${shakeKey > 0 ? 'shake' : ''} ${status === 'success' ? 'is-success' : ''}`}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="logo-sepolhost-login">
          <Logo className="img-sepolhost-login" />
        </div>
        <p className="login__subtitle stagger" style={delay(1)}>
          Crie sua conta para começar
        </p>

        <div className="field stagger" style={delay(2)}>
          <label htmlFor="name">Nome</label>
          <div className="field__control">
            <input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Seu nome completo"
              value={name}
              onChange={(e) => setName(collapseSpaces(e.target.value))}
              disabled={busy}
              autoFocus
            />
          </div>
        </div>

        <div className="field stagger" style={delay(3)}>
          <label htmlFor="email">E-mail</label>
          <div className="field__control">
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@sepol.com.br"
              value={email}
              onChange={(e) => setEmail(maskEmail(e.target.value))}
              disabled={busy}
            />
          </div>
        </div>

        <div className="field stagger" style={delay(4)}>
          <label htmlFor="password">Senha</label>
          <div className="field__control">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="field__toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <p className="field__hint">Mínimo de 8 caracteres, com letras e números</p>
        </div>

        <div className="field stagger" style={delay(5)}>
          <label htmlFor="confirm">Confirmar senha</label>
          <div className="field__control">
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className={`login__error ${error ? 'is-visible' : ''}`} role="alert">
          <span>{error}</span>
        </div>

        <button type="submit" className={`btn stagger btn--${status}`} style={delay(6)} disabled={busy}>
          <span className="btn__label">Criar conta</span>
          <span className="spinner" />
          <svg className="btn__check" viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12l5 5 9-10" />
          </svg>
        </button>

        <p className="login__switch stagger" style={delay(7)}>
          Já tem uma conta?{' '}
          <Link className="link link--strong" to="/login" state={location.state}>
            Entrar
          </Link>
        </p>
      </form>
    </main>
  )
}
