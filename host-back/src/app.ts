import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { guestsRoutes } from './modules/guests/guests.routes.js';
import { reservationsRoutes } from './modules/reservations/reservations.routes.js';
import { blocklistRoutes } from './modules/blocklist/blocklist.routes.js';
import { reviewsRoutes } from './modules/reviews/reviews.routes.js';
import { financeRoutes } from './modules/finance/finance.routes.js';
import { calendarRoutes } from './modules/calendar/calendar.routes.js';

export const app = express();

// Necessário atrás de proxy reverso (Nginx/Traefik na VPS) para o rate-limit pegar o IP real
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch {
    res.status(503).json({ status: 'error', database: 'down' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/blocklist', blocklistRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/calendar', calendarRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

app.use(errorHandler);
