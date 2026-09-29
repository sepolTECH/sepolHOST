-- Associados: funcionários / diaristas cadastrados por um cliente.
-- Têm login próprio (e-mail + senha), mas só enxergam Inventário (vistoria) e Avaliação
-- das reservas que o cliente liberou para eles.

-- Novo papel 'associate'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'associate'));

-- Cliente (dono) ao qual o associado pertence. Só preenchido quando role = 'associate'.
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE users
  ADD CONSTRAINT users_associate_owner_check CHECK ((role = 'associate') = (owner_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS users_owner_idx ON users (owner_id) WHERE owner_id IS NOT NULL;

-- Reservas liberadas para cada associado
CREATE TABLE IF NOT EXISTS associate_reservation_access (
  associate_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reservation_id  UUID        NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  granted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (associate_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS associate_access_reservation_idx
  ON associate_reservation_access (reservation_id);
