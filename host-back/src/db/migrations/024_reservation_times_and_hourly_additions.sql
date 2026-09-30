-- Horários de entrada/saída da reserva e valores adicionais cobrados por hora.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS check_in_time  TIME,
  ADD COLUMN IF NOT EXISTS check_out_time TIME;

-- kind: VALOR (valor digitado) | HORAS (horas adicionais; o valor é calculado pelo valor da hospedagem)
ALTER TABLE reservation_additions
  ADD COLUMN IF NOT EXISTS kind  VARCHAR(5) NOT NULL DEFAULT 'VALOR' CHECK (kind IN ('VALOR', 'HORAS')),
  ADD COLUMN IF NOT EXISTS hours NUMERIC(4,1) CHECK (hours IS NULL OR hours > 0);
