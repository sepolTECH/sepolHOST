-- Calendário: links iCal (.ics) das plataformas onde o imóvel é anunciado.
-- Apenas leitura: o sistema baixa os calendários e junta tudo numa única visão.
CREATE TABLE IF NOT EXISTS calendar_feeds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(80)  NOT NULL,
  platform        VARCHAR(12)  NOT NULL CHECK (platform IN ('AIRBNB', 'BOOKING', 'VRBO', 'DIRETO', 'OUTRA')),
  url             TEXT         NOT NULL,
  color           VARCHAR(7)   NOT NULL DEFAULT '#525252' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Imóvel (opcional): ajuda a cruzar com as reservas cadastradas no sistema
  property_name   VARCHAR(120),
  active          BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Resultado da última sincronização
  last_sync_at    TIMESTAMPTZ,
  last_error      TEXT,
  last_events     INTEGER,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calendar_feeds_created_idx ON calendar_feeds (created_at);
