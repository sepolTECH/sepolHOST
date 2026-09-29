import { useEffect, useState } from 'react'
import { guestsApi, type Guest } from '../../services/api'

/**
 * Baixa a foto do documento (rota protegida) e devolve uma URL local (blob:)
 * para exibir. Recarrega quando o hóspede é alterado e libera a memória ao sair.
 */
export function useDocumentPhoto(guest: Pick<Guest, 'id' | 'hasDocumentPhoto' | 'updatedAt'> | null) {
  const key = guest?.hasDocumentPhoto ? `${guest.id}|${guest.updatedAt}` : ''
  const [state, setState] = useState<{ key: string; url: string | null; error: string }>({
    key: '',
    url: null,
    error: '',
  })

  useEffect(() => {
    if (!key) return
    const id = key.split('|')[0]
    const controller = new AbortController()
    let url: string | null = null
    guestsApi
      .getDocumentPhoto(id, controller.signal)
      .then((blob) => {
        url = URL.createObjectURL(blob)
        setState({ key, url, error: '' })
      })
      .catch((err) => {
        if (!controller.signal.aborted) setState({ key, url: null, error: err.message ?? 'Erro ao carregar a foto' })
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [key])

  const current = state.key === key ? state : null
  return { url: current?.url ?? null, loading: !!key && !current, error: current?.error ?? '' }
}
