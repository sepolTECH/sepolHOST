import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ApiError, authApi } from '../../services/api'
import { EMAIL_RE } from '../../utils/password'
import '../Login/Login.css'
import { Logo } from '../../components/Logo'
import { maskEmail } from '../../utils/text'

type Status = 'idle' | 'loading' | 'sent' | 'error'

// Atraso escalonado da animação de entrada de cada bloco
const delay = (i: number) => ({ '--i': i }) as CSSProperties

export function ForgotPassword() {
  const location = useLocation()
  // Reaproveita o e-mail digitado na tela de login, se houver
  const initialEmail = (location.state as { email?: string })?.email ?? ''

  const [email, setEmail] = useState(initialEmail)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)

  const busy = status === 'loading'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return

    if (!email.trim()) return fail('Informe seu e-mail')
    if (!EMAIL_RE.test(email.trim())) return fail('E-mail inválido')

    setStatus('loading')
    setError('')
    try {
      await authApi.forgotPassword(email.trim())
      setStatus('sent')
    } catch (err) {
      fail(err instanceof ApiError ? err.message : 'Erro ao enviar o link')
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
        key={status === 'sent' ? 'sent' : shakeKey}
        className={`login__card ${shakeKey > 0 && status !== 'sent' ? 'shake' : ''}`}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="logo-sepolhost-login">
          <Logo className="img-sepolhost-login" />
        </div>

        {status === 'sent' ? (
          <div className="login__notice stagger" style={delay(1)}>
            <span className="login__notice-icon">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M5 12l5 5 9-10" />
              </svg>
            </span>
            <p>
              Se houver uma conta com <strong>{email.trim()}</strong>, você receberá um e-mail com o link para
              redefinir a senha.
            </p>
            <p>Confira também a caixa de spam.</p>
          </div>
        ) : (
          <>
            <p className="login__subtitle stagger" style={delay(1)}>
              Informe o e-mail da sua conta e enviaremos um link para redefinir a senha
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

            <div className={`login__error ${error ? 'is-visible' : ''}`} role="alert">
              <span>{error}</span>
            </div>

            <button type="submit" className={`btn stagger btn--${status}`} style={delay(3)} disabled={busy}>
              <span className="btn__label">Enviar link</span>
              <span className="spinner" />
            </button>
          </>
        )}

        <p className="login__switch stagger" style={delay(4)}>
          Lembrou a senha?{' '}
          <Link className="link link--strong" to="/login">
            Voltar para o login
          </Link>
        </p>
      </form>
    </main>
  )
}
