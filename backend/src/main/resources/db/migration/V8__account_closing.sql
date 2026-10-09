-- A closed account keeps its row (orders refer to it) but loses its name, address and password; this says when.
alter table app_user add column deleted_at timestamptz;
