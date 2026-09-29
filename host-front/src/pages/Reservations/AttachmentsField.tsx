import { ExternalLink, FileText, Paperclip, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Segmented } from '../../components/ui/Segmented'
import {
  reservationsApi,
  type AttachmentCategory,
  type ReservationAttachment,
} from '../../services/api'
import { DOCUMENT_FILE_ACCEPT, prepareDocumentFile } from '../../utils/image'
import { openAttachment } from './attachments'
import { ATTACHMENT_LABEL, ATTACHMENT_OPTIONS, formatFileSize } from './options'

/** Arquivo escolhido no formulário, enviado depois que a reserva é salva. */
export interface PendingAttachment {
  key: number
  file: File
  category: AttachmentCategory
}

let nextKey = 1

// ---------------------------------------------------------------------------
// Utilitários compartilhados com a visualização da reserva
// ---------------------------------------------------------------------------

/** Miniatura de um anexo já salvo (imagens são baixadas; PDF mostra ícone). */
export function AttachmentThumb({
  reservationId,
  attachment,
}: {
  reservationId: string
  attachment: ReservationAttachment
}) {
  const isImage = attachment.mime.startsWith('image/')
  const key = isImage ? `${reservationId}|${attachment.id}` : ''
  const [state, setState] = useState<{ key: string; url: string | null }>({ key: '', url: null })

  useEffect(() => {
    if (!key) return
    const [resId, attId] = key.split('|')
    const controller = new AbortController()
    let url: string | null = null
    reservationsApi
      .getAttachment(resId, attId, controller.signal)
      .then((blob) => {
        url = URL.createObjectURL(blob)
        setState({ key, url })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, url: null })
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [key])

  const url = state.key === key ? state.url : null
  if (isImage && url) return <img className="att__thumb" src={url} alt="" />
  return (
    <span className="att__thumb att__thumb--icon" aria-hidden>
      {isImage ? <span className="spinner spinner--dark" /> : <FileText strokeWidth={1.5} />}
    </span>
  )
}

function PendingThumb({ file }: { file: File }) {
  const url = useMemo(() => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  if (url) return <img className="att__thumb" src={url} alt="" />
  return (
    <span className="att__thumb att__thumb--icon" aria-hidden>
      <FileText strokeWidth={1.5} />
    </span>
  )
}

// ---------------------------------------------------------------------------

interface AttachmentsFieldProps {
  reservationId: string | null // null = reserva nova (ainda sem anexos salvos)
  existing: ReservationAttachment[]
  removedIds: string[]
  pending: PendingAttachment[]
  disabled?: boolean
  onAdd: (items: PendingAttachment[]) => void
  onChangePending: (key: number, category: AttachmentCategory) => void
  onRemovePending: (key: number) => void
  onToggleRemoved: (id: string) => void
}

export function AttachmentsField({
  reservationId,
  existing,
  removedIds,
  pending,
  disabled,
  onAdd,
  onChangePending,
  onRemovePending,
  onToggleRemoved,
}: AttachmentsFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState<AttachmentCategory>('CHECKIN')
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return
    setProcessing(true)
    const added: PendingAttachment[] = []
    const failed: string[] = []
    for (const file of Array.from(list)) {
      try {
        added.push({ key: nextKey++, file: await prepareDocumentFile(file), category })
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : 'arquivo inválido'}`)
      }
    }
    if (added.length) onAdd(added)
    setErrors(failed)
    setProcessing(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (!disabled) handleFiles(e.dataTransfer.files)
  }

  const total = existing.length - removedIds.length + pending.length

  return (
    <div className="att">
      <div className="att__toolbar">
        <span className="ui-field__label">Categoria dos próximos arquivos</span>
        <Segmented
          ariaLabel="Categoria dos próximos arquivos"
          value={category}
          onChange={setCategory}
          disabled={disabled}
          options={ATTACHMENT_OPTIONS}
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_FILE_ACCEPT}
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />
      <button
        type="button"
        className={`doc-photo__drop att__drop ${dragging ? 'is-dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={disabled || processing}
      >
        {processing ? <span className="spinner spinner--lg" /> : <Paperclip strokeWidth={1.5} />}
        <strong>
          {processing ? 'Processando arquivos…' : `Adicionar arquivos de ${ATTACHMENT_LABEL[category].toLowerCase()}`}
        </strong>
        <span>Clique ou arraste · JPG, PNG, WEBP ou PDF · até 5 MB cada · vários de uma vez</span>
      </button>

      {errors.map((e) => (
        <p key={e} className="ui-field__error">
          {e}
        </p>
      ))}

      {(existing.length > 0 || pending.length > 0) && (
        <ul className="att__list">
          {existing.map((a) => {
            const removed = removedIds.includes(a.id)
            return (
              <li key={a.id} className={`att__item ${removed ? 'is-removed' : ''}`}>
                {reservationId && <AttachmentThumb reservationId={reservationId} attachment={a} />}
                <div className="att__info">
                  <strong title={a.fileName}>{a.fileName}</strong>
                  <small>
                    {ATTACHMENT_LABEL[a.category]} · {formatFileSize(a.sizeBytes)}
                    {removed && ' · será removido ao salvar'}
                  </small>
                </div>
                {!removed && reservationId && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => openAttachment(reservationId, a)}
                    title="Abrir"
                    aria-label={`Abrir ${a.fileName}`}
                  >
                    <ExternalLink strokeWidth={1.8} />
                  </button>
                )}
                <button
                  type="button"
                  className={`icon-btn ${removed ? '' : 'att__remove'}`}
                  onClick={() => onToggleRemoved(a.id)}
                  disabled={disabled}
                  title={removed ? 'Desfazer' : 'Remover'}
                  aria-label={`${removed ? 'Manter' : 'Remover'} ${a.fileName}`}
                >
                  {removed ? <Undo2 strokeWidth={1.8} /> : <Trash2 strokeWidth={1.8} />}
                </button>
              </li>
            )
          })}

          {pending.map((p) => (
            <li key={p.key} className="att__item att__item--new">
              <PendingThumb file={p.file} />
              <div className="att__info">
                <strong title={p.file.name}>{p.file.name}</strong>
                <small>Novo · {formatFileSize(p.file.size)} · enviado ao salvar</small>
              </div>
              <select
                className="ui-input ui-select att__category"
                value={p.category}
                onChange={(e) => onChangePending(p.key, e.target.value as AttachmentCategory)}
                disabled={disabled}
                aria-label={`Categoria de ${p.file.name}`}
              >
                {ATTACHMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-btn att__remove"
                onClick={() => onRemovePending(p.key)}
                disabled={disabled}
                title="Remover"
                aria-label={`Remover ${p.file.name}`}
              >
                <Trash2 strokeWidth={1.8} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <p className="ui-field__hint">
          {total} {total === 1 ? 'arquivo' : 'arquivos'}
        </p>
      )}
    </div>
  )
}
