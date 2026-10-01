-- Ajustes > Valores padrão: cadastro de "valores adicionais a receber" (ex.: hóspede extra, pet) e de
-- "custos e taxas" (ex.: faxina) com um valor sugerido.
--
-- A reserva continua guardando o próprio texto e valor (reservation_additions / costs), então mudar o valor
-- aqui NÃO altera reservas já cadastradas: ele só é sugerido ao escolher o item numa reserva nova,
-- e pode ser alterado na própria reserva.

CREATE TABLE IF NOT EXISTS reservation_presets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         VARCHAR(8)   NOT NULL CHECK (kind IN ('ADDITION', 'COST')),
  name         VARCHAR(120) NOT NULL,
  amount_cents BIGINT       NOT NULL CHECK (amount_cents > 0),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Nome único por cliente e tipo (sem diferenciar maiúsculas nem espaços nas pontas)
CREATE UNIQUE INDEX IF NOT EXISTS reservation_presets_owner_kind_name_unique
  ON reservation_presets (owner_id, kind, LOWER(BTRIM(name)));
