-- Hóspedes (Cadastro > Hóspedes)
CREATE TABLE IF NOT EXISTS guests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           VARCHAR(160) NOT NULL,
  person_type         VARCHAR(2)   NOT NULL CHECK (person_type IN ('PF', 'PJ')),
  nationality         VARCHAR(80)  NOT NULL,
  document_type       VARCHAR(12)  NOT NULL CHECK (document_type IN ('CPF', 'PASSAPORTE', 'CNPJ')),
  -- Guardado sem máscara: CPF 11 dígitos, CNPJ 14 caracteres, passaporte em maiúsculas
  document_number     VARCHAR(20)  NOT NULL,
  -- Só dígitos, com "+" opcional no início (DDI)
  phone               VARCHAR(20)  NOT NULL,
  reservation_number  VARCHAR(40)  NOT NULL,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- PJ sempre usa CNPJ; PF usa CPF ou passaporte
  CONSTRAINT guests_doc_matches_type CHECK (
    (person_type = 'PJ' AND document_type = 'CNPJ') OR
    (person_type = 'PF' AND document_type IN ('CPF', 'PASSAPORTE'))
  )
);

-- Um mesmo documento não pode ser cadastrado duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS guests_document_unique ON guests (document_type, document_number);
CREATE INDEX IF NOT EXISTS guests_created_at_idx ON guests (created_at DESC);
CREATE INDEX IF NOT EXISTS guests_reservation_idx ON guests (reservation_number);
