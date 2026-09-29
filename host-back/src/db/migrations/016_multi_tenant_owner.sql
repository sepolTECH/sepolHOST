-- Multi-cliente: cada usuário (cliente) só enxerga os próprios dados.
--
-- Adiciona owner_id (o usuário dono do registro) nas tabelas "raiz". As tabelas filhas
-- (acompanhantes, custos, extensões, anexos, avaliações, dependentes, lista negra,
-- vínculos do calendário) herdam o dono da tabela pai.
--
-- Dados que já existem são atribuídos ao administrador mais antigo (ou, se não houver,
-- ao usuário mais antigo) — ou seja, ao dono atual do sistema.

ALTER TABLE guests                    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE reservations              ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE recurring_expenses        ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE month_expenses            ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE calendar_feeds            ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE finance_closing_settings  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

DO $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT id INTO v_owner FROM users ORDER BY (role = 'admin') DESC, created_at ASC LIMIT 1;

  UPDATE guests                   SET owner_id = v_owner WHERE owner_id IS NULL;
  UPDATE reservations             SET owner_id = v_owner WHERE owner_id IS NULL;
  UPDATE recurring_expenses       SET owner_id = v_owner WHERE owner_id IS NULL;
  UPDATE month_expenses           SET owner_id = v_owner WHERE owner_id IS NULL;
  UPDATE calendar_feeds           SET owner_id = v_owner WHERE owner_id IS NULL;
  UPDATE finance_closing_settings SET owner_id = v_owner WHERE owner_id IS NULL;
END $$;

ALTER TABLE guests                    ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE reservations              ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE recurring_expenses        ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE month_expenses            ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE calendar_feeds            ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE finance_closing_settings  ALTER COLUMN owner_id SET NOT NULL;

-- Unicidade passa a valer por cliente (dois clientes podem ter o mesmo hóspede / nº de reserva)
DROP INDEX IF EXISTS guests_document_unique;
CREATE UNIQUE INDEX guests_document_unique ON guests (owner_id, document_type, document_number);

DROP INDEX IF EXISTS reservations_number_unique;
CREATE UNIQUE INDEX reservations_number_unique ON reservations (owner_id, LOWER(reservation_number));

-- Fechamento do mês: uma configuração por cliente e por mês
ALTER TABLE finance_closing_settings DROP CONSTRAINT IF EXISTS finance_closing_settings_pkey;
ALTER TABLE finance_closing_settings ADD PRIMARY KEY (owner_id, period);

-- Garantia no próprio banco: a reserva só pode apontar para um hóspede do MESMO cliente
ALTER TABLE guests ADD CONSTRAINT guests_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_main_guest_id_fkey;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_main_guest_owner_fkey
  FOREIGN KEY (main_guest_id, owner_id) REFERENCES guests (id, owner_id) ON DELETE RESTRICT;

-- Índices para as consultas filtradas por cliente
CREATE INDEX IF NOT EXISTS guests_owner_idx                ON guests (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reservations_owner_idx          ON reservations (owner_id, check_in DESC);
CREATE INDEX IF NOT EXISTS recurring_expenses_owner_idx    ON recurring_expenses (owner_id);
CREATE INDEX IF NOT EXISTS month_expenses_owner_period_idx ON month_expenses (owner_id, period);
CREATE INDEX IF NOT EXISTS calendar_feeds_owner_idx        ON calendar_feeds (owner_id, created_at);
