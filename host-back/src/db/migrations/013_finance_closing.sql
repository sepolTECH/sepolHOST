-- Fechamento do mês (Finanças → Fechamento do mês): configurações do cálculo "ponta do lápis".
--
-- Uma linha por mês (period = 1º dia do mês). Um mês sem linha própria usa a configuração
-- do mês anterior mais recente — ou seja, ao salvar em setembro, vale para setembro e para
-- os próximos meses até alguém salvar outra configuração.

CREATE TABLE IF NOT EXISTS finance_closing_settings (
  period                  DATE         PRIMARY KEY CHECK (EXTRACT(DAY FROM period) = 1),

  -- Taxa de administração (opcional)
  admin_fee_enabled       BOOLEAN      NOT NULL DEFAULT FALSE,
  admin_fee_percent       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (admin_fee_percent BETWEEN 0 AND 100),
  -- GROSS = sobre o valor bruto das hospedagens
  -- NET   = sobre o resultado do relatório (bruto − comissões − custos das hospedagens)
  admin_fee_base          VARCHAR(10)  NOT NULL DEFAULT 'NET' CHECK (admin_fee_base IN ('GROSS', 'NET')),

  -- Carnê-leão (IRPF mensal sobre aluguel recebido de pessoa física / do exterior)
  tax_enabled             BOOLEAN      NOT NULL DEFAULT TRUE,
  -- GROSS  = rendimento é o valor bruto pago pelo hóspede
  -- PAYOUT = rendimento é o bruto − comissão da plataforma (valor repassado)
  tax_income_base         VARCHAR(10)  NOT NULL DEFAULT 'PAYOUT' CHECK (tax_income_base IN ('GROSS', 'PAYOUT')),
  -- AUTO = usa o que for maior entre deduções legais e desconto simplificado
  tax_deduction_mode      VARCHAR(12)  NOT NULL DEFAULT 'AUTO' CHECK (tax_deduction_mode IN ('AUTO', 'LEGAL', 'SIMPLIFIED')),
  tax_dependents          SMALLINT     NOT NULL DEFAULT 0 CHECK (tax_dependents BETWEEN 0 AND 20),
  tax_social_security_cents BIGINT     NOT NULL DEFAULT 0 CHECK (tax_social_security_cents >= 0), -- INSS / previdência oficial paga no mês
  tax_alimony_cents       BIGINT       NOT NULL DEFAULT 0 CHECK (tax_alimony_cents >= 0),          -- pensão alimentícia judicial paga no mês

  updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
