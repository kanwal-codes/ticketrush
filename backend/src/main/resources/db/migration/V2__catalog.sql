create table venue (
    id         bigint generated always as identity primary key,
    name       varchar(120) not null,
    city       varchar(80)  not null,
    created_at timestamptz  not null default now()
);

create table venue_section (
    id         bigint generated always as identity primary key,
    venue_id   bigint      not null references venue (id),
    name       varchar(60) not null,
    sort_order int         not null,
    constraint uq_venue_section_name unique (venue_id, name)
);

create table venue_seat (
    id          bigint generated always as identity primary key,
    section_id  bigint      not null references venue_section (id),
    row_label   varchar(4)  not null,
    seat_number int         not null check (seat_number > 0),
    constraint uq_venue_seat unique (section_id, row_label, seat_number)
);

create table event (
    id            bigint generated always as identity primary key,
    organizer_id  bigint       not null references app_user (id),
    venue_id      bigint       not null references venue (id),
    title         varchar(160) not null,
    artist        varchar(120) not null,
    description   text         not null default '',
    starts_at     timestamptz  not null,
    doors_at      timestamptz  not null,
    drop_opens_at timestamptz  not null,
    on_sale_at    timestamptz  not null,
    status        varchar(20)  not null default 'DRAFT',
    poster_style  varchar(20)  not null,
    ink_one       varchar(7)   not null,
    ink_two       varchar(7)   not null,
    paper_color   varchar(7)   not null,
    created_at    timestamptz  not null default now(),
    constraint ck_event_status check (status in ('DRAFT', 'PUBLISHED', 'CANCELLED')),
    constraint ck_event_poster check (poster_style in ('ORBIT', 'SUN', 'CURTAIN', 'AURORA', 'PITCH', 'VINYL')),
    constraint ck_event_times check (drop_opens_at <= on_sale_at and on_sale_at < starts_at and doors_at <= starts_at),
    constraint ck_event_colors check (
        ink_one ~ '^#[0-9A-Fa-f]{6}$' and ink_two ~ '^#[0-9A-Fa-f]{6}$' and paper_color ~ '^#[0-9A-Fa-f]{6}$')
);

create index ix_event_status_start on event (status, starts_at);

create table event_price (
    id          bigint generated always as identity primary key,
    event_id    bigint not null references event (id),
    section_id  bigint not null references venue_section (id),
    price_cents int    not null check (price_cents > 0),
    constraint uq_event_price unique (event_id, section_id)
);

-- One row per seat per event. Created when the event is published; Phase 3 adds hold columns.
create table event_seat (
    event_id bigint      not null references event (id),
    seat_id  bigint      not null references venue_seat (id),
    status   varchar(12) not null default 'AVAILABLE',
    primary key (event_id, seat_id),
    constraint ck_event_seat_status check (status in ('AVAILABLE', 'HELD', 'SOLD'))
);

create index ix_event_seat_status on event_seat (event_id, status);
