-- Avaliação interna da hospedagem (uma por reserva): controle da equipe antes de alugar de novo
CREATE TABLE IF NOT EXISTS reservation_reviews (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id       UUID        NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
  cleanliness_rating   SMALLINT    NOT NULL CHECK (cleanliness_rating BETWEEN 1 AND 5),   -- limpeza
  communication_rating SMALLINT    NOT NULL CHECK (communication_rating BETWEEN 1 AND 5), -- comunicação
  rules_rating         SMALLINT    NOT NULL CHECK (rules_rating BETWEEN 1 AND 5),         -- cumprimento de regras
  notes                TEXT,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
