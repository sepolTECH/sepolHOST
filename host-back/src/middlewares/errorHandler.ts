import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      message: err.issues[0]?.message ?? 'Dados inválidos',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  // Erros do body-parser do Express (corpo grande demais / JSON malformado)
  const bodyErr = err as { type?: string; status?: number };
  if (bodyErr.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Arquivo muito grande (máx. 5 MB)' });
  }
  if (bodyErr.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Corpo da requisição inválido' });
  }

  console.error(err);
  return res.status(500).json({ message: 'Erro interno do servidor' });
}
