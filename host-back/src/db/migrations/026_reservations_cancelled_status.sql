-- Reserva cancelada: novo status CANCELADO.
-- A reserva continua na lista com todos os dados, mas não entra nas finanças, na vistoria nem nas avaliações.

-- Troca a restrição de status (o nome gerado pelo Postgres pode variar, então procura pela definição)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'reservations'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%VAZIO%'
  LOOP
    EXECUTE format('ALTER TABLE reservations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check CHECK (status IN ('VAZIO', 'HOSPEDADO', 'CONCLUIDO', 'CANCELADO'));
