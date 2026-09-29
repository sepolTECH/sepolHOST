-- Hóspedes: estrangeiro (passaporte/DNI), RG, e-mail, endereço, observações e foto do documento

-- Remove os CHECKs antigos que envolvem document_type (vamos recriá-los com DNI e is_foreign)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'guests'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%document_type%'
  LOOP
    EXECUTE format('ALTER TABLE guests DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS is_foreign          BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rg                  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email               VARCHAR(160),
  ADD COLUMN IF NOT EXISTS address_zip         VARCHAR(12),
  ADD COLUMN IF NOT EXISTS address_street      VARCHAR(160),
  ADD COLUMN IF NOT EXISTS address_number      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address_complement  VARCHAR(80),
  ADD COLUMN IF NOT EXISTS address_district    VARCHAR(80),
  ADD COLUMN IF NOT EXISTS address_city        VARCHAR(80),
  ADD COLUMN IF NOT EXISTS address_state       VARCHAR(40),
  ADD COLUMN IF NOT EXISTS address_country     VARCHAR(80),
  -- Observações internas: visíveis só para a equipe
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  -- Caminho relativo à pasta de uploads (UPLOADS_DIR)
  ADD COLUMN IF NOT EXISTS document_photo_path VARCHAR(255),
  ADD COLUMN IF NOT EXISTS document_photo_mime VARCHAR(40);

-- Quem já foi cadastrado com passaporte passa a ser estrangeiro
UPDATE guests SET is_foreign = TRUE WHERE person_type = 'PF' AND document_type = 'PASSAPORTE';

ALTER TABLE guests
  ADD CONSTRAINT guests_document_type_check CHECK (document_type IN ('CPF', 'PASSAPORTE', 'DNI', 'CNPJ')),
  -- PJ: CNPJ | PF brasileiro: CPF | PF estrangeiro: passaporte ou DNI
  ADD CONSTRAINT guests_doc_matches_type CHECK (
    (person_type = 'PJ' AND NOT is_foreign AND document_type = 'CNPJ') OR
    (person_type = 'PF' AND NOT is_foreign AND document_type = 'CPF') OR
    (person_type = 'PF' AND is_foreign AND document_type IN ('PASSAPORTE', 'DNI'))
  );

CREATE INDEX IF NOT EXISTS guests_email_idx ON guests (LOWER(email));
