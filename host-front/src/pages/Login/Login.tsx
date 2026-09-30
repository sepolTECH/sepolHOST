import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ApiError } from '../../services/api'
import './Login.css'
import { Logo } from '../../components/Logo'
import { maskEmail } from '../../utils/text'

type Status = 'idle' | 'loading' | 'success' | 'error'

// Atraso escalonado da animação de entrada de cada bloco
const delay = (i: number) => ({ '--i': i }) as CSSProperties

export function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)

  if (user && status !== 'success') return <Navigate to={from} replace />

  const busy = status === 'loading' || status === 'success'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return

    if (!email || !password) {
      fail('Preencha e-mail e senha')
      return
    }

    setStatus('loading')
    setError('')
    try {
      await signIn(email, password, remember)
      setStatus('success')
      setTimeout(() => navigate(from, { replace: true }), 700)
    } catch (err) {
      fail(err instanceof ApiError ? err.message : 'Erro ao entrar')
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
        <div className='logo-sepolhost-login'>
          <Logo className="img-sepolhost-login" />
        </div>
        <p className="login__subtitle stagger" style={delay(1)}>
          Entre com sua conta para continuar
        </p>

        <div className="field stagger" style={delay(2)}>
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
              autoFocus
            />
          </div>
        </div>

        <div className="field stagger" style={delay(3)}>
          <label htmlFor="password">Senha</label>
          <div className="field__control">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
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
          <div className="field__foot">
            <Link className="link" to="/esqueci-senha" state={{ email }}>
              Esqueci minha senha
            </Link>
          </div>
        </div>

        <label className="check stagger" style={delay(4)}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="check__box">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M5 12l5 5 9-10" />
            </svg>
          </span>
          Manter conectado
        </label>

        <div className={`login__error ${error ? 'is-visible' : ''}`} role="alert">
          <span>{error}</span>
        </div>

        <button type="submit" className={`btn stagger btn--${status}`} style={delay(5)} disabled={busy}>
          <span className="btn__label">Entrar</span>
          <span className="spinner" />
          <svg className="btn__check" viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12l5 5 9-10" />
          </svg>
        </button>

        <p className="login__switch stagger" style={delay(6)}>
          Não tem uma conta?{' '}
          <Link className="link link--strong" to="/criar-conta" state={location.state}>
            Criar conta
          </Link>
        </p>
      </form>
    </main>
  )
}
