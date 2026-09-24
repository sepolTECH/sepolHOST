import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi, type User } from '../services/api'

interface AuthContextValue {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string, remember: boolean) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Ao abrir a aplicação, verifica se já existe uma sessão válida (cookie)
  useEffect(() => {
    authApi
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    const { user } = await authApi.login(email, password, remember)
    setUser(user)
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { user } = await authApi.register(name, email, password)
    setUser(user)
  }, [])

  const signOut = useCallback(async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
