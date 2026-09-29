-- Despesas do imóvel por mês (Finanças): condomínio, IPTU, energia, internet...
-- Diferente dos custos da reserva (limpeza, reposição), que ficam em reservation_costs.
--
-- O imóvel é identificado pelo nome usado nas reservas (property_name), comparado sem
-- diferenciar maiúsculas/espaços. property_name NULL = despesa geral (não é de um imóvel só).

-- Despesas que se repetem todo mês (modelo). Cada mês ganha um lançamento próprio,
-- criado automaticamente ao abrir o mês, que pode ter o valor ajustado só naquele mês.
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name  VARCHAR(120),
  category       VARCHAR(20)  NOT NULL,
  description    VARCHAR(120) NOT NULL,
  amount_cents   BIGINT       NOT NULL CHECK (amount_cents > 0),
  start_month    DATE         NOT NULL CHECK (EXTRACT(DAY FROM start_month) = 1),
  end_month      DATE         CHECK (end_month IS NULL OR EXTRACT(DAY FROM end_month) = 1),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT recurring_expenses_period_ok CHECK (end_month IS NULL OR end_month >= start_month)
);

-- Lançamentos do mês (avulsos ou gerados a partir de uma despesa recorrente)
CREATE TABLE IF NOT EXISTS month_expenses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period                DATE         NOT NULL CHECK (EXTRACT(DAY FROM period) = 1), -- 1º dia do mês
  property_name         VARCHAR(120),
  category              VARCHAR(20)  NOT NULL,
  description           VARCHAR(120) NOT NULL,
  amount_cents          BIGINT       NOT NULL CHECK (amount_cents >= 0),
  recurring_expense_id  UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  -- true = valor alterado só neste mês (não segue mudanças do modelo)
  edited                BOOLEAN      NOT NULL DEFAULT FALSE,
  -- true = recorrente removida só deste mês (fica guardada para não ser recriada)
  skipped               BOOLEAN      NOT NULL DEFAULT FALSE,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS month_expenses_period_idx ON month_expenses (period);
-- Um lançamento por despesa recorrente por mês
CREATE UNIQUE INDEX IF NOT EXISTS month_expenses_recurring_unique
  ON month_expenses (recurring_expense_id, period) WHERE recurring_expense_id IS NOT NULL;
