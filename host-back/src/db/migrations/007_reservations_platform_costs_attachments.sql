-- Reservas: plataforma de origem, forma de pagamento, custos/taxas e anexos

ALTER TABLE reservations
  -- Nulos só nas reservas antigas; novas/alteradas sempre informam a plataforma
  ADD COLUMN IF NOT EXISTS platform       VARCHAR(12) CHECK (platform IN ('AIRBNB', 'BOOKING', 'VRBO', 'DIRETO', 'OUTRA')),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(16) CHECK (payment_method IN (
    'PLATAFORMA', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'TRANSFERENCIA', 'BOLETO', 'OUTRO')),
  -- Soma dos custos (reservation_costs), guardada para os totais da listagem
  ADD COLUMN IF NOT EXISTS costs_cents    BIGINT NOT NULL DEFAULT 0 CHECK (costs_cents >= 0);

-- Custos e taxas descontados do valor bruto (faxina, limpeza, reposição...)
CREATE TABLE IF NOT EXISTS reservation_costs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID         NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  position        SMALLINT     NOT NULL,
  description     VARCHAR(120) NOT NULL,
  amount_cents    BIGINT       NOT NULL CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS reservation_costs_reservation_idx ON reservation_costs (reservation_id, position);

-- Documentos e fotos da reserva (arquivo em disco, caminho relativo a UPLOADS_DIR)
CREATE TABLE IF NOT EXISTS reservation_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID         NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  category        VARCHAR(12)  NOT NULL CHECK (category IN ('CONTRATO', 'CHECKIN', 'CHECKOUT', 'OUTRO')),
  file_name       VARCHAR(200) NOT NULL,
  file_path       VARCHAR(255) NOT NULL,
  mime            VARCHAR(40)  NOT NULL,
  size_bytes      INTEGER      NOT NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reservation_attachments_reservation_idx ON reservation_attachments (reservation_id, created_at);
