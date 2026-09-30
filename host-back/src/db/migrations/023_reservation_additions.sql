-- Valores adicionais da reserva: dinheiro A RECEBER além do valor da reserva e das extensões
-- (ex.: hóspede extra, pet, late check-out). É o oposto dos custos: soma ao valor bruto.
-- Cobrado direto do hóspede, então não tem comissão da plataforma.

ALTER TABLE reservations
  -- Soma dos valores adicionais (reservation_additions), guardada para os totais e relatórios
  ADD COLUMN IF NOT EXISTS additions_cents BIGINT NOT NULL DEFAULT 0 CHECK (additions_cents >= 0);

CREATE TABLE IF NOT EXISTS reservation_additions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID         NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  position        SMALLINT     NOT NULL,
  description     VARCHAR(120) NOT NULL,
  amount_cents    BIGINT       NOT NULL CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS reservation_additions_reservation_idx ON reservation_additions (reservation_id, position);
