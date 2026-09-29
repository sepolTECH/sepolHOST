import { ShieldAlert, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { guestsApi, type DocumentLookup } from '../../services/api'
import { DOCUMENT_LABEL, formatDocument } from '../../utils/documents'
import { BlockedAlert } from './BlockedAlert'
import './BlockedAlert.css'

const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
/** Mesma regra do back: só letras/números, mínimo de 5 caracteres. */
const docKey = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, '')

interface DependentNoticeProps {
  /** Documento a consultar (com ou sem máscara). */
  document: string | null | undefined
  /** Ignora este responsável (ex.: o da própria reserva — o acompanhante é dependente dele). */
  excludeMainGuestId?: string | null
  /** Também avisa se o próprio documento pertence a um hóspede bloqueado (use nos acompanhantes). */
  checkBlockedGuest?: boolean
  /** Versão mais enxuta (linhas de acompanhantes). */
  compact?: boolean
  /** Abre os links em nova aba (use dentro de formulários, para não perder o que foi digitado). */
  newTab?: boolean
}

/**
 * Avisos sobre um documento:
 * - já foi cadastrado como dependente de outro hóspede (apenas informativo);
 * - é dependente de um hóspede bloqueado (alerta);
 * - (opcional) pertence a um hóspede bloqueado.
 * Não bloqueia nada: o cadastro pode continuar normalmente.
 */
export function DependentNotice({
  document,
  excludeMainGuestId,
  checkBlockedGuest = false,
  compact = false,
  newTab = false,
}: DependentNoticeProps) {
  const key = docKey(document ?? '')
  const queryKey = key.length >= 5 ? `${key}|${excludeMainGuestId ?? ''}` : ''
  const [result, setResult] = useState<{ key: string; data: DocumentLookup } | null>(null)

  useEffect(() => {
    if (!queryKey) return
    const controller = new AbortController()
    // espera o usuário parar de digitar
    const t = window.setTimeout(() => {
      guestsApi
        .documentLookup(key, excludeMainGuestId, controller.signal)
        .then((data) => setResult({ key: queryKey, data }))
        .catch(() => {}) // informativo: se falhar, simplesmente não mostra
    }, 400)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
    // queryKey já reflete documento + responsável ignorado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey])

  if (!queryKey || result?.key !== queryKey) return null
  const { guest, dependentOf } = result.data
  const blockedGuest = checkBlockedGuest && guest?.blocked ? guest : null
  const blockedMains = dependentOf.filter((d) => d.mainGuest.blocked)
  const otherMains = dependentOf.filter((d) => !d.mainGuest.blocked)
  if (!blockedGuest && !dependentOf.length) return null

  const linkProps = newTab ? { target: '_blank', rel: 'noreferrer' } : {}

  return (
    <div className={`dependent-notices ${compact ? 'dependent-notices--compact' : ''}`}>
      {blockedGuest && blockedGuest.blocked && (
        <BlockedAlert
          block={blockedGuest.blocked}
          guestId={blockedGuest.id}
          title={`Atenção: ${blockedGuest.fullName} está bloqueado`}
          newTab={newTab}
        />
      )}

      {blockedMains.length > 0 && (
        <div className="blocked-alert" role="alert">
          <ShieldAlert className="blocked-alert__icon" strokeWidth={1.8} aria-hidden />
          <div className="blocked-alert__body">
            <strong>Atenção: dependente de hóspede bloqueado</strong>
            <ul className="dependent-notice__list">
              {blockedMains.map(({ dependentId, dependentName, mainGuest }) => (
                <li key={dependentId}>
                  <p className="blocked-alert__reason">
                    {dependentName} foi cadastrado como dependente de <b>{mainGuest.fullName}</b> (
                    {DOCUMENT_LABEL[mainGuest.documentType]}{' '}
                    {formatDocument(mainGuest.documentType, mainGuest.documentNumber)}), que está bloqueado
                    {mainGuest.blocked && !compact && <>: {mainGuest.blocked.reason}</>}
                  </p>
                  {mainGuest.blocked && (
                    <small>
                      Bloqueado em {date(mainGuest.blocked.blockedAt)}
                      {mainGuest.blocked.blockedByName && ` por ${mainGuest.blocked.blockedByName}`}
                      {' · '}
                      <Link to={`/bloqueados?hospede=${mainGuest.id}`} {...linkProps}>
                        Ver bloqueio{newTab && ' ↗'}
                      </Link>
                    </small>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {otherMains.length > 0 && (
        <div className="dependent-notice" role="status">
          <Users className="dependent-notice__icon" strokeWidth={1.8} aria-hidden />
          <div className="dependent-notice__body">
            <strong>Documento já cadastrado como dependente</strong>
            <p>
              {otherMains[0].dependentName} aparece como dependente de{' '}
              {otherMains.map((d, i) => (
                <span key={d.dependentId}>
                  {i > 0 && (i === otherMains.length - 1 ? ' e ' : ', ')}
                  <b>{d.mainGuest.fullName}</b>
                </span>
              ))}
              .{!compact && ' Apenas um aviso — o cadastro pode continuar normalmente.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
