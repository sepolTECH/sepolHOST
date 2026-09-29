-- Reservas (Cadastro > Reservas)
CREATE TABLE IF NOT EXISTS reservations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_number  VARCHAR(40)  NOT NULL,
  -- Hóspede responsável (vem do cadastro de hóspedes)
  main_guest_id       UUID         NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
  property_name       VARCHAR(120) NOT NULL,
  guests_count        SMALLINT     NOT NULL CHECK (guests_count BETWEEN 1 AND 50),
  booked_at           DATE         NOT NULL,
  check_in            DATE         NOT NULL,
  check_out           DATE         NOT NULL,
  status              VARCHAR(12)  NOT NULL DEFAULT 'VAZIO' CHECK (status IN ('VAZIO', 'HOSPEDADO', 'CONCLUIDO')),
  -- Valores em centavos (evita erro de arredondamento com float)
  amount_cents        BIGINT       NOT NULL CHECK (amount_cents >= 0),
  commission_type     VARCHAR(8)   NOT NULL DEFAULT 'PERCENT' CHECK (commission_type IN ('PERCENT', 'VALUE')),
  commission_rate     NUMERIC(5,2) CHECK (commission_rate BETWEEN 0 AND 100),
  commission_cents    BIGINT       NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT reservations_dates_ok CHECK (check_out > check_in),
  CONSTRAINT reservations_commission_ok CHECK (commission_cents <= amount_cents)
);

CREATE UNIQUE INDEX IF NOT EXISTS reservations_number_unique ON reservations (LOWER(reservation_number));
CREATE INDEX IF NOT EXISTS reservations_check_in_idx ON reservations (check_in DESC);
CREATE INDEX IF NOT EXISTS reservations_main_guest_idx ON reservations (main_guest_id);

-- Acompanhantes da reserva (o responsável fica em reservations.main_guest_id)
CREATE TABLE IF NOT EXISTS reservation_guests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID         NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  position        SMALLINT     NOT NULL,
  full_name       VARCHAR(160) NOT NULL,
  document        VARCHAR(30),
  age_group       VARCHAR(6)   NOT NULL CHECK (age_group IN ('ADULT', 'CHILD'))
);

CREATE INDEX IF NOT EXISTS reservation_guests_reservation_idx ON reservation_guests (reservation_id, position);
