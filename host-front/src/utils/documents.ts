import type { DocumentType, PersonType } from '../services/api'

// Mesmas regras do back (host-back/src/utils/documents.ts)

export const onlyDigits = (v: string) => v.replace(/\D/g, '')
const alnum = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, '')

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  CPF: 'CPF',
  PASSAPORTE: 'Passaporte',
  DNI: 'DNI',
  CNPJ: 'CNPJ',
}

export const PERSON_LABEL: Record<PersonType, string> = {
  PF: 'Pessoa física',
  PJ: 'Pessoa jurídica',
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
}

/** Aceita CNPJ numérico e alfanumérico (novo formato a partir de 07/2026). */
export function isValidCnpj(value: string) {
  const cnpj = alnum(value)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const val = (c: string) => c.charCodeAt(0) - 48
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += val(cnpj[i]) * weights[i]
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13])
}

/** Aplica uma máscara onde "#" é um caractere da entrada. */
function applyMask(chars: string, mask: string) {
  let out = ''
  let i = 0
  for (const m of mask) {
    if (i >= chars.length) break
    if (m === '#') out += chars[i++]
    else out += m
  }
  return out
}

/** Máscara do número do documento enquanto o usuário digita. */
export function maskDocument(type: DocumentType, value: string) {
  if (type === 'CPF') return applyMask(onlyDigits(value).slice(0, 11), '###.###.###-##')
  if (type === 'CNPJ') {
    const raw = alnum(value).slice(0, 14)
    // os 2 últimos (dígitos verificadores) são sempre números
    const safe = raw.length > 12 ? raw.slice(0, 12) + onlyDigits(raw.slice(12)) : raw
    return applyMask(safe, '##.###.###/####-##')
  }
  return alnum(value).slice(0, 20)
}

export const formatDocument = maskDocument

/**
 * Telefone: formato brasileiro por padrão — (11) 91234-5678.
 * Começando com "+", aceita número internacional (+351912345678).
 */
export function maskPhone(value: string) {
  const trimmed = value.trimStart()
  if (trimmed.startsWith('+')) {
    // DDI + número, só dígitos (os formatos variam demais por país para mascarar)
    return '+' + onlyDigits(trimmed).slice(0, 15)
  }
  const d = onlyDigits(trimmed).slice(0, 11)
  if (d.length <= 10) return applyMask(d, '(##) ####-####')
  return applyMask(d, '(##) #####-####')
}

export const formatPhone = maskPhone

export function validateDocument(type: DocumentType, value: string) {
  if (!value.trim()) return 'Informe o número de identificação'
  if (type === 'CPF' && !isValidCpf(value)) return 'CPF inválido'
  if (type === 'CNPJ' && !isValidCnpj(value)) return 'CNPJ inválido'
  if ((type === 'PASSAPORTE' || type === 'DNI') && !/^[0-9A-Z]{5,20}$/.test(alnum(value)))
    return `${DOCUMENT_LABEL[type]} deve ter de 5 a 20 letras/números`
  return ''
}

/** RG: cada estado usa um formato, então só limpamos (letras/números, até 14). */
export const maskRg = (value: string) => alnum(value).slice(0, 14)

export function validateRg(value: string) {
  if (!value.trim()) return '' // opcional
  return /^[0-9A-Z]{5,14}$/.test(alnum(value)) ? '' : 'RG deve ter de 5 a 14 letras/números'
}

export function validateEmail(value: string) {
  if (!value.trim()) return '' // opcional
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) ? '' : 'E-mail inválido'
}

/** CEP: 00000-000 */
export const maskCep = (value: string) => applyMask(onlyDigits(value).slice(0, 8), '#####-###')

export const isBrazil = (country: string) => /^(brasil|brazil)$/i.test(country.trim())

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

/** Sugestões para o campo país do endereço (aceita qualquer valor). */
export const COUNTRIES = [
  'Brasil',
  'Alemanha',
  'Argentina',
  'Bolívia',
  'Canadá',
  'Chile',
  'China',
  'Colômbia',
  'Espanha',
  'Estados Unidos',
  'França',
  'Itália',
  'Japão',
  'México',
  'Paraguai',
  'Peru',
  'Portugal',
  'Reino Unido',
  'Uruguai',
  'Venezuela',
]

/** Monta o endereço em uma linha para exibição. */
export function formatAddress(a: {
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressDistrict: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null
  addressCountry: string | null
}) {
  const br = !a.addressCountry || isBrazil(a.addressCountry)
  const street = [a.addressStreet, a.addressNumber].filter(Boolean).join(', ')
  const cityState = [a.addressCity, a.addressState].filter(Boolean).join(' / ')
  const zip = a.addressZip ? (br ? `CEP ${maskCep(a.addressZip)}` : a.addressZip) : ''
  return [street, a.addressComplement, a.addressDistrict, cityState, zip, br ? '' : a.addressCountry]
    .filter(Boolean)
    .join(' · ')
}

export function validatePhone(value: string) {
  if (!value.trim()) return 'Informe o telefone'
  const n = onlyDigits(value).length
  if (n < 10 || n > 15) return 'Telefone inválido (inclua o DDD)'
  return ''
}

/** Sugestões para o campo nacionalidade (o campo aceita qualquer valor). */
export const NATIONALITIES = [
  'Brasileira',
  'Alemã',
  'Americana',
  'Argentina',
  'Australiana',
  'Belga',
  'Boliviana',
  'Britânica',
  'Canadense',
  'Chilena',
  'Chinesa',
  'Colombiana',
  'Coreana',
  'Equatoriana',
  'Espanhola',
  'Francesa',
  'Holandesa',
  'Indiana',
  'Israelense',
  'Italiana',
  'Japonesa',
  'Mexicana',
  'Paraguaia',
  'Peruana',
  'Portuguesa',
  'Russa',
  'Suíça',
  'Uruguaia',
  'Venezuelana',
]

/** Iniciais para o avatar: primeiro e último nome. */
export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}
