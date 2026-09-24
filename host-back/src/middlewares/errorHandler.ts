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

  console.error(err);
  return res.status(500).json({ message: 'Erro interno do servidor' });
}
