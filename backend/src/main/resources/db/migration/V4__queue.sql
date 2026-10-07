-- Hot drops get a waiting room. Events without it behave as before.
alter table event add column queue_enabled boolean not null default false;
