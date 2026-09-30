-- Hóspedes: documento (CPF/passaporte/DNI) passa a ser opcional.
--
-- Por causa da LGPD nem sempre o hóspede concorda em informar o CPF. Sem documento,
-- a duplicidade é evitada pelo nome, telefone e e-mail (consulta feita no cadastro).
-- CNPJ continua obrigatório para pessoa jurídica.

ALTER TABLE guests ALTER COLUMN document_type   DROP NOT NULL;
ALTER TABLE guests ALTER COLUMN document_number DROP NOT NULL;

ALTER TABLE guests DROP CONSTRAINT IF EXISTS guests_document_type_check;
ALTER TABLE guests DROP CONSTRAINT IF EXISTS guests_doc_matches_type;

ALTER TABLE guests
  ADD CONSTRAINT guests_document_type_check
    CHECK (document_type IS NULL OR document_type IN ('CPF', 'PASSAPORTE', 'DNI', 'CNPJ')),
  ADD CONSTRAINT guests_doc_matches_type CHECK (
    -- sem documento: só pessoa física, e tipo e número ficam vazios juntos
    (document_type IS NULL AND document_number IS NULL AND person_type = 'PF') OR
    -- PJ: CNPJ | PF brasileiro: CPF | PF estrangeiro: passaporte ou DNI
    (person_type = 'PJ' AND NOT is_foreign AND document_type = 'CNPJ' AND document_number IS NOT NULL) OR
    (person_type = 'PF' AND NOT is_foreign AND document_type = 'CPF' AND document_number IS NOT NULL) OR
    (person_type = 'PF' AND is_foreign AND document_type IN ('PASSAPORTE', 'DNI') AND document_number IS NOT NULL)
  );

-- O índice único (owner_id, document_type, document_number) continua valendo:
-- o Postgres trata NULL como valor distinto, então vários cadastros sem documento são permitidos.

-- Índices de apoio à consulta de duplicidade (por cliente)
CREATE INDEX IF NOT EXISTS guests_owner_email_idx ON guests (owner_id, LOWER(email));
