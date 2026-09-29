-- O número da reserva sai do cadastro de hóspedes (fica só em Reservas).
-- A coluna é mantida como opcional para não perder os dados já gravados;
-- se não precisar mais deles, pode removê-la depois com:
--   ALTER TABLE guests DROP COLUMN reservation_number;
ALTER TABLE guests ALTER COLUMN reservation_number DROP NOT NULL;
DROP INDEX IF EXISTS guests_reservation_idx;
