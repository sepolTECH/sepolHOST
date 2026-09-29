import { lookup } from 'node:dns/promises';
import net from 'node:net';

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REDIRECTS = 3;

/** Faixas de IP internas — o servidor não baixa nada da rede local (evita SSRF). */
function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function assertPublicUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Use um link http(s)');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error('Não foi possível encontrar o endereço do link');
  if (addresses.some((a) => isPrivateIp(a.address))) throw new Error('Link não permitido (endereço interno)');
  return url;
}

/** Baixa o texto do calendário (.ics) com tempo e tamanho limitados. */
export async function fetchIcal(rawUrl: string): Promise<string> {
  let current = rawUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const url = await assertPublicUrl(current);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5',
          'User-Agent': 'SepolHost-Calendar/1.0',
        },
      });
    } catch (err) {
      const name = (err as { name?: string }).name;
      throw new Error(name === 'TimeoutError' ? 'A plataforma demorou demais para responder' : 'Não foi possível acessar o link');
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`Redirecionamento inválido (HTTP ${res.status})`);
      current = new URL(location, url).toString();
      continue;
    }
    if (res.status === 404) throw new Error('Calendário não encontrado (404) — confira se o link ainda é válido');
    if (res.status === 401 || res.status === 403) throw new Error(`Acesso negado pela plataforma (HTTP ${res.status})`);
    if (!res.ok) throw new Error(`A plataforma respondeu com erro (HTTP ${res.status})`);

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error('Calendário grande demais');

    // Lê com limite de tamanho
    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error('Calendário grande demais');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('Redirecionamentos demais');
}
