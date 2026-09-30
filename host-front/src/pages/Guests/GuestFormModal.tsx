import { AlertTriangle, CalendarPlus, Check, CircleCheck, Lock, Pencil, RotateCcw, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DependentNotice } from '../../components/ui/DependentNotice'
import { Modal } from '../../components/ui/Modal'
import { Segmented } from '../../components/ui/Segmented'
import {
  ApiError,
  guestsApi,
  type DocumentType,
  type DuplicateField,
  type DuplicateMatch,
  type Guest,
  type GuestInput,
  type PersonType,
} from '../../services/api'
import { lookupCep } from '../../utils/cep'
import {
  COUNTRIES,
  describeDocument,
  DOCUMENT_LABEL,
  formatPhone,
  isBrazil,
  maskCep,
  maskDocument,
  maskPhone,
  maskRg,
  NATIONALITIES,
  onlyDigits,
  UFS,
  validateDocument,
  validateEmail,
  validatePhone,
  validateRg,
} from '../../utils/documents'
import { cleanName, maskEmail, maskName } from '../../utils/text'
import { DocumentPhotoField } from './DocumentPhotoField'
import { useDocumentPhoto } from './useDocumentPhoto'

type Errors = Partial<Record<keyof GuestInput, string>>

/** Resultado da consulta do documento no cadastro (só no novo cadastro). */
type Lookup =
  | { key: string; status: 'available' }
  | { key: string; status: 'exists'; guest: Guest }
  | { key: string; status: 'error'; message: string }

type CepStatus = 'idle' | 'loading' | 'notfound' | 'error'

const NOTES_MAX = 2000

const EMPTY: GuestInput = {
  fullName: '',
  noDocument: false,
  personType: 'PF',
  isForeign: false,
  nationality: 'Brasileira',
  documentType: 'CPF',
  documentNumber: '',
  rg: '',
  email: '',
  phone: '',
  addressZip: '',
  addressStreet: '',
  addressNumber: '',
  addressComplement: '',
  addressDistrict: '',
  addressCity: '',
  addressState: '',
  addressCountry: 'Brasil',
  notes: '',
}

/** Campos da etapa de identificação (não contam como "dados preenchidos" ao fechar). */
const ID_FIELDS: (keyof GuestInput)[] = [
  'personType',
  'isForeign',
  'noDocument',
  'documentType',
  'documentNumber',
  'nationality',
]

const DUP_FIELD_LABEL: Record<DuplicateField, string> = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'E-mail',
}

const FOREIGN_NATIONALITIES = NATIONALITIES.filter((n) => n !== 'Brasileira')
const normalizeDoc = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, '')
const isBrAddress = (country: string) => !country.trim() || isBrazil(country)
const isForeignDoc = (t: DocumentType) => t === 'PASSAPORTE' || t === 'DNI'

/** CPF e CNPJ têm tamanho fixo: dá para saber quando o usuário terminou de digitar. */
function isComplete(type: DocumentType, value: string) {
  if (type === 'CPF') return onlyDigits(value).length === 11
  if (type === 'CNPJ') return normalizeDoc(value).length === 14
  return normalizeDoc(value).length >= 5
}

function fromGuest(g: Guest): GuestInput {
  const country = g.addressCountry ?? 'Brasil'
  // Hóspede cadastrado sem documento: o tipo volta ao padrão do perfil (CPF, passaporte ou CNPJ)
  const documentType: DocumentType = g.documentType ?? (g.personType === 'PJ' ? 'CNPJ' : g.isForeign ? 'PASSAPORTE' : 'CPF')
  return {
    fullName: g.fullName,
    noDocument: !g.documentNumber,
    personType: g.personType,
    isForeign: g.isForeign,
    nationality: g.nationality,
    documentType,
    documentNumber: g.documentNumber ? maskDocument(documentType, g.documentNumber) : '',
    rg: g.rg ?? '',
    email: g.email ?? '',
    phone: maskPhone(g.phone),
    addressZip: g.addressZip ? (isBrAddress(country) ? maskCep(g.addressZip) : g.addressZip) : '',
    addressStreet: g.addressStreet ?? '',
    addressNumber: g.addressNumber ?? '',
    addressComplement: g.addressComplement ?? '',
    addressDistrict: g.addressDistrict ?? '',
    addressCity: g.addressCity ?? '',
    addressState: g.addressState ?? '',
    addressCountry: country,
    notes: g.notes ?? '',
  }
}

function validate(v: GuestInput): Errors {
  const e: Errors = {}
  const add = (key: keyof GuestInput, msg: string) => {
    if (msg) e[key] = msg
  }
  if (!v.noDocument) add('documentNumber', validateDocument(v.documentType, v.documentNumber))
  if (cleanName(v.fullName, v.personType).length < 3) e.fullName = 'Informe o nome completo'
  if (v.isForeign && v.nationality.trim().length < 2) e.nationality = 'Informe a nacionalidade'
  if (v.personType === 'PF' && !v.isForeign) add('rg', validateRg(v.rg))
  add('email', validateEmail(v.email))
  add('phone', validatePhone(v.phone))
  if (isBrAddress(v.addressCountry)) {
    if (v.addressZip && onlyDigits(v.addressZip).length !== 8) e.addressZip = 'CEP inválido'
    if (v.addressState && !UFS.includes(v.addressState.toUpperCase())) e.addressState = 'UF inválida'
  }
  return e
}

