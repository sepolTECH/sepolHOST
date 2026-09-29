-- Lista negra: hóspedes bloqueados por problemas em hospedagens (um registro por hóspede)
CREATE TABLE IF NOT EXISTS guest_blocks (
  guest_id        UUID        PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  reason          TEXT        NOT NULL,
  -- Reserva/avaliação que motivou o bloqueio (opcional)
  reservation_id  UUID        REFERENCES reservations(id) ON DELETE SET NULL,
  blocked_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  blocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS guest_blocks_blocked_at_idx ON guest_blocks (blocked_at DESC);
