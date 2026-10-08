-- Who made a venue, so an organizer's console lists their own. Older venues are given to the organizer of their
-- first event; a venue nobody used stays unowned and simply does not appear in anyone's list.
alter table venue add column owner_id bigint references app_user (id);
update venue v set owner_id = (select e.organizer_id from event e where e.venue_id = v.id order by e.id limit 1);
create index ix_venue_owner on venue (owner_id);

-- Every ticket presented at a door, accepted or not, so the organizer can see what happened. event_id is the event
-- the door was working (or the ticket's own event when the scanner did not say).
create table scan_attempt (
    id         bigint generated always as identity primary key,
    event_id   bigint      not null references event (id),
    scanner_id bigint      not null references app_user (id),
    code       varchar(64) not null,
    outcome    varchar(16) not null,
    seat       varchar(80),
    at         timestamptz not null,
    constraint ck_scan_outcome check (outcome in ('VALID', 'ALREADY_USED', 'WRONG_EVENT', 'UNKNOWN'))
);
create index ix_scan_event on scan_attempt (event_id, at desc, id desc);

-- The console counts tickets and orders per event.
create index ix_ticket_event_status on ticket (event_id, status);
create index ix_order_event_status on ticket_order (event_id, status);
