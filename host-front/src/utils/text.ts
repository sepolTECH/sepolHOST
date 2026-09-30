import type { PersonType } from '../services/api'

// Mesmas regras do back (host-back/src/utils/text.ts)

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Máscara do nome enquanto digita: MAIÚSCULAS, sem acentos e sem caracteres especiais.
 * Pessoa física: só letras e espaços. Pessoa jurídica também aceita números e & . / -
 * (não corta o espaço do fim, senão não dá para digitar o sobrenome).
 */
export function maskName(value: string, personType: PersonType = 'PF') {
  const allowed = personType === 'PJ' ? /[^A-Z0-9 &./-]/g : /[^A-Z ]/g
  return stripAccents(value).toUpperCase().replace(allowed, '').replace(/\s+/g, ' ').trimStart()
}

/** Nome pronto para salvar (sem espaços sobrando nas pontas). */
export const cleanName = (value: string, personType: PersonType = 'PF') => maskName(value, personType).trim()

/** Máscara do e-mail: minúsculas e só letras, números, "@", ".", "-" e "_" (um único "@"). */
export function maskEmail(value: string) {
  const clean = stripAccents(value).toLowerCase().replace(/[^a-z0-9@._-]/g, '')
  const at = clean.indexOf('@')
  return at < 0 ? clean : clean.slice(0, at + 1) + clean.slice(at + 1).replace(/@/g, '')
}
