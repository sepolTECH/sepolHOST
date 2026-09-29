/**
 * Armazenamento de arquivos em disco (pasta UPLOADS_DIR).
 * No Docker essa pasta é um volume — lembre de incluí-la no backup da VPS.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

export const UPLOADS_ROOT = path.resolve(env.UPLOADS_DIR);

/** Caminho absoluto de um arquivo salvo, sem deixar sair da pasta de uploads. */
export function absolutePath(relPath: string) {
  const abs = path.resolve(UPLOADS_ROOT, relPath);
  if (!abs.startsWith(UPLOADS_ROOT + path.sep)) throw new Error('Caminho de arquivo inválido');
  return abs;
}

/** Salva o arquivo em <pasta>/<uuid>.<ext> e devolve o caminho relativo (gravado no banco). */
export async function saveFile(folder: string, ext: string, data: Buffer) {
  const relPath = path.posix.join(folder, `${randomUUID()}.${ext}`);
  const abs = absolutePath(relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return relPath;
}

/** Remove o arquivo; ignora se já não existir. */
export async function removeFile(relPath: string | null | undefined) {
  if (!relPath) return;
  try {
    await rm(absolutePath(relPath), { force: true });
  } catch (err) {
    console.warn('Não foi possível remover o arquivo', relPath, err);
  }
}

/** Identifica o tipo real do arquivo pelos primeiros bytes (não confia no Content-Type). */
export function detectFileType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: 'image/png', ext: 'png' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' };
  if (buf.toString('ascii', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}
