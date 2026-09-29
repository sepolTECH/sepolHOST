-- Dependentes: acompanhantes das reservas guardados no cadastro do hóspede responsável.
-- Têm só nome e documento; são gravados automaticamente ao salvar uma reserva.

-- Documento "comparável": só letras/números em maiúsculas (null se tiver menos de 5 caracteres)
CREATE OR REPLACE FUNCTION dependent_doc_key(doc TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(k) >= 5 THEN k END
    FROM (SELECT regexp_replace(UPPER(COALESCE(doc, '')), '[^0-9A-Z]', '', 'g') AS k) s
$$;

-- Chave que evita duplicar o mesmo dependente no mesmo responsável:
-- pelo documento quando houver; senão (ex.: criança sem documento), pelo nome
CREATE OR REPLACE FUNCTION dependent_dedupe_key(name TEXT, doc TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE('D:' || dependent_doc_key(doc), 'N:' || UPPER(regexp_replace(btrim(name), '\s+', ' ', 'g')))
$$;

CREATE TABLE IF NOT EXISTS guest_dependents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  main_guest_id       UUID         NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  full_name           VARCHAR(160) NOT NULL,
  document            VARCHAR(30),           -- como foi digitado na reserva
  document_key        VARCHAR(30),           -- dependent_doc_key(document)
  dedupe_key          TEXT         NOT NULL, -- dependent_dedupe_key(full_name, document)
  age_group           VARCHAR(6)   NOT NULL CHECK (age_group IN ('ADULT', 'CHILD')),
  last_reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_dependents_unique ON guest_dependents (main_guest_id, dedupe_key);
-- Consulta "este documento já é dependente de alguém?"
CREATE INDEX IF NOT EXISTS guest_dependents_document_idx ON guest_dependents (document_key) WHERE document_key IS NOT NULL;

-- Carga inicial: acompanhantes das reservas já cadastradas (fica o dado da reserva mais recente).
-- Ignora o acompanhante com o mesmo documento do próprio responsável.
INSERT INTO guest_dependents (main_guest_id, full_name, document, document_key, dedupe_key, age_group,
                              last_reservation_id, created_at, updated_at)
SELECT DISTINCT ON (x.main_guest_id, x.dedupe_key)
       x.main_guest_id, x.full_name, x.document, x.document_key, x.dedupe_key, x.age_group,
       x.reservation_id, x.created_at, x.updated_at
  FROM (
    SELECT r.main_guest_id, rg.full_name, rg.document, dependent_doc_key(rg.document) AS document_key,
           dependent_dedupe_key(rg.full_name, rg.document) AS dedupe_key, rg.age_group,
           r.id AS reservation_id, r.created_at, r.updated_at, r.check_in, g.document_number
      FROM reservation_guests rg
      JOIN reservations r ON r.id = rg.reservation_id
      JOIN guests g ON g.id = r.main_guest_id
  ) x
 WHERE x.document_key IS DISTINCT FROM x.document_number
 ORDER BY x.main_guest_id, x.dedupe_key, x.check_in DESC, x.updated_at DESC
ON CONFLICT (main_guest_id, dedupe_key) DO NOTHING;
