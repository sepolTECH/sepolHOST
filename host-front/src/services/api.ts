// Em dev, o Vite faz proxy de /api para o back.
// Em produção, defina VITE_API_URL (ex.: https://api.seudominio.com.br) ou sirva o front e o back no mesmo domínio.
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      credentials: 'include', // envia/recebe o cookie httpOnly
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor', 0)
  }

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.message ?? 'Erro inesperado', res.status)
  return data as T
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
}

export const authApi = {
  login: (email: string, password: string, remember: boolean) =>
    api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, remember }),
    }),
  register: (name: string, email: string, password: string) =>
    api<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  forgotPassword: (email: string) =>
    api<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    api<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  me: () => api<{ user: User }>('/auth/me'),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
}
