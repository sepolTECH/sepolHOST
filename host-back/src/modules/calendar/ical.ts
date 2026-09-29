/**
 * Leitor mínimo de iCalendar (RFC 5545) — só o necessário para os calendários
 * exportados por Airbnb, Booking, VRBO e similares (VEVENTs com datas de dia inteiro
 * ou data-hora). Sem dependências externas.
 */

export interface IcalEvent {
  uid: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  url: string | null;
  status: string | null;
  /** "AAAA-MM-DD" — primeiro dia (check-in) */
  start: string;
  /** "AAAA-MM-DD" — dia de saída (exclusivo, igual ao check-out) */
  end: string;
  /** Outras propriedades do evento (ex.: X-... de algumas plataformas) */
  extra: Record<string, string>;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Junta as linhas "dobradas" (continuação começa com espaço ou tab). */
function unfold(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

/** Separa "NOME;PARAM=X;PARAM2=Y:valor" respeitando aspas nos parâmetros. */
function parseLine(line: string): Prop | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ':' && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rawParams] = head.split(';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

/** Desfaz os escapes de texto do iCal (\n, \, \; \\). */
function unescapeText(v: string) {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c)).trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Converte DTSTART/DTEND em "AAAA-MM-DD".
 * - VALUE=DATE (20260910) → a própria data
 * - Data-hora em UTC (…Z) → convertida para o fuso informado (padrão America/Sao_Paulo)
 * - Data-hora local/TZID → usa a data como está
 */
function toIsoDate(prop: Prop, timeZone: string): string | null {
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, z] = m;
  if (hh && z) {
    const utc = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi, +(ss ?? 0)));
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(utc);
    return parts; // en-CA → "AAAA-MM-DD"
  }
  return `${y}-${mo}-${d}`;
}

export function addDays(iso: string, days: number) {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function parseIcal(text: string, timeZone = 'America/Sao_Paulo'): IcalEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('O link não devolveu um calendário iCal (.ics)');

  const events: IcalEvent[] = [];
  let current: Prop[] | null = null;
  let depth = 0; // ignora VALARM e outros blocos dentro do VEVENT

  for (const raw of unfold(text)) {
    const line = raw.trimEnd();
    if (!line) continue;
    const upper = line.toUpperCase();

    if (upper === 'BEGIN:VEVENT') {
      current = [];
      depth = 0;
      continue;
    }
    if (!current) continue;

    if (upper.startsWith('BEGIN:')) {
      depth++;
      continue;
    }
    if (upper.startsWith('END:') && depth > 0) {
      depth--;
      continue;
    }
    if (upper === 'END:VEVENT') {
      const ev = buildEvent(current, timeZone);
      if (ev) events.push(ev);
      current = null;
      continue;
    }
    if (depth > 0) continue;

    const prop = parseLine(line);
    if (prop) current.push(prop);
  }
  return events;
}

function buildEvent(props: Prop[], timeZone: string): IcalEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const text = (name: string) => {
    const p = get(name);
    return p ? unescapeText(p.value) || null : null;
  };

  const dtStart = get('DTSTART');
  if (!dtStart) return null;
  const start = toIsoDate(dtStart, timeZone);
  if (!start) return null;

  const dtEnd = get('DTEND');
  let end = dtEnd ? toIsoDate(dtEnd, timeZone) : null;
  // Sem DTEND (ou igual ao início) = evento de 1 dia
  if (!end || end <= start) end = addDays(start, 1);

  const known = new Set(['DTSTART', 'DTEND', 'UID', 'SUMMARY', 'DESCRIPTION', 'LOCATION', 'URL', 'STATUS', 'DTSTAMP', 'SEQUENCE', 'CREATED', 'LAST-MODIFIED']);
  const extra: Record<string, string> = {};
  for (const p of props) {
    if (!known.has(p.name) && !extra[p.name]) {
      const v = unescapeText(p.value);
      if (v) extra[p.name] = v.slice(0, 500);
    }
  }

  return {
    uid: text('UID'),
    summary: text('SUMMARY'),
    description: text('DESCRIPTION'),
    location: text('LOCATION'),
    url: text('URL'),
    status: text('STATUS'),
    start,
    end,
    extra,
  };
}
