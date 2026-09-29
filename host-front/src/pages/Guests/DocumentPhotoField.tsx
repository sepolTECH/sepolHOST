import { FileText, ImageUp, RefreshCw, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { DOCUMENT_FILE_ACCEPT, prepareDocumentFile } from '../../utils/image'

interface DocumentPhotoFieldProps {
  /** Arquivo novo escolhido (ainda não enviado). */
  file: File | null
  /** Foto já salva no servidor. */
  existing: { url: string | null; mime: string | null; loading: boolean; error: string } | null
  /** Usuário pediu para remover a foto salva. */
  removed: boolean
  disabled?: boolean
  onPick: (file: File) => void
  onClear: () => void
  onUndoRemove: () => void
}

export function DocumentPhotoField({
  file,
  existing,
  removed,
  disabled,
  onPick,
  onClear,
  onUndoRemove,
}: DocumentPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => (fileUrl ? URL.revokeObjectURL(fileUrl) : undefined), [fileUrl])

  async function handleFile(picked: File | undefined) {
    if (!picked) return
    setError('')
    setProcessing(true)
    try {
      onPick(await prepareDocumentFile(picked))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arquivo inválido')
    } finally {
      setProcessing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (!disabled) handleFile(e.dataTransfer.files[0])
  }

  const showExisting = !file && existing && !removed
  const url = file ? fileUrl : showExisting ? existing.url : null
  const mime = file ? file.type : showExisting ? existing.mime : null
  const isPdf = mime === 'application/pdf'
  const hasPreview = !!file || !!showExisting

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept={DOCUMENT_FILE_ACCEPT}
      hidden
      onChange={(e) => handleFile(e.target.files?.[0])}
      disabled={disabled}
    />
  )

  if (hasPreview) {
    return (
      <div className="doc-photo">
        {picker}
        <div className="doc-photo__preview">
          {showExisting && existing.loading ? (
            <span className="spinner spinner--lg" aria-label="Carregando foto" />
          ) : showExisting && existing.error ? (
            <p className="ui-field__error">{existing.error}</p>
          ) : isPdf ? (
            <a className="doc-photo__pdf" href={url ?? undefined} target="_blank" rel="noreferrer">
              <FileText strokeWidth={1.5} />
              <span>{file ? file.name : 'Documento em PDF'}</span>
              <small>Clique para abrir</small>
            </a>
          ) : (
            url && (
              <a href={url} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
                <img src={url} alt="Foto do documento" />
              </a>
            )
          )}
        </div>
        <div className="doc-photo__actions">
          {file && <span className="doc-photo__badge">Nova — será enviada ao salvar</span>}
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || processing}
          >
            {processing ? <span className="spinner spinner--dark" /> : <RefreshCw strokeWidth={1.8} />}
            Trocar
          </button>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onClear} disabled={disabled}>
            <Trash2 strokeWidth={1.8} />
            Remover
          </button>
        </div>
        {error && <p className="ui-field__error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="doc-photo">
      {picker}
      <button
        type="button"
        className={`doc-photo__drop ${dragging ? 'is-dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={disabled || processing}
      >
        {processing ? <span className="spinner spinner--lg" /> : <ImageUp strokeWidth={1.5} />}
        <strong>{processing ? 'Processando imagem…' : 'Clique para enviar ou arraste o arquivo'}</strong>
        <span>JPG, PNG, WEBP ou PDF · até 5 MB · fotos grandes são reduzidas automaticamente</span>
      </button>
      {removed && existing && (
        <p className="ui-field__hint doc-photo__removed">
          A foto atual será removida ao salvar.
          <button type="button" onClick={onUndoRemove}>
            <Undo2 aria-hidden />
            Desfazer
          </button>
        </p>
      )}
      {error && <p className="ui-field__error">{error}</p>}
    </div>
  )
}
