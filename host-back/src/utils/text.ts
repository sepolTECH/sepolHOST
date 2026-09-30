/** Normalização de nome e e-mail + comparação de nomes (para evitar cadastros duplicados). */

export type PersonKind = 'PF' | 'PJ';

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Nome: MAIÚSCULAS, sem acentos e sem caracteres especiais.
 * Pessoa física: só letras e espaços. Pessoa jurídica também aceita números e & . / -
 */
export function normalizeName(value: string, personType: PersonKind = 'PF') {
  const allowed = personType === 'PJ' ? /[^A-Z0-9 &./-]/g : /[^A-Z ]/g;
  return stripAccents(value).toUpperCase().replace(allowed, '').replace(/\s+/g, ' ').trim();
}

/** E-mail: minúsculas e só letras, números, "@", ".", "-" e "_" (um único "@"). */
export function normalizeEmail(value: string) {
  const clean = stripAccents(value).toLowerCase().replace(/[^a-z0-9@._-]/g, '');
  const at = clean.indexOf('@');
  return at < 0 ? clean : clean.slice(0, at + 1) + clean.slice(at + 1).replace(/@/g, '');
}

export const isEmailShape = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

// ---------------------------------------------------------------------------
// Comparação de nomes (abreviados, sem nome do meio, com "DA/DE/DOS"...)
// ---------------------------------------------------------------------------

const tokens = (name: string) =>
  normalizeName(name, 'PJ')
    .replace(/[&./-]/g, ' ')
    .split(' ')
    .filter(Boolean);

/** "A" casa com "ANTONIO" (inicial) e "JOS" casa com "JOSE" (digitação em andamento). */
const compatible = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);

/** Todos os tokens de `small` aparecem, na mesma ordem, em `big` — e o primeiro nome é o mesmo. */
function inOrder(small: string[], big: string[]) {
  if (!compatible(small[0], big[0])) return false;
  let j = 1;
  for (let i = 1; i < small.length; i++) {
    while (j < big.length && !compatible(small[i], big[j])) j++;
    if (j >= big.length) return false;
    j++;
  }
  return true;
}

/**
 * 'exact'   = mesmo nome
 * 'similar' = nome parecido (abreviado, sem nome do meio, com partículas a mais ou a menos)
 * null      = não parece a mesma pessoa
 */
export function compareNames(a: string, b: string): 'exact' | 'similar' | null {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return null;
  if (ta.join(' ') === tb.join(' ')) return 'exact';
  // nomes de uma palavra só geram ruído demais
  if (ta.length < 2 || tb.length < 2) return null;
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return inOrder(small, big) ? 'similar' : null;
}

/** O nome digitado já dá para comparar? (pelo menos 2 palavras e o primeiro nome com 3+ letras) */
export function isNameSearchable(name: string) {
  const t = tokens(name);
  return t.length >= 2 && t[0].length >= 3;
}

/** Telefones iguais, ignorando máscara, DDI e o 9º dígito (compara os 8 últimos dígitos). */
export function samePhone(a: string, b: string) {
  const da = a.replace(/\D/g, '');
  const db = b.replace(/\D/g, '');
  if (da.length < 10 || db.length < 10) return false;
  return da === db || da.slice(-8) === db.slice(-8);
}
