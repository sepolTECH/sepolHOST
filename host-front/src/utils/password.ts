// Mesmas regras validadas no back (host-back/src/modules/auth/auth.routes.ts)
export function validatePassword(password: string) {
  if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres'
  if (password.length > 72) return 'A senha deve ter no máximo 72 caracteres'
  if (!/[A-Za-z]/.test(password)) return 'A senha deve conter pelo menos uma letra'
  if (!/\d/.test(password)) return 'A senha deve conter pelo menos um número'
  return ''
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
