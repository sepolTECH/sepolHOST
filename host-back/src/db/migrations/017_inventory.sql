-- Inventário do imóvel + vistoria por reserva.
--
-- O imóvel é identificado pelo nome usado nas reservas (property_name), comparado sem
-- diferenciar maiúsculas/espaços nas pontas (LOWER(BTRIM(...))) — mesmo critério das despesas.

-- Itens cadastrados por imóvel (modelo). Valor unitário em centavos.
CREATE TABLE IF NOT EXISTS inventory_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_name  VARCHAR(120) NOT NULL,
  name           VARCHAR(120) NOT NULL,
  quantity       INTEGER      NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 9999),
  value_cents    BIGINT       NOT NULL DEFAULT 0 CHECK (value_cents >= 0),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_items_owner_property_idx
  ON inventory_items (owner_id, LOWER(BTRIM(property_name)));

-- Situação da vistoria de cada reserva
--   inventory_status: PENDENTE (padrão) | VISTORIADO
--   inventory_loaded: true quando a reserva já recebeu a cópia dos itens do imóvel
--                     (reservas criadas antes de o imóvel ter inventário recebem a cópia ao abrir)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS inventory_status VARCHAR(10) NOT NULL DEFAULT 'PENDENTE'
    CHECK (inventory_status IN ('PENDENTE', 'VISTORIADO')),
  ADD COLUMN IF NOT EXISTS inventory_loaded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inspected_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Itens da reserva: cópia do inventário do imóvel, que pode ser alterada só nesta reserva
CREATE TABLE IF NOT EXISTS reservation_inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID         NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  quantity        INTEGER      NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 9999),
  value_cents     BIGINT       NOT NULL DEFAULT 0 CHECK (value_cents >= 0),
  checked         BOOLEAN      NOT NULL DEFAULT FALSE,
  checked_at      TIMESTAMPTZ,
  checked_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reservation_inventory_items_reservation_idx
  ON reservation_inventory_items (reservation_id);
