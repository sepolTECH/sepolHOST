/** Validação de documentos brasileiros (dígitos verificadores). */

export const DOCUMENT_TYPES = ['CPF', 'PASSAPORTE', 'DNI', 'CNPJ'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const onlyDigits = (v: string) => v.replace(/\D/g, '');
/** Só letras e números, em maiúsculas. */
export const alnum = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, '');

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

/** Normaliza CNPJ: remove máscara e deixa letras em maiúsculas (CNPJ alfanumérico, a partir de 07/2026). */
export const normalizeCnpj = alnum;

/**
 * Aceita o CNPJ numérico e o novo CNPJ alfanumérico (12 primeiros caracteres
 * podem ser letras; os 2 dígitos verificadores continuam numéricos).
 * Cada caractere vale (código ASCII − 48).
 */
export function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const val = (c: string) => c.charCodeAt(0) - 48;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += val(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** Passaporte e DNI: formatos variam por país — 5 a 20 letras/números. */
export const normalizePassport = alnum;
export const isValidForeignDocument = (v: string) => /^[0-9A-Z]{5,20}$/.test(alnum(v));

/** RG: cada estado tem um formato; guardamos só letras/números (ex.: 12345678X). */
export const normalizeRg = alnum;
export const isValidRg = (v: string) => /^[0-9A-Z]{5,14}$/.test(alnum(v));

/** Telefone: mantém só dígitos, preservando "+" inicial (DDI). */
export function normalizePhone(v: string) {
  const trimmed = v.trim();
  return (trimmed.startsWith('+') ? '+' : '') + onlyDigits(trimmed);
}

/** Deixa o número no mesmo formato em que é gravado no banco (sem máscara). */
export function normalizeDocument(type: DocumentType, value: string) {
  if (type === 'CPF') return onlyDigits(value);
  return alnum(value);
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const isBrazil = (country: string) => /^(brasil|brazil)$/i.test(country.trim());
