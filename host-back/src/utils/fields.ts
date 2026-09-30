import { z } from 'zod';

/** E-mail: remove qualquer espaço, deixa minúsculo e valida o formato. */
export const emailField = z
  .string()
  .transform((v) => v.replace(/\s+/g, '').toLowerCase())
  .pipe(z.string().email('E-mail inválido'));

/** Nome livre: tira espaços das pontas e junta espaços repetidos. */
export const nameField = z.string().transform((v) => v.replace(/\s+/g, ' ').trim());

/** Identificação de acompanhante: só letras e números, maiúsculas (sem pontos, traços ou espaços). */
export const docField = z.string().transform((v) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase(),
);
