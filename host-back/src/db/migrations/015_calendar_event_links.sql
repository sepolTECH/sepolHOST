-- Vínculo manual entre uma marcação do link iCal e uma reserva do cadastro.
-- reservation_id NULL = "não vincular" (desfaz um vínculo automático).
CREATE TABLE IF NOT EXISTS calendar_event_links (
  feed_id         UUID        NOT NULL REFERENCES calendar_feeds(id) ON DELETE CASCADE,
  -- UID do evento no iCal (estável entre sincronizações) ou "início|fim" quando a plataforma não manda UID
  event_key       TEXT        NOT NULL,
  reservation_id  UUID        REFERENCES reservations(id) ON DELETE CASCADE,
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (feed_id, event_key)
);

-- Cada reserva fica ligada a no máximo uma marcação
CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_links_reservation_unique
  ON calendar_event_links (reservation_id) WHERE reservation_id IS NOT NULL;
