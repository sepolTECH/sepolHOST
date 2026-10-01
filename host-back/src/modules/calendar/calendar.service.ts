import { query } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import type { EventsQuery, FeedInput, Platform } from './calendar.schema.js';
import { fetchIcal } from './fetchIcal.js';
import { addDays, parseIcal, type IcalEvent } from './ical.js';

// ---------------------------------------------------------------------------
// Links (feeds) cadastrados
// ---------------------------------------------------------------------------

interface FeedRow {
  id: string;
  name: string;
  platform: Platform;
  url: string;
  color: string;
  property_name: string | null;
  active: boolean;
  last_sync_at: Date | null;
  last_error: string | null;
  last_events: number | null;
  created_at: Date;
  updated_at: Date;
}

const toFeed = (r: FeedRow) => ({
  id: r.id,
  name: r.name,
  platform: r.platform,
  url: r.url,
  color: r.color,
  propertyName: r.property_name,
  active: r.active,
  lastSyncAt: r.last_sync_at,
  lastError: r.last_error,
  lastEvents: r.last_events,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export type Feed = ReturnType<typeof toFeed>;

export async function listFeeds(ownerId: string) {
  const { rows } = await query<FeedRow>('SELECT * FROM calendar_feeds WHERE owner_id = $1 ORDER BY created_at', [ownerId]);
  return rows.map(toFeed);
}

async function assertUniqueUrl(ownerId: string, url: string, ignoreId?: string) {
  const { rows } = await query(
    'SELECT 1 FROM calendar_feeds WHERE owner_id = $3 AND url = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)',
    [url, ignoreId ?? null, ownerId],
  );
  if (rows.length) throw new AppError('Este link já está cadastrado', 409);
}

export async function createFeed(input: FeedInput, userId: string) {
  await assertUniqueUrl(userId, input.url);
  const { rows } = await query<FeedRow>(
    `INSERT INTO calendar_feeds (owner_id, name, platform, url, color, property_name, active, created_by, updated_by)
     VALUES ($7, $1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
    [input.name, input.platform, input.url, input.color, input.propertyName, input.active, userId],
  );
  return toFeed(rows[0]);
}

export async function updateFeed(id: string, input: FeedInput, userId: string) {
  await assertUniqueUrl(userId, input.url, id);
  const { rows } = await query<FeedRow>(
    `UPDATE calendar_feeds
        SET name = $2, platform = $3, url = $4, color = $5, property_name = $6, active = $7,
            updated_by = $8, updated_at = NOW(),
            -- link novo = status da última sincronização deixa de valer
            last_sync_at = CASE WHEN url = $4 THEN last_sync_at END,
            last_error   = CASE WHEN url = $4 THEN last_error END,
            last_events  = CASE WHEN url = $4 THEN last_events END
      WHERE id = $1 AND owner_id = $8 RETURNING *`,
    [id, input.name, input.platform, input.url, input.color, input.propertyName, input.active, userId],
  );
  if (!rows[0]) throw new AppError('Calendário não encontrado', 404);
  cache.delete(id);
  return toFeed(rows[0]);
}

export async function removeFeed(ownerId: string, id: string) {
  const { rowCount } = await query('DELETE FROM calendar_feeds WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  if (!rowCount) throw new AppError('Calendário não encontrado', 404);
  cache.delete(id);
}

// ---------------------------------------------------------------------------
// Download + cache em memória
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 10 * 60_000; // 10 minutos

interface CacheEntry {
  url: string;
  fetchedAt: number;
  events: IcalEvent[];
  error: string | null;
}
const cache = new Map<string, CacheEntry>();
// Evita baixar o mesmo link duas vezes ao mesmo tempo
const inFlight = new Map<string, Promise<CacheEntry>>();

async function loadFeed(feed: FeedRow, refresh: boolean): Promise<CacheEntry> {
  const cached = cache.get(feed.id);
  if (!refresh && cached && cached.url === feed.url && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const running = inFlight.get(feed.id);
  if (running) return running;

  const job = (async () => {
    let entry: CacheEntry;
    try {
      const text = await fetchIcal(feed.url);
      entry = { url: feed.url, fetchedAt: Date.now(), events: parseIcal(text), error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao sincronizar';
      // Mantém os últimos eventos baixados (se houver) para não "sumir" com o calendário
      entry = {
        url: feed.url,
        fetchedAt: Date.now(),
        events: cached?.url === feed.url ? cached.events : [],
        error: message,
      };
    }
    cache.set(feed.id, entry);
    await query(
      `UPDATE calendar_feeds
          SET last_sync_at = to_timestamp($2 / 1000.0), last_error = $3,
              last_events = CASE WHEN $3::text IS NULL THEN $4::int ELSE last_events END
        WHERE id = $1`,
      [feed.id, entry.fetchedAt, entry.error, entry.events.length],
    ).catch(() => undefined);
    return entry;
  })().finally(() => inFlight.delete(feed.id));

  inFlight.set(feed.id, job);
  return job;
}

// ---------------------------------------------------------------------------
// Interpretação dos eventos de cada plataforma
// ---------------------------------------------------------------------------

type Kind = 'RESERVA' | 'BLOQUEIO';

interface Detail {
  label: string;
  value: string;
  href?: string;
}

const LABELS: Record<string, string> = {
  'reservation url': 'Link da reserva',
  'phone number (last 4 digits)': 'Telefone (4 últimos dígitos)',
  'phone number': 'Telefone',
  phone: 'Telefone',
  email: 'E-mail',
  name: 'Hóspede',
  guest: 'Hóspede',
  'guest name': 'Hóspede',
  guests: 'Hóspedes',
  adults: 'Adultos',
  children: 'Crianças',
  'check-in': 'Check-in',
  'check-out': 'Check-out',
  'reservation id': 'Código da reserva',
  'booking id': 'Código da reserva',
  'confirmation code': 'Código da reserva',
  property: 'Imóvel',
  'listing name': 'Anúncio',
  notes: 'Observações',
};

const GENERIC_TITLES = /^(reserved|reservado|reservada|reserva|booked|booking|closed|fechado|not available|unavailable|indispon[ií]vel|blocked|bloqueado|occupied|ocupado)$/i;
const BLOCK_WORDS = /(not available|unavailable|indispon[ií]vel|blocked|bloquead|bloqueio)/i;

/** Lê "Chave: valor" das linhas da descrição. */
function parseDescription(description: string | null) {
  const details: Detail[] = [];
  const free: string[] = [];
  if (!description) return { details, free };
  for (const line of description.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (m && !/^https?$/i.test(m[1])) {
      const key = m[1].trim();
      const value = m[2].trim();
      details.push({
        label: LABELS[key.toLowerCase()] ?? key,
        value,
        ...(/^https?:\/\//i.test(value) ? { href: value } : {}),
      });
    } else {
      free.push(line);
    }
  }
  return { details, free };
}

interface Interpreted {
  kind: Kind;
  guestName: string | null;
  reservationCode: string | null;
  /** 0 = bloqueio, 1 = "fechado" genérico, 2 = reserva confirmada, 3 = reserva com nome */
  confidence: number;
  details: Detail[];
  notes: string | null;
}

function interpret(platform: Platform, ev: IcalEvent): Interpreted {
  const summary = (ev.summary ?? '').trim();
  const { details, free } = parseDescription(ev.description);

  // Código da reserva: Airbnb manda o link ".../reservations/details/HMXXXXXX"
  let reservationCode: string | null = null;
  const link = details.find((d) => d.href)?.href ?? ev.url ?? null;
  const codeMatch = link?.match(/\/details\/([A-Z0-9]{6,})/i) ?? ev.description?.match(/\b(HM[A-Z0-9]{8})\b/);
  if (codeMatch) reservationCode = codeMatch[1].toUpperCase();
  const codeDetail = details.find((d) => d.label === 'Código da reserva');
  if (!reservationCode && codeDetail) reservationCode = codeDetail.value;

  // Nome do hóspede: campo "Name/Guest" da descrição ou o título, quando não é genérico
  let guestName = details.find((d) => d.label === 'Hóspede')?.value ?? null;
  if (!guestName && summary) {
    const cleaned = summary
      .replace(/^(reserved|reservado|reserva|booked|booking)\s*[-–:|]\s*/i, '')
      .replace(/\s*[-–]\s*(airbnb|booking(\.com)?|vrbo|homeaway)$/i, '')
      .replace(/^(airbnb|booking(\.com)?|vrbo)\s*[-–:]\s*/i, '')
      .trim();
    if (cleaned && !GENERIC_TITLES.test(cleaned) && !BLOCK_WORDS.test(cleaned) && !/^closed\b/i.test(cleaned)) {
      guestName = cleaned;
    }
  }

  let kind: Kind = 'RESERVA';
  let confidence = 2;
  if (platform === 'AIRBNB') {
    // Airbnb: "Reserved" = reserva; "Airbnb (Not available)" = dia bloqueado/importado de outra agenda
    if (BLOCK_WORDS.test(summary)) {
      kind = 'BLOQUEIO';
      confidence = 0;
    }
  } else if (platform === 'BOOKING') {
    // Booking exporta tudo como "CLOSED - Not available" (reserva ou data fechada): não dá para distinguir
    confidence = 1;
  } else if (BLOCK_WORDS.test(summary) && !guestName) {
    kind = 'BLOQUEIO';
    confidence = 0;
  }
  if (guestName) confidence = 3;

  return { kind, guestName, reservationCode, confidence, details, notes: free.join('\n') || null };
}

// ---------------------------------------------------------------------------
// Reservas cadastradas no sistema (para cruzar nome do hóspede e dados)
// ---------------------------------------------------------------------------

interface ReservationRow {
  id: string;
  reservation_number: string;
  property_name: string;
  guests_count: number;
  check_in: string;
  final_check_out: string;
  status: 'VAZIO' | 'HOSPEDADO' | 'CONCLUIDO';
  platform: Platform | null;
  guest_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
}

const RESERVATION_SELECT = `
  SELECT r.id, r.reservation_number, r.property_name, r.guests_count, r.check_in, r.final_check_out,
         r.status, r.platform, g.id AS guest_id, g.full_name AS guest_name, g.phone AS guest_phone
    FROM reservations r
    LEFT JOIN guests g ON g.id = r.main_guest_id`;

/** Identificador estável da marcação dentro do link: o UID do iCal (ou as datas, se a plataforma não mandar UID). */
const eventKeyOf = (ev: IcalEvent) => ev.uid ?? `${ev.start}|${ev.end}`;

const toLinked = (r: ReservationRow) => ({
  id: r.id,
  reservationNumber: r.reservation_number,
  propertyName: r.property_name,
  guestsCount: r.guests_count,
  checkIn: r.check_in,
  checkOut: r.final_check_out,
  status: r.status,
  platform: r.platform,
  guest: r.guest_id ? { id: r.guest_id, fullName: r.guest_name ?? '', phone: r.guest_phone } : null,
});

const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;
const sameText = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Visão unificada
// ---------------------------------------------------------------------------

export async function getEvents(ownerId: string, { from, to, refresh }: EventsQuery) {
  const { rows: feedRows } = await query<FeedRow>(
    'SELECT * FROM calendar_feeds WHERE owner_id = $1 AND active ORDER BY created_at',
    [ownerId],
  );
  const loaded = await Promise.all(feedRows.map((f) => loadFeed(f, refresh)));

  // Vínculos feitos à mão (marcação do link ↔ reserva do cadastro)
  const { rows: manualRows } = await query<{ feed_id: string; event_key: string; reservation_id: string | null }>(
    'SELECT feed_id, event_key, reservation_id FROM calendar_event_links WHERE feed_id = ANY($1::uuid[])',
    [feedRows.map((f) => f.id)],
  );
  const manualOf = new Map(manualRows.map((m) => [`${m.feed_id}|${m.event_key}`, m.reservation_id]));

  // Reservas do cadastro no período (para o vínculo automático) + as vinculadas à mão
  const { rows: reservations } = await query<ReservationRow>(
    `${RESERVATION_SELECT}
      WHERE r.owner_id = $4
        AND ((r.check_in < $2::date AND r.final_check_out > $1::date) OR r.id = ANY($3::uuid[]))
      ORDER BY r.check_in`,
    [addDays(from, -1), addDays(to, 1), manualRows.flatMap((m) => m.reservation_id ?? []), ownerId],
  );
  const byId = new Map(reservations.map((r) => [r.id, r]));
  const manualReservations = new Set(manualRows.flatMap((m) => m.reservation_id ?? []));

  const events = feedRows.flatMap((feed, i) => {
    const seen = new Set<string>();
    return loaded[i].events
      .filter((ev) => overlaps(ev.start, ev.end, from, to))
      .filter((ev) => {
        const key = `${ev.uid ?? ''}|${ev.start}|${ev.end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((ev) => {
        const info = interpret(feed.platform, ev);
        return { feed, ev, info, id: `${feed.id}:${ev.uid ?? ''}:${ev.start}`, eventKey: eventKeyOf(ev) };
      });
  });

  // 1) Vínculo manual tem prioridade
  const linkOf = new Map<string, { r: ReservationRow; source: 'MANUAL' | 'AUTO' }>();
  const usedReservations = new Set<string>(manualReservations);
  const optedOut = new Set<string>(); // marcações em que o usuário desfez o vínculo automático
  for (const e of events) {
    const key = `${e.feed.id}|${e.eventKey}`;
    if (!manualOf.has(key)) continue;
    const rid = manualOf.get(key);
    const r = rid ? byId.get(rid) : undefined;
    if (r) linkOf.set(e.id, { r, source: 'MANUAL' });
    else optedOut.add(e.id);
  }

  // 2) Vínculo automático só quando não há dúvida: mesmo código da reserva,
  //    ou mesma plataforma com check-in e check-out idênticos
  const candidates = events
    .filter((e) => !linkOf.has(e.id) && !optedOut.has(e.id))
    .flatMap((e) =>
      reservations
        .filter((r) => !manualReservations.has(r.id))
        .filter((r) => !e.feed.property_name || sameText(e.feed.property_name, r.property_name))
        .map((r) => {
          if (e.info.reservationCode && sameText(e.info.reservationCode, r.reservation_number)) return { e, r, score: 2 };
          if (r.platform === e.feed.platform && r.check_in === e.ev.start && r.final_check_out === e.ev.end)
            return { e, r, score: 1 };
          return null;
        })
        .filter((c): c is NonNullable<typeof c> => !!c),
    )
    .sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (linkOf.has(c.e.id) || usedReservations.has(c.r.id)) continue;
    usedReservations.add(c.r.id);
    linkOf.set(c.e.id, { r: c.r, source: 'AUTO' });
  }

  const built = events.map(({ feed, ev, info, id, eventKey }) => {
    const link = linkOf.get(id) ?? null;
    const linked = link?.r ?? null;
    const kind: Kind = linked ? 'RESERVA' : info.kind;
    return {
      id,
      eventKey,
      feedId: feed.id,
      feedName: feed.name,
      platform: feed.platform,
      color: feed.color,
      propertyName: feed.property_name ?? linked?.property_name ?? null,
      kind,
      // o nome do cadastro vale mais que o título do calendário
      guestName: linked?.guest_name ?? info.guestName,
      start: ev.start,
      end: ev.end,
      nights: nightsBetween(ev.start, ev.end),
      summary: ev.summary,
      description: ev.description,
      notes: info.notes,
      location: ev.location,
      url: ev.url,
      uid: ev.uid,
      status: ev.status,
      reservationCode: info.reservationCode,
      details: info.details,
      extra: ev.extra,
      reservation: linked ? toLinked(linked) : null,
      linkSource: link?.source ?? null,
      /** datas da reserva vinculada diferentes das da plataforma (ex.: estadia alterada) */
      datesMismatch: !!linked && (linked.check_in !== ev.start || linked.final_check_out !== ev.end),
      confidence: linked ? Math.max(info.confidence, 4) : info.confidence,
      /** Outros calendários que mostram exatamente o mesmo período (espelhados pela sincronização entre plataformas) */
      alsoIn: [] as { feedName: string; platform: Platform; summary: string | null }[],
    };
  });

  // 3) O mesmo período aparece em várias plataformas quando elas importam o calendário uma da outra.
  //    Mantém o evento mais "informativo" e lista os demais em alsoIn.
  const groups = new Map<string, typeof built>();
  const feedProperty = new Map(feedRows.map((f) => [f.id, f.property_name?.trim().toLowerCase() ?? '']));
  for (const e of built) {
    // imóvel informado no link (links sem imóvel = mesmo imóvel)
    const key = `${feedProperty.get(e.feedId) ?? ''}|${e.start}|${e.end}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const unified = [...groups.values()].flatMap((group) => {
    if (group.length === 1) return group;
    const feedsInGroup = new Set(group.map((g) => g.feedId));
    if (feedsInGroup.size === 1) return group; // eventos distintos da mesma agenda
    const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
    const [main, ...rest] = sorted;
    main.alsoIn = rest.map((r) => ({ feedName: r.feedName, platform: r.platform, summary: r.summary }));
    return [main];
  });

  const all = unified
    .sort((a, b) => a.start.localeCompare(b.start) || b.nights - a.nights)
    .map(({ confidence: _c, ...rest }) => rest);

  const feeds = feedRows.map((f, i) => ({
    id: f.id,
    name: f.name,
    platform: f.platform,
    color: f.color,
    propertyName: f.property_name,
    syncedAt: new Date(loaded[i].fetchedAt),
    error: loaded[i].error,
    eventsCount: loaded[i].events.length,
  }));

  return { from, to, feeds, events: all };
}

// ---------------------------------------------------------------------------
// Vínculo manual: marcação do link ↔ reserva do cadastro
// ---------------------------------------------------------------------------

/** Reservas sugeridas para vincular: as que cruzam o período primeiro; com busca, por nº, hóspede ou imóvel. */
export async function linkCandidates(
  ownerId: string,
  { start, end, search }: { start: string; end: string; search: string },
) {
  const params: unknown[] = [start, end, ownerId];
  let where = `r.check_in < ($2::date + 15) AND r.final_check_out > ($1::date - 15)`;
  if (search) {
    params.push(`%${search}%`);
    where = `(r.reservation_number ILIKE $4 OR g.full_name ILIKE $4 OR r.property_name ILIKE $4)`;
  }
  const { rows } = await query<ReservationRow & { linked_feed: string | null }>(
    `${RESERVATION_SELECT.replace(
      'FROM reservations r',
      ', (SELECT f.name FROM calendar_event_links l JOIN calendar_feeds f ON f.id = l.feed_id WHERE l.reservation_id = r.id) AS linked_feed FROM reservations r',
    )}
      WHERE r.owner_id = $3 AND r.status <> 'CANCELADO' AND (${where})
      ORDER BY (r.check_in < $2::date AND r.final_check_out > $1::date) DESC,
               ABS(r.check_in - $1::date), r.check_in DESC
      LIMIT 20`,
    params,
  );
  return rows.map((r) => ({
    ...toLinked(r),
    overlaps: overlaps(r.check_in, r.final_check_out, start, end),
    exact: r.check_in === start && r.final_check_out === end,
    linkedTo: r.linked_feed,
  }));
}

/** Confere que o calendário (e a reserva, quando informada) pertencem ao cliente logado. */
async function assertOwned(ownerId: string, feedId: string, reservationId?: string) {
  const { rowCount: feedOk } = await query('SELECT 1 FROM calendar_feeds WHERE id = $1 AND owner_id = $2', [feedId, ownerId]);
  if (!feedOk) throw new AppError('Calendário ou reserva não encontrado', 404);
  if (reservationId) {
    const { rowCount: resOk } = await query('SELECT 1 FROM reservations WHERE id = $1 AND owner_id = $2', [
      reservationId,
      ownerId,
    ]);
    if (!resOk) throw new AppError('Calendário ou reserva não encontrado', 404);
  }
}

export async function link(feedId: string, eventKey: string, reservationId: string, userId: string) {
  await assertOwned(userId, feedId, reservationId);
  try {
    // Uma reserva só pode estar ligada a uma marcação: remove vínculo anterior dela
    await query('DELETE FROM calendar_event_links WHERE reservation_id = $1 AND NOT (feed_id = $2 AND event_key = $3)', [
      reservationId,
      feedId,
      eventKey,
    ]);
    await query(
      `INSERT INTO calendar_event_links (feed_id, event_key, reservation_id, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (feed_id, event_key) DO UPDATE
          SET reservation_id = EXCLUDED.reservation_id, created_by = EXCLUDED.created_by, created_at = NOW()`,
      [feedId, eventKey, reservationId, userId],
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23503') throw new AppError('Calendário ou reserva não encontrado', 404);
    throw err;
  }
}

/** Desfaz o vínculo e impede que o sistema volte a vincular automaticamente esta marcação. */
export async function unlink(feedId: string, eventKey: string, userId: string) {
  await assertOwned(userId, feedId);
  await query(
    `INSERT INTO calendar_event_links (feed_id, event_key, reservation_id, created_by)
     VALUES ($1, $2, NULL, $3)
     ON CONFLICT (feed_id, event_key) DO UPDATE SET reservation_id = NULL, created_by = EXCLUDED.created_by, created_at = NOW()`,
    [feedId, eventKey, userId],
  );
}
