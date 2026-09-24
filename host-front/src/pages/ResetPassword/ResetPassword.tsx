import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, authApi } from '../../services/api'
import { validatePassword } from '../../utils/password'
import '../Login/Login.css'
import logoSepolhost from '../../assets/logo-sepolhost.png'

type Status = 'idle' | 'loading' | 'done' | 'error'

// Atraso escalonado da animação de entrada de cada bloco
const delay = (i: number) => ({ '--i': i }) as CSSProperties

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)

  const busy = status === 'loading'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return

    if (!password || !confirm) return fail('Preencha os dois campos')
    const passwordError = validatePassword(password)
    if (passwordError) return fail(passwordError)
    if (password !== confirm) return fail('As senhas não coincidem')

    setStatus('loading')
    setError('')
    try {
      await authApi.resetPassword(token, password)
      setStatus('done')
    } catch (err) {
      fail(err instanceof ApiError ? err.message : 'Erro ao redefinir a senha')
    }
  }

  function fail(message: string) {
    setError(message)
    setStatus('error')
    setShakeKey((k) => k + 1)
  }

  // Link sem token (aberto incompleto ou digitado à mão)
  if (!token) {
    return (
      <Notice
        text="Este link de redefinição é inválido ou está incompleto."
        linkTo="/esqueci-senha"
        linkLabel="Solicitar um novo link"
      />
    )
  }

  if (status === 'done') {
    return (
      <Notice
        success
        text="Senha redefinida com sucesso. Já pode entrar com a nova senha."
        linkTo="/login"
        linkLabel="Ir para o login"
      />
    )
  }

  return (
    <main className="login">
      <form
        key={shakeKey}
        className={`login__card ${shakeKey > 0 ? 'shake' : ''}`}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="logo-sepolhost-login">
          <img src={logoSepolhost} alt="" className="img-sepolhost-login" />
        </div>
        <p className="login__subtitle stagger" style={delay(1)}>
          Crie uma nova senha para sua conta
        </p>

        <div className="field stagger" style={delay(2)}>
          <label htmlFor="password">Nova senha</label>
          <div className="field__control">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoFocus
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

        <div className="field stagger" style={delay(3)}>
          <label htmlFor="confirm">Confirmar nova senha</label>
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

        <button type="submit" className={`btn stagger btn--${status}`} style={delay(4)} disabled={busy}>
          <span className="btn__label">Redefinir senha</span>
          <span className="spinner" />
        </button>

        <p className="login__switch stagger" style={delay(5)}>
          <Link className="link link--strong" to="/login">
            Voltar para o login
          </Link>
        </p>
      </form>
    </main>
  )
}

function Notice({
  text,
  linkTo,
  linkLabel,
  success = false,
}: {
  text: string
  linkTo: string
  linkLabel: string
  success?: boolean
}) {
  return (
    <main className="login">
      <div className="login__card">
        <div className="logo-sepolhost-login">
          <img src={logoSepolhost} alt="" className="img-sepolhost-login" />
        </div>
        <div className="login__notice stagger" style={delay(1)}>
          {success && (
            <span className="login__notice-icon">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M5 12l5 5 9-10" />
              </svg>
            </span>
          )}
          <p>{text}</p>
        </div>
        <Link to={linkTo} className="btn stagger" style={{ ...delay(2), textDecoration: 'none' }}>
          <span className="btn__label">{linkLabel}</span>
        </Link>
      </div>
    </main>
  )
}
