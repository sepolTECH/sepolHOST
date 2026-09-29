-- Extensões de hospedagem: trechos contínuos adicionados depois do check-out original

CREATE TABLE IF NOT EXISTS reservation_extensions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id    UUID        NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  position          SMALLINT    NOT NULL,
  start_date        DATE        NOT NULL, -- = check-out anterior
  check_out         DATE        NOT NULL, -- novo check-out
  nights            SMALLINT    NOT NULL CHECK (nights > 0),
  -- PLATAFORMA: valor pela diária da reserva, com comissão | DIRETO: valor informado, sem comissão
  channel           VARCHAR(10) NOT NULL CHECK (channel IN ('PLATAFORMA', 'DIRETO')),
  payment_method    VARCHAR(16) CHECK (payment_method IN (
    'PLATAFORMA', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'TRANSFERENCIA', 'BOLETO', 'OUTRO')),
  amount_cents      BIGINT      NOT NULL CHECK (amount_cents >= 0),
  commission_cents  BIGINT      NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
  CONSTRAINT reservation_extensions_dates_ok CHECK (check_out > start_date),
  CONSTRAINT reservation_extensions_direct_no_commission CHECK (channel = 'PLATAFORMA' OR commission_cents = 0)
);
CREATE INDEX IF NOT EXISTS reservation_extensions_reservation_idx ON reservation_extensions (reservation_id, position);

-- Somas guardadas na reserva para a listagem e os totais
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS extensions_cents            BIGINT NOT NULL DEFAULT 0 CHECK (extensions_cents >= 0),
  ADD COLUMN IF NOT EXISTS extensions_commission_cents BIGINT NOT NULL DEFAULT 0 CHECK (extensions_commission_cents >= 0),
  -- Check-out efetivo (último check-out das extensões, ou o original)
  ADD COLUMN IF NOT EXISTS final_check_out             DATE;

UPDATE reservations SET final_check_out = check_out WHERE final_check_out IS NULL;
ALTER TABLE reservations ALTER COLUMN final_check_out SET NOT NULL;
ALTER TABLE reservations ADD CONSTRAINT reservations_final_check_out_ok CHECK (final_check_out >= check_out);
