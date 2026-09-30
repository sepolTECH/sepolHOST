-- Ajustes > Taxas: comissão padrão cobrada por cada plataforma (por cliente).
--
-- A reserva continua guardando a própria comissão (tipo, % e R$), então alterar a taxa aqui
-- NÃO muda reservas já cadastradas: o valor só é sugerido no cadastro de novas reservas.

CREATE TABLE IF NOT EXISTS platform_fees (
  owner_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        VARCHAR(12)  NOT NULL CHECK (platform IN ('AIRBNB', 'BOOKING', 'VRBO', 'DIRETO', 'OUTRA')),
  commission_rate NUMERIC(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, platform)
);
