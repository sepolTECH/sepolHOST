CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  password_hash   TEXT         NOT NULL,
  role            VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- E-mail único sem diferenciar maiúsculas/minúsculas
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (LOWER(email));