interface GuestFormModalProps {
  open: boolean
  guest: Guest | null // null = novo cadastro
  onClose: () => void
  /** warning: dados salvos, mas algo secundário falhou (ex.: envio da foto). */
  onSaved: (guest: Guest, isNew: boolean, warning?: string, options?: { thenReserve?: boolean }) => void
  /** Abre a edição de um hóspede que já existe (quando o documento já está cadastrado). */
  onEditExisting?: (guest: Guest) => void
  /** Esconde o atalho "criar reserva" (quando o cadastro é aberto de dentro de uma reserva). */
  hideReserveAction?: boolean
}

export function GuestFormModal({ open, guest, onClose, onSaved, onEditExisting, hideReserveAction }: GuestFormModalProps) {
  const isEdit = !!guest
  // O pai troca a "key" a cada abertura, então o estado sempre começa limpo
  const [values, setValues] = useState<GuestInput>(() => (guest ? fromGuest(guest) : EMPTY))
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Foto do documento: nova escolhida (enviada após salvar) e/ou pedido de remoção da atual
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoRemoved, setPhotoRemoved] = useState(false)
  const existingPhoto = useDocumentPhoto(isEdit ? guest : null)

  const docInputRef = useRef<HTMLInputElement>(null)
  const fullNameRef = useRef<HTMLInputElement>(null)

  // ---------------------------------------------------------------------------
  // Consulta do documento: no novo cadastro, os demais campos só são liberados
  // depois de confirmar que não existe hóspede com este documento.
  // ---------------------------------------------------------------------------
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [retry, setRetry] = useState(0)

  const docError = validateDocument(values.documentType, values.documentNumber)
  const docComplete = isComplete(values.documentType, values.documentNumber)
  const docKey = `${values.documentType}|${normalizeDoc(values.documentNumber)}|${retry}`
  // "Cadastrar sem CPF": o documento não é consultado e os demais campos ficam liberados
  const noDoc = values.noDocument && values.personType === 'PF'
  const canLookup = !isEdit && !noDoc && !docError

  // "checking" = documento válido, mas a última resposta ainda não é deste documento
  const lookupStatus: 'idle' | 'invalid' | 'checking' | Lookup['status'] = isEdit || noDoc
    ? 'available'
    : docError
      ? docComplete
        ? 'invalid'
        : 'idle'
      : lookup?.key === docKey
        ? lookup.status
        : 'checking'

  const locked = lookupStatus !== 'available'
  const existing = lookup?.key === docKey && lookup.status === 'exists' ? lookup.guest : null

  useEffect(() => {
    if (!canLookup) return
    const controller = new AbortController()
    // CPF/CNPJ completos consultam logo; passaporte/DNI esperam o usuário parar de digitar
    const delay = isForeignDoc(values.documentType) ? 600 : 250
    const t = window.setTimeout(() => {
      guestsApi
        .checkDocument(values.documentType, values.documentNumber, controller.signal)
        .then(({ exists, guest: found }) => {
          setLookup(
            exists && found ? { key: docKey, status: 'exists', guest: found } : { key: docKey, status: 'available' },
          )
        })
        .catch((err) => {
          if (controller.signal.aborted) return
          setLookup({
            key: docKey,
            status: 'error',
            message: err instanceof ApiError ? err.message : 'Não foi possível consultar o documento',
          })
        })
    }, delay)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
    // docKey já reflete tipo + número + nova tentativa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLookup, docKey])

  // Ao liberar (CPF/CNPJ, ou "sem documento"), leva o foco para o nome.
  // Em passaporte/DNI o usuário pode ainda estar digitando o número.
  useEffect(() => {
    if (!isEdit && lookupStatus === 'available' && (noDoc || !isForeignDoc(values.documentType))) {
      fullNameRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupStatus])

  // ---------------------------------------------------------------------------
  // Possíveis duplicados: nome (inclusive abreviado), telefone e e-mail.
  // Como o documento pode faltar, esses 3 dados é que evitam cadastrar a mesma pessoa duas vezes.
  // ---------------------------------------------------------------------------
  const [dups, setDups] = useState<{ key: string; matches: DuplicateMatch[] } | null>(null)
  const [confirmedIds, setConfirmedIds] = useState('')
  const dupName = cleanName(values.fullName, values.personType)
  const dupNameTokens = dupName.split(' ').filter(Boolean)
  const dupKey = `${values.personType}|${dupName}|${onlyDigits(values.phone)}|${values.email.trim()}`

  useEffect(() => {
    if (locked) return
    const nameOk = dupNameTokens.length >= 2 && dupNameTokens[0].length >= 3
    const phoneOk = onlyDigits(values.phone).length >= 10
    const emailOk = !validateEmail(values.email) && !!values.email.trim()
    if (!nameOk && !phoneOk && !emailOk) return
    const controller = new AbortController()
    const t = window.setTimeout(() => {
      guestsApi
        .checkDuplicates(
          {
            fullName: dupName,
            personType: values.personType,
            phone: values.phone,
            email: values.email.trim(),
            excludeId: guest?.id,
          },
          controller.signal,
        )
        .then(({ matches }) => setDups({ key: dupKey, matches }))
        .catch(() => {}) // informativo: se a consulta falhar, o cadastro segue normalmente
    }, 400)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
    // dupKey já reflete nome + tipo + telefone + e-mail
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupKey, locked])

  const matches = dups?.key === dupKey ? dups.matches : []
  const matchIds = matches.map((m) => m.guest.id).join(',')
  /** Nome idêntico, e-mail igual ou 2+ dados batendo: muito provavelmente é a mesma pessoa. */
  const strongDuplicate = matches.some((m) => m.exactName || m.matchedOn.length >= 2 || m.matchedOn.includes('email'))
  const needsConfirm = !isEdit && strongDuplicate && confirmedIds !== matchIds

  // ---------------------------------------------------------------------------
  // CEP (ViaCEP)
  // ---------------------------------------------------------------------------
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle')
  const cepAbort = useRef<AbortController | null>(null)
  useEffect(() => () => cepAbort.current?.abort(), [])
  const brAddress = isBrAddress(values.addressCountry)

  function changeZip(value: string) {
    const masked = brAddress ? maskCep(value) : value.toUpperCase().slice(0, 12)
    set('addressZip', masked)
    cepAbort.current?.abort()
    setCepStatus('idle')
    if (!brAddress || onlyDigits(masked).length !== 8) return

    const controller = new AbortController()
    cepAbort.current = controller
    setCepStatus('loading')
    lookupCep(masked, controller.signal)
      .then((found) => {
        if (!found) return setCepStatus('notfound')
        setCepStatus('idle')
        setValues((v) => ({
          ...v,
          addressStreet: found.street || v.addressStreet,
          addressDistrict: found.district || v.addressDistrict,
          addressCity: found.city || v.addressCity,
          addressState: found.state || v.addressState,
        }))
        setErrors((e) => ({ ...e, addressStreet: undefined, addressCity: undefined, addressState: undefined }))
        // CEP de rua: próximo passo é o número; CEP geral da cidade: falta a rua
        requestAnimationFrame(() =>
          document.getElementById(found.street ? 'guest-addressNumber' : 'guest-addressStreet')?.focus(),
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) setCepStatus('error')
      })
  }

  function changeCountry(country: string) {
    setValues((v) => {
      // Ao trocar entre Brasil e exterior, CEP e UF mudam de formato
      if (isBrAddress(v.addressCountry) === isBrAddress(country)) return { ...v, addressCountry: country }
      return { ...v, addressCountry: country, addressZip: '', addressState: '' }
    })
    setErrors((e) => ({ ...e, addressZip: undefined, addressState: undefined }))
    setCepStatus('idle')
    setDirty(true)
  }

  // ---------------------------------------------------------------------------

  function set<K extends keyof GuestInput>(key: K, value: GuestInput[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
    setDirty(true)
  }

  function changePersonType(type: PersonType) {
    setValues((v) => {
      const documentType: DocumentType = type === 'PJ' ? 'CNPJ' : 'CPF'
      return {
        ...v,
        personType: type,
        isForeign: false,
        // CNPJ é obrigatório: só pessoa física pode ficar sem documento
        noDocument: type === 'PJ' ? false : v.noDocument,
        nationality: 'Brasileira',
        documentType,
        documentNumber: documentType === v.documentType ? v.documentNumber : '',
        // nome de PJ aceita números e & . / -; ao voltar para PF, limpa o que não vale mais
        fullName: maskName(v.fullName, type),
      }
    })
    setErrors((e) => ({ ...e, documentNumber: undefined, nationality: undefined }))
    setDirty(true)
  }

  function toggleForeign(isForeign: boolean) {
    setValues((v) => ({
      ...v,
      isForeign,
      documentType: isForeign ? 'PASSAPORTE' : 'CPF',
      documentNumber: '',
      nationality: isForeign ? '' : 'Brasileira',
      rg: isForeign ? '' : v.rg,
    }))
    setErrors((e) => ({ ...e, documentNumber: undefined, nationality: undefined, rg: undefined }))
    setDirty(true)
    requestAnimationFrame(() => docInputRef.current?.focus())
  }

  function toggleNoDocument(checked: boolean) {
    setValues((v) => ({ ...v, noDocument: checked, documentNumber: checked ? '' : v.documentNumber }))
    setErrors((e) => ({ ...e, documentNumber: undefined }))
    setDirty(true)
    // sem documento: já vai para o nome; com documento: volta para o número
    if (!checked) requestAnimationFrame(() => docInputRef.current?.focus())
  }

  function changeDocumentType(type: DocumentType) {
    setValues((v) => ({ ...v, documentType: type, documentNumber: maskDocument(type, v.documentNumber) }))
    setErrors((e) => ({ ...e, documentNumber: undefined }))
    setDirty(true)
  }

  function requestClose() {
    if (saving) return
    // No novo cadastro, só pergunta se já preencheu algo além da identificação
    const hasData = isEdit
      ? dirty || !!photoFile || photoRemoved
      : !!photoFile ||
        (values.isForeign && !!values.nationality.trim()) ||
        (Object.keys(EMPTY) as (keyof GuestInput)[]).some((k) => !ID_FIELDS.includes(k) && values[k] !== EMPTY[k])
    if (hasData && !window.confirm('Descartar as alterações não salvas?')) return
    onClose()
  }

  // "Salvar e criar reserva" usa o mesmo envio, só muda o que acontece depois de salvar
  const thenReserveRef = useRef(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const thenReserve = thenReserveRef.current
    thenReserveRef.current = false
    if (saving || locked) return

    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) {
      setFormError('')
      // leva o foco ao primeiro campo com erro
      const first = Object.keys(found)[0]
      document.getElementById(`guest-${first}`)?.focus()
      return
    }

    // Cadastro muito parecido com outro já existente: pede confirmação de que é outra pessoa
    if (needsConfirm) {
      setFormError('Confira os cadastros parecidos e confirme que é outra pessoa para continuar.')
      document.getElementById('guest-dup-confirm')?.focus()
      return
    }

    setSaving(true)
    setFormError('')
    let saved: Guest
    try {
      const payload: GuestInput = {
        ...values,
        noDocument: noDoc,
        fullName: cleanName(values.fullName, values.personType),
        nationality: values.nationality.trim(),
        email: maskEmail(values.email.trim()),
        notes: values.notes.trim(),
      }
      saved = (isEdit ? await guestsApi.update(guest.id, payload) : await guestsApi.create(payload)).guest
    } catch (err) {
      setSaving(false)
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Alguém cadastrou este documento enquanto o formulário estava aberto: consulta de novo
          if (!isEdit) {
            setRetry((r) => r + 1)
            return
          }
          return setErrors({ documentNumber: err.message })
        }
        const fieldErrors: Errors = {}
        err.errors.forEach((fe) => {
          if (fe.field in EMPTY) fieldErrors[fe.field as keyof GuestInput] ??= fe.message
        })
        if (Object.keys(fieldErrors).length) return setErrors(fieldErrors)
        return setFormError(err.message)
      }
      return setFormError('Não foi possível salvar. Tente novamente.')
    }

    // Dados salvos — agora a foto (etapa separada; se falhar, o cadastro continua salvo)
    let warning = ''
    try {
      if (photoFile) saved = (await guestsApi.uploadDocumentPhoto(saved.id, photoFile)).guest
      else if (photoRemoved && saved.hasDocumentPhoto) saved = (await guestsApi.removeDocumentPhoto(saved.id)).guest
    } catch (err) {
      warning = `Hóspede salvo, mas a foto do documento não foi ${photoFile ? 'enviada' : 'removida'}: ${
        err instanceof Error ? err.message : 'erro inesperado'
      }`
    }
    onSaved(saved, !isEdit, warning || undefined, thenReserve ? { thenReserve: true } : undefined)
  }

  const docPlaceholder = {
    CPF: '000.000.000-00',
    CNPJ: '00.000.000/0000-00',
    PASSAPORTE: 'Ex.: FX123456',
    DNI: 'Ex.: 30123456',
  }[values.documentType]

  const docLabel = DOCUMENT_LABEL[values.documentType]
  const docInvalid = !noDoc && (!!errors.documentNumber || lookupStatus === 'invalid' || lookupStatus === 'exists')
  const isPF = values.personType === 'PF'

  const field = (key: keyof GuestInput, extra = '') => `ui-field ${extra} ${errors[key] ? 'has-error' : ''}`
  const err = (key: keyof GuestInput) =>
    errors[key] ? (
      <p className="ui-field__error" id={`guest-${key}-error`}>
        {errors[key]}
      </p>
    ) : null
  const aria = (key: keyof GuestInput) => ({
    id: `guest-${key}`,
    'aria-invalid': !!errors[key] || undefined,
    'aria-describedby': errors[key] ? `guest-${key}-error` : undefined,
  })
  const optional = <span className="guest-form__optional">opcional</span>

  /** Linha de status abaixo do número do documento (só no novo cadastro). */
  function lookupHint() {
    if (noDoc) {
      return (
        <p className="ui-field__hint guest-lookup">
          <CircleCheck aria-hidden />
          Sem {docLabel}: o cadastro será conferido pelo nome, telefone e e-mail
        </p>
      )
    }
    if (isEdit || errors.documentNumber) return null
    switch (lookupStatus) {
      case 'idle':
        return (
          <p className="ui-field__hint guest-lookup">
            <Lock aria-hidden />
            {isPF
              ? `Informe o ${docLabel} para liberar os demais campos, ou marque que o hóspede não informou`
              : `Informe o ${docLabel} para liberar os demais campos`}
          </p>
        )
      case 'invalid':
        return (
          <p className="ui-field__error" id="guest-documentNumber-error">
            {docError}
          </p>
        )
      case 'checking':
        return (
          <p className="ui-field__hint guest-lookup">
            <span className="spinner guest-lookup__spinner" aria-hidden />
            Consultando cadastro…
          </p>
        )
      case 'available':
        return (
          <p className="ui-field__hint guest-lookup guest-lookup--ok">
            <CircleCheck aria-hidden />
            Nenhum cadastro encontrado — continue o preenchimento
          </p>
        )
      case 'error':
        return (
          <p className="ui-field__error guest-lookup">
            {lookup?.status === 'error' ? lookup.message : 'Erro ao consultar'}
            <button type="button" className="guest-lookup__retry" onClick={() => setRetry((r) => r + 1)}>
              <RotateCcw aria-hidden />
              Tentar novamente
            </button>
          </p>
        )
      default:
        return null // "exists" aparece no aviso abaixo do campo
    }
  }

  function cepHint() {
    if (errors.addressZip) return err('addressZip')
    if (!brAddress) return null
    if (cepStatus === 'loading')
      return (
        <p className="ui-field__hint guest-lookup">
          <span className="spinner guest-lookup__spinner" aria-hidden />
          Buscando endereço…
        </p>
      )
    if (cepStatus === 'notfound') return <p className="ui-field__hint">CEP não encontrado — preencha manualmente</p>
    if (cepStatus === 'error') return <p className="ui-field__hint">Não foi possível buscar o CEP — preencha manualmente</p>
    return <p className="ui-field__hint">O endereço é preenchido automaticamente</p>
  }

  const documentNumberInput = (
    <div className={`ui-field ${isPF && values.isForeign ? '' : 'ui-field--full'} ${docInvalid ? 'has-error' : ''}`}>
      <label htmlFor="guest-documentNumber">
        Número do {docLabel}
        {!noDoc && <span className="req">*</span>}
      </label>
      <input
        id="guest-documentNumber"
        ref={docInputRef}
        className="ui-input guest-form__mono"
        data-autofocus={!isEdit || undefined}
        autoComplete="off"
        inputMode={values.documentType === 'CPF' ? 'numeric' : 'text'}
        placeholder={noDoc ? 'Não informado' : docPlaceholder}
        value={values.documentNumber}
        onChange={(e) => set('documentNumber', maskDocument(values.documentType, e.target.value))}
        disabled={saving || noDoc}
        aria-invalid={docInvalid || undefined}
        aria-describedby={errors.documentNumber || lookupStatus === 'invalid' ? 'guest-documentNumber-error' : undefined}
      />
      {err('documentNumber')}
      <div aria-live="polite">{lookupHint()}</div>

      {/* LGPD: nem sempre o hóspede concorda em passar o documento. Só pessoa física. */}
      {isPF && (
        <label className="guest-nodoc">
          <input
            type="checkbox"
            checked={noDoc}
            onChange={(e) => toggleNoDocument(e.target.checked)}
            disabled={saving}
          />
          <span>
            Cadastrar sem {docLabel}
            <small>O hóspede não quis ou não pôde informar (LGPD). Nome, telefone e e-mail evitam cadastro duplicado.</small>
          </span>
        </label>
      )}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={isEdit ? 'Editar hóspede' : 'Novo hóspede'}
      subtitle={
        isEdit
          ? guest.fullName
          : locked
            ? isPF
              ? `Comece pelo ${docLabel} ou marque que o hóspede não informou`
              : `Comece pelo ${docLabel} do hóspede`
            : 'Preencha os dados do hóspede'
      }
      footer={
        <>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={requestClose} disabled={saving}>
            Cancelar
          </button>
          {!hideReserveAction && (
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              disabled={saving || locked}
              onClick={() => {
                thenReserveRef.current = true
                const form = document.getElementById('guest-form') as HTMLFormElement | null
                form?.requestSubmit()
              }}
            >
              <CalendarPlus strokeWidth={1.8} />
              {isEdit ? 'Salvar e criar reserva' : 'Cadastrar e criar reserva'}
            </button>
          )}
          <button type="submit" form="guest-form" className="ui-btn ui-btn--primary" disabled={saving || locked}>
            {saving ? <span className="spinner" /> : <Check strokeWidth={2.2} />}
            {isEdit ? 'Salvar alterações' : 'Cadastrar hóspede'}
          </button>
        </>
      }
    >
      <form id="guest-form" className="guest-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="guest-form__alert" role="alert">
            {formError}
          </div>
        )}

        {/* ---------- Identificação (sempre liberada) ---------- */}
        <section className="guest-form__section">
          <h3 className="guest-form__heading">Identificação</h3>
          <div className="guest-form__grid">
            <div className="ui-field">
              <span className="ui-field__label">
                Tipo de pessoa<span className="req">*</span>
              </span>
              <Segmented
                ariaLabel="Tipo de pessoa"
                value={values.personType}
                onChange={changePersonType}
                disabled={saving}
                options={[
                  { value: 'PF', label: 'Pessoa física' },
                  { value: 'PJ', label: 'Pessoa jurídica' },
                ]}
              />
            </div>

            {isPF && (
              <div className="ui-field">
                <span className="ui-field__label">Origem</span>
                <label className={`ui-switch ${values.isForeign ? 'is-on' : ''}`}>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={values.isForeign}
                    onChange={(e) => toggleForeign(e.target.checked)}
                    disabled={saving}
                  />
                  <span className="ui-switch__track" aria-hidden>
                    <span className="ui-switch__thumb" />
                  </span>
                  <span className="ui-switch__text">
                    Hóspede estrangeiro
                    <small>{values.isForeign ? 'Identificação por passaporte ou DNI' : 'Brasileiro — identificação por CPF'}</small>
                  </span>
                </label>
              </div>
            )}

            {isPF && values.isForeign && (
              <div className="ui-field">
                <span className="ui-field__label">
                  Tipo de documento<span className="req">*</span>
                </span>
                <Segmented
                  ariaLabel="Tipo de documento"
                  value={values.documentType}
                  onChange={changeDocumentType}
                  disabled={saving}
                  options={[
                    { value: 'PASSAPORTE', label: 'Passaporte' },
                    { value: 'DNI', label: 'DNI' },
                  ]}
                />
              </div>
            )}

            {documentNumberInput}
          </div>

          {existing && (
            <div className="guest-exists" role="alert">
              <span className="guest-exists__icon">
                <AlertTriangle strokeWidth={1.8} aria-hidden />
              </span>
              <div className="guest-exists__body">
                <strong>Hóspede já cadastrado</strong>
                <p>Já existe um cadastro com este {docLabel}. Para evitar duplicidade, atualize o cadastro existente.</p>
                <dl className="guest-exists__data">
                  <div>
                    <dt>Nome</dt>
                    <dd>{existing.fullName}</dd>
                  </div>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{formatPhone(existing.phone)}</dd>
                  </div>
                  {existing.email && (
                    <div>
                      <dt>E-mail</dt>
                      <dd>{existing.email}</dd>
                    </div>
                  )}
                </dl>
                {onEditExisting && (
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={() => onEditExisting(existing)}>
                    <Pencil strokeWidth={1.8} />
                    {hideReserveAction ? 'Usar este hóspede na reserva' : 'Abrir cadastro existente'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Documento livre, mas já cadastrado como dependente de alguém: só avisa */}
          {!isEdit && lookupStatus === 'available' && <DependentNotice document={values.documentNumber} />}
        </section>

        {/* ---------- Demais dados: bloqueados até a consulta liberar ---------- */}
        <fieldset className={`guest-form__rest ${locked ? 'is-locked' : ''}`} disabled={locked || saving}>
          <section className="guest-form__section">
            <h3 className="guest-form__heading">Dados pessoais</h3>
            <div className="guest-form__grid">
              <div className={field('fullName', 'ui-field--full')}>
                <label htmlFor="guest-fullName">
                  {isPF ? 'Nome completo' : 'Razão social'}
                  <span className="req">*</span>
                </label>
                <input
                  ref={fullNameRef}
                  className="ui-input"
                  data-autofocus={isEdit || undefined}
                  autoComplete="off"
                  placeholder={isPF ? 'NOME E SOBRENOME' : 'RAZÃO SOCIAL DA EMPRESA'}
                  value={values.fullName}
                  maxLength={160}
                  onChange={(e) => set('fullName', maskName(e.target.value, values.personType))}
                  {...aria('fullName')}
                />
                {err('fullName') ?? (
                  <p className="ui-field__hint">
                    {isPF ? 'Só letras, em maiúsculas e sem acentos' : 'Em maiúsculas e sem acentos ou símbolos'}
                  </p>
                )}
              </div>

              {isPF && values.isForeign && (
                <div className={field('nationality')}>
                  <label htmlFor="guest-nationality">
                    Nacionalidade<span className="req">*</span>
                  </label>
                  <input
                    className="ui-input"
                    list="guest-nationalities"
                    autoComplete="off"
                    placeholder="Ex.: Argentina"
                    value={values.nationality}
                    maxLength={80}
                    onChange={(e) => set('nationality', e.target.value)}
                    {...aria('nationality')}
                  />
                  <datalist id="guest-nationalities">
                    {FOREIGN_NATIONALITIES.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                  {err('nationality')}
                </div>
              )}

              {isPF && !values.isForeign && (
                <div className={field('rg')}>
                  <label htmlFor="guest-rg">RG {optional}</label>
                  <input
                    className="ui-input guest-form__mono"
                    autoComplete="off"
                    placeholder="Ex.: 12.345.678-9"
                    value={values.rg}
                    onChange={(e) => set('rg', maskRg(e.target.value))}
                    {...aria('rg')}
                  />
                  {err('rg') ?? <p className="ui-field__hint">Somente letras e números</p>}
                </div>
              )}

            </div>

            {/* Cadastros que podem ser a mesma pessoa (nome parecido/abreviado, telefone ou e-mail iguais) */}
            <div aria-live="polite">
              {matches.length > 0 && (
                <div className={`guest-dups ${strongDuplicate ? 'is-strong' : ''}`} role="status">
                  <div className="guest-dups__head">
                    <span className="guest-dups__icon">
                      <Users strokeWidth={1.8} aria-hidden />
                    </span>
                    <div>
                      <strong>
                        {matches.length === 1
                          ? 'Já existe um cadastro parecido'
                          : `Já existem ${matches.length} cadastros parecidos`}
                      </strong>
                      <p>Confira antes de continuar para não duplicar o hóspede (o nome pode estar abreviado).</p>
                    </div>
                  </div>

                  <ul className="guest-dups__list">
                    {matches.map(({ guest: g, matchedOn, exactName }) => (
                      <li key={g.id} className="guest-dups__item">
                        <div className="guest-dups__info">
                          <strong className={matchedOn.includes('name') ? 'is-match' : undefined}>{g.fullName}</strong>
                          <span className={matchedOn.includes('phone') ? 'is-match' : undefined}>
                            {formatPhone(g.phone)}
                          </span>
                          {g.email && <span className={matchedOn.includes('email') ? 'is-match' : undefined}>{g.email}</span>}
                          <small>{describeDocument(g.documentType, g.documentNumber)}</small>
                          <span className="guest-dups__badges">
                            {matchedOn.map((f) => (
                              <span key={f} className="guest-dups__badge">
                                {f === 'name' ? (exactName ? 'Mesmo nome' : 'Nome parecido') : `Mesmo ${DUP_FIELD_LABEL[f].toLowerCase()}`}
                              </span>
                            ))}
                          </span>
                        </div>
                        {onEditExisting && !isEdit && (
                          <button
                            type="button"
                            className="ui-btn ui-btn--ghost"
                            onClick={() => {
                              if (
                                window.confirm(
                                  hideReserveAction
                                    ? 'Usar este hóspede na reserva? O que você digitou aqui será descartado.'
                                    : 'Abrir o cadastro existente? O que você digitou aqui será descartado.',
                                )
                              ) {
                                onEditExisting(g)
                              }
                            }}
                          >
                            <Pencil strokeWidth={1.8} />
                            {hideReserveAction ? 'Usar na reserva' : 'Abrir cadastro'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>

                  {!isEdit && strongDuplicate && (
                    <label className="guest-dups__confirm">
                      <input
                        id="guest-dup-confirm"
                        type="checkbox"
                        checked={confirmedIds === matchIds}
                        onChange={(e) => setConfirmedIds(e.target.checked ? matchIds : '')}
                      />
                      <span>Confirmo que é outra pessoa, diferente dos cadastros acima</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="guest-form__section">
            <h3 className="guest-form__heading">Contato</h3>
            <div className="guest-form__grid">
              <div className={field('phone')}>
                <label htmlFor="guest-phone">
                  Telefone<span className="req">*</span>
                </label>
                <input
                  className="ui-input"
                  type="tel"
                  autoComplete="off"
                  inputMode="tel"
                  placeholder="(11) 91234-5678"
                  value={values.phone}
                  onChange={(e) => set('phone', maskPhone(e.target.value))}
                  {...aria('phone')}
                />
                {err('phone') ?? <p className="ui-field__hint">Para número estrangeiro, comece com + e o DDI</p>}
              </div>

              <div className={field('email')}>
                <label htmlFor="guest-email">E-mail {optional}</label>
                <input
                  className="ui-input"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  placeholder="nome@exemplo.com"
                  value={values.email}
                  maxLength={160}
                  onChange={(e) => set('email', maskEmail(e.target.value))}
                  {...aria('email')}
                />
                {err('email') ?? <p className="ui-field__hint">Minúsculas; só letras, números, @ . - _</p>}
              </div>

            </div>
          </section>

          <section className="guest-form__section">
            <h3 className="guest-form__heading">Endereço {optional}</h3>
            <div className="guest-form__grid guest-form__grid--6">
              <div className={field('addressCountry', 'span-3')}>
                <label htmlFor="guest-addressCountry">País</label>
                <input
                  className="ui-input"
                  list="guest-countries"
                  autoComplete="off"
                  placeholder="Ex.: Brasil"
                  value={values.addressCountry}
                  maxLength={80}
                  onChange={(e) => changeCountry(e.target.value)}
                  {...aria('addressCountry')}
                />
                <datalist id="guest-countries">
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className={field('addressZip', 'span-3')}>
                <label htmlFor="guest-addressZip">{brAddress ? 'CEP' : 'Código postal'}</label>
                <input
                  className="ui-input guest-form__mono"
                  autoComplete="off"
                  inputMode={brAddress ? 'numeric' : 'text'}
                  placeholder={brAddress ? '00000-000' : 'Ex.: C1000'}
                  value={values.addressZip}
                  onChange={(e) => changeZip(e.target.value)}
                  {...aria('addressZip')}
                />
                <div aria-live="polite">{cepHint()}</div>
              </div>

              <div className={field('addressStreet', brAddress ? 'span-4' : 'span-6')}>
                <label htmlFor="guest-addressStreet">{brAddress ? 'Logradouro' : 'Endereço'}</label>
                <input
                  className="ui-input"
                  autoComplete="off"
                  placeholder={brAddress ? 'Rua, avenida…' : 'Rua, número, complemento'}
                  value={values.addressStreet}
                  maxLength={160}
                  onChange={(e) => set('addressStreet', e.target.value)}
                  {...aria('addressStreet')}
                />
                {err('addressStreet')}
              </div>

              {brAddress && (
                <>
                  <div className={field('addressNumber', 'span-2')}>
                    <label htmlFor="guest-addressNumber">Número</label>
                    <input
                      className="ui-input"
                      autoComplete="off"
                      placeholder="Ex.: 123"
                      value={values.addressNumber}
                      maxLength={20}
                      onChange={(e) => set('addressNumber', e.target.value)}
                      {...aria('addressNumber')}
                    />
                  </div>
                  <div className={field('addressComplement', 'span-3')}>
                    <label htmlFor="guest-addressComplement">Complemento</label>
                    <input
                      className="ui-input"
                      autoComplete="off"
                      placeholder="Apto, bloco…"
                      value={values.addressComplement}
                      maxLength={80}
                      onChange={(e) => set('addressComplement', e.target.value)}
                      {...aria('addressComplement')}
                    />
                  </div>
                  <div className={field('addressDistrict', 'span-3')}>
                    <label htmlFor="guest-addressDistrict">Bairro</label>
                    <input
                      className="ui-input"
                      autoComplete="off"
                      value={values.addressDistrict}
                      maxLength={80}
                      onChange={(e) => set('addressDistrict', e.target.value)}
                      {...aria('addressDistrict')}
                    />
                  </div>
                </>
              )}

              <div className={field('addressCity', brAddress ? 'span-4' : 'span-3')}>
                <label htmlFor="guest-addressCity">Cidade</label>
                <input
                  className="ui-input"
                  autoComplete="off"
                  value={values.addressCity}
                  maxLength={80}
                  onChange={(e) => set('addressCity', e.target.value)}
                  {...aria('addressCity')}
                />
              </div>

              <div className={field('addressState', brAddress ? 'span-2' : 'span-3')}>
                <label htmlFor="guest-addressState">{brAddress ? 'UF' : 'Estado / Província'}</label>
                {brAddress ? (
                  <select
                    className="ui-input ui-select"
                    value={values.addressState}
                    onChange={(e) => set('addressState', e.target.value)}
                    {...aria('addressState')}
                  >
                    <option value="">—</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="ui-input"
                    autoComplete="off"
                    value={values.addressState}
                    maxLength={40}
                    onChange={(e) => set('addressState', e.target.value)}
                    {...aria('addressState')}
                  />
                )}
                {err('addressState')}
              </div>
            </div>
          </section>

          <section className="guest-form__section">
            <h3 className="guest-form__heading">Foto do documento {optional}</h3>
            <DocumentPhotoField
              file={photoFile}
              existing={isEdit && guest.hasDocumentPhoto ? { ...existingPhoto, mime: guest.documentPhotoMime } : null}
              removed={photoRemoved}
              disabled={locked || saving}
              onPick={(file) => {
                setPhotoFile(file)
                setDirty(true)
              }}
              onClear={() => {
                setPhotoFile(null)
                if (isEdit && guest.hasDocumentPhoto) setPhotoRemoved(true)
                setDirty(true)
              }}
              onUndoRemove={() => setPhotoRemoved(false)}
            />
          </section>

          <section className="guest-form__section">
            <h3 className="guest-form__heading">Observações internas {optional}</h3>
            <div className={field('notes')}>
              <textarea
                className="ui-input ui-textarea"
                rows={4}
                placeholder="Preferências, pedidos especiais, alertas para a equipe…"
                value={values.notes}
                maxLength={NOTES_MAX}
                onChange={(e) => set('notes', e.target.value)}
                aria-label="Observações internas"
                {...aria('notes')}
              />
              {err('notes') ?? (
                <p className="ui-field__hint guest-form__notes-hint">
                  <span>Visível apenas para a equipe</span>
                  <span>
                    {values.notes.length}/{NOTES_MAX}
                  </span>
                </p>
              )}
            </div>
          </section>
        </fieldset>
      </form>
    </Modal>
  )
}
