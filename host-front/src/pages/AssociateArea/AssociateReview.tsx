import { ChevronLeft, Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StarRating } from '../../components/ui/StarRating'
import { ApiError, associateAreaApi, type AssociateReviewData, type AssociateReviewInput } from '../../services/api'
import { formatDateShort } from '../../utils/money'

type RatingField = 'cleanlinessRating' | 'communicationRating' | 'rulesRating'

// Textos pensados para quem faz a limpeza/vistoria
const CATEGORIES: { field: RatingField; label: string; hint: string }[] = [
  { field: 'cleanlinessRating', label: 'Limpeza', hint: 'Como o imóvel foi deixado na saída' },
  { field: 'communicationRating', label: 'Comunicação', hint: 'Educação e clareza do hóspede' },
  { field: 'rulesRating', label: 'Regras da casa', hint: 'Horários, barulho, número de pessoas, danos…' },
]

const NOTES_MAX = 2000

/** Avaliação simples da hospedagem: 3 notas em estrelas grandes + observação. */
export function AssociateReview() {
  const { id = '' } = useParams()
  const [data, setData] = useState<AssociateReviewData | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    associateAreaApi
      .review(id)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Não foi possível abrir a avaliação')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const back = (
    <Link to="/associado" className="ap-back">
      <ChevronLeft aria-hidden />
      Voltar
    </Link>
  )

  if (!data) {
    return (
      <>
        {back}
        {loadError ? <p className="ap-error">{loadError}</p> : <p className="ap-state">Carregando…</p>}
      </>
    )
  }

  return (
    <>
      {back}
      <ReviewForm id={id} data={data} />
    </>
  )
}

function ReviewForm({ id, data }: { id: string; data: AssociateReviewData }) {
  const navigate = useNavigate()
  const { reservation: r, review } = data
  const [values, setValues] = useState<AssociateReviewInput>({
    cleanlinessRating: review?.cleanlinessRating ?? 0,
    communicationRating: review?.communicationRating ?? 0,
    rulesRating: review?.rulesRating ?? 0,
    notes: review?.notes ?? '',
  })
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (CATEGORIES.some((c) => !values[c.field])) {
      setMissing(true)
      setError('Dê uma nota de 1 a 5 estrelas em todos os itens.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await associateAreaApi.saveReview(id, values)
      navigate('/associado', { replace: true, state: { notice: 'Avaliação salva!' } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="ap-title">{r.propertyName}</h1>
      <p className="ap-sub">
        Hóspede: {r.guestName} · saída {formatDateShort(r.finalCheckOut)}
      </p>

      {CATEGORIES.map((c) => (
        <fieldset key={c.field} className="ap-rate">
          <legend>{c.label}</legend>
          <p className="ap-rate__hint">{c.hint}</p>
          <StarRating
            size="lg"
            ariaLabel={`Nota de ${c.label}`}
            value={values[c.field]}
            invalid={missing && !values[c.field]}
            disabled={saving}
            onChange={(v) => setValues((prev) => ({ ...prev, [c.field]: v }))}
          />
        </fieldset>
      ))}

      <label className="ap-label" htmlFor="ap-notes">
        Observações (opcional)
      </label>
      <textarea
        id="ap-notes"
        className="ap-textarea"
        value={values.notes}
        maxLength={NOTES_MAX}
        placeholder="Ex.: encontrei manchas no sofá, faltou uma toalha…"
        disabled={saving}
        onChange={(e) => setValues((prev) => ({ ...prev, notes: e.target.value }))}
      />

      {error && <p className="ap-error">{error}</p>}

      <div className="ap-footer">
        <div className="ap-footer__inner">
          <button type="submit" className="ap-btn ap-btn--primary" disabled={saving}>
            <Save aria-hidden />
            {saving ? 'Salvando…' : 'Salvar avaliação'}
          </button>
        </div>
      </div>
    </form>
  )
}
