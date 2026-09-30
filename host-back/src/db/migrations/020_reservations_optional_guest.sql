-- Reservas: o hóspede responsável passa a ser opcional.
--
-- Dá para cadastrar só a reserva (imóvel, datas, valores...) sem vincular uma pessoa.
-- O vínculo pode ser feito depois, editando a reserva.
--
-- A FK composta (main_guest_id, owner_id) continua valendo: com main_guest_id nulo o Postgres
-- não confere a referência, e quando há hóspede ele segue obrigatoriamente do mesmo cliente.

ALTER TABLE reservations ALTER COLUMN main_guest_id DROP NOT NULL;
