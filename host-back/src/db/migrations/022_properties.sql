-- Cadastro de imóveis (Ajustes > Imóveis).
--
-- Até aqui o imóvel era só um texto digitado em cada reserva. Agora o cliente cadastra os imóveis
-- uma vez e escolhe em uma lista. Reservas, inventário, despesas e calendário continuam ligados ao
-- imóvel pelo NOME (property_name, comparado com LOWER(BTRIM(...))), então nada do que já existe
-- precisa ser migrado. Renomear o imóvel aqui atualiza o nome nessas tabelas (ver properties.service).

CREATE TABLE IF NOT EXISTS properties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  address     VARCHAR(200),
  city        VARCHAR(80),
  state       VARCHAR(2),
  notes       VARCHAR(500),
  -- Imóvel desativado some das listas de escolha, mas o histórico continua intacto
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Nome único por cliente (sem diferenciar maiúsculas nem espaços nas pontas)
CREATE UNIQUE INDEX IF NOT EXISTS properties_owner_name_unique
  ON properties (owner_id, LOWER(BTRIM(name)));

-- Importa os imóveis que o cliente já usa hoje (reservas, inventário, despesas e calendário),
-- para que nada deixe de aparecer nas listas depois da mudança.
INSERT INTO properties (owner_id, name)
SELECT DISTINCT ON (owner_id, LOWER(BTRIM(p))) owner_id, BTRIM(p)
  FROM (
    SELECT owner_id, property_name AS p FROM reservations
    UNION ALL SELECT owner_id, property_name FROM inventory_items
    UNION ALL SELECT owner_id, property_name FROM recurring_expenses
    UNION ALL SELECT owner_id, property_name FROM month_expenses
    UNION ALL SELECT owner_id, property_name FROM calendar_feeds
  ) x
 WHERE p IS NOT NULL AND BTRIM(p) <> ''
 ORDER BY owner_id, LOWER(BTRIM(p)), BTRIM(p)
ON CONFLICT DO NOTHING;
