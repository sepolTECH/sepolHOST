import { Router } from 'express';
import { z } from 'zod';
import { ensureAuth } from '../../middlewares/auth.js';
import {
  closingSettingsSchema,
  createExpenseSchema,
  deleteExpenseQuerySchema,
  monthQuerySchema,
  updateExpenseSchema,
} from './finance.schema.js';
import * as financeService from './finance.service.js';
import * as expensesService from './expenses.service.js';
import * as closingService from './closing.service.js';

export const financeRoutes = Router();

// Todas as rotas de finanças exigem login
financeRoutes.use(ensureAuth);

const idSchema = z.object({ id: z.string().uuid('Despesa não encontrada') });

// Relatório financeiro do mês (proporcional às noites, sem despesas/impostos): GET /api/finance?year=2026&month=9
financeRoutes.get('/', async (req, res) => {
  res.json(await financeService.monthSummary(req.user!.sub, monthQuerySchema.parse(req.query)));
});

// ---------- Fechamento do mês (ponta do lápis: despesas, taxa de administração, carnê-leão) ----------

// GET /api/finance/closing?year=2026&month=10
financeRoutes.get('/closing', async (req, res) => {
  res.json(await closingService.closing(req.user!.sub, monthQuerySchema.parse(req.query)));
});

// Salva a configuração do mês (vale para os próximos meses até mudar) e devolve o fechamento recalculado
financeRoutes.put('/closing/settings', async (req, res) => {
  const input = closingSettingsSchema.parse(req.body);
  res.json(await closingService.saveSettings(input, req.user!.sub));
});

// ---------- Despesas do mês (condomínio, IPTU, contas...) ----------

financeRoutes.post('/expenses', async (req, res) => {
  const input = createExpenseSchema.parse(req.body);
  res.status(201).json({ expense: await expensesService.create(input, req.user!.sub) });
});

financeRoutes.put('/expenses/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  const input = updateExpenseSchema.parse(req.body);
  res.json({ expense: await expensesService.update(id, input, req.user!.sub) });
});

financeRoutes.delete('/expenses/:id', async (req, res) => {
  const { id } = idSchema.parse(req.params);
  const { scope } = deleteExpenseQuerySchema.parse(req.query);
  await expensesService.remove(id, scope, req.user!.sub);
  res.status(204).end();
});
