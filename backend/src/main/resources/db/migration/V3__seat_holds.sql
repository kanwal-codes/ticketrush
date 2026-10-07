-- A hold is a guest's temporary claim on a set of seats for one event.
create table seat_hold (
    id         bigint generated always as identity primary key,
    event_id   bigint      not null references event (id),
    user_id    bigint      not null references app_user (id),
    status     varchar(12) not null default 'ACTIVE',
    seat_count int         not null check (seat_count > 0),
    created_at timestamptz not null,
    expires_at timestamptz not null,
    constraint ck_seat_hold_status check (status in ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONVERTED'))
);

-- At most one active hold per guest per event, enforced by the database and not only by the code.
create unique index uq_seat_hold_active on seat_hold (event_id, user_id) where status = 'ACTIVE';

alter table event_seat
    add column hold_id    bigint references seat_hold (id),
    add column held_until timestamptz;

-- A HELD seat always says who holds it and until when. An AVAILABLE seat never does.
alter table event_seat
    add constraint ck_event_seat_held check (status <> 'HELD' or (hold_id is not null and held_until is not null)),
    add constraint ck_event_seat_available check (status <> 'AVAILABLE' or (hold_id is null and held_until is null));

create index ix_event_seat_hold on event_seat (hold_id) where hold_id is not null;
create index ix_event_seat_expiry on event_seat (held_until) where status = 'HELD';
