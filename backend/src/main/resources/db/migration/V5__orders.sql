-- An order is one attempt to pay for a hold. Tickets exist only for paid orders.
create table ticket_order (
    id             bigint generated always as identity primary key,
    public_ref     varchar(12)  not null unique,
    event_id       bigint       not null references event (id),
    user_id        bigint       not null references app_user (id),
    hold_id        bigint       not null references seat_hold (id),
    status         varchar(20)  not null,
    subtotal_cents bigint       not null check (subtotal_cents > 0),
    fee_cents      bigint       not null check (fee_cents >= 0),
    total_cents    bigint       not null check (total_cents > 0),
    currency       varchar(3)   not null default 'CAD',
    payment_ref    varchar(80),
    failure_reason varchar(200),
    created_at     timestamptz  not null,
    paid_at        timestamptz,
    constraint ck_order_status check (status in ('PENDING_PAYMENT', 'PAID', 'FAILED', 'REFUNDING', 'REFUNDED')),
    constraint ck_order_total check (total_cents = subtotal_cents + fee_cents)
);

-- One order in flight or paid per hold. Failed and refunded orders do not count, so a guest can try another card.
create unique index uq_order_live_hold on ticket_order (hold_id)
    where status in ('PENDING_PAYMENT', 'PAID', 'REFUNDING');
create index ix_order_user on ticket_order (user_id, id desc);
create index ix_order_pending on ticket_order (created_at) where status in ('PENDING_PAYMENT', 'REFUNDING');

create table ticket (
    id         bigint generated always as identity primary key,
    order_id   bigint      not null references ticket_order (id),
    event_id   bigint      not null references event (id),
    user_id    bigint      not null references app_user (id),
    seat_id    bigint      not null references venue_seat (id),
    code       varchar(32) not null unique,
    face_cents int         not null check (face_cents > 0),
    fee_cents  int         not null check (fee_cents >= 0),
    status     varchar(10) not null default 'ISSUED',
    used_at    timestamptz,
    created_at timestamptz not null,
    constraint ck_ticket_status check (status in ('ISSUED', 'USED', 'VOID'))
);

-- A seat can never have two live tickets, whatever the code above does.
create unique index uq_ticket_live_seat on ticket (event_id, seat_id) where status <> 'VOID';
create index ix_ticket_user on ticket (user_id, id desc);
create index ix_ticket_order on ticket (order_id);

-- Remembers each guest's Idempotency-Key and what it was for, so a retry gets the original answer.
create table idempotency_key (
    id           bigint generated always as identity primary key,
    user_id      bigint      not null references app_user (id),
    idem_key     varchar(64) not null,
    request_hash varchar(64) not null,
    order_id     bigint references ticket_order (id),
    created_at   timestamptz not null,
    constraint uq_idempotency unique (user_id, idem_key)
);

-- Things that must happen after a payment, written in the same transaction as the payment itself.
create table outbox_event (
    id           bigint generated always as identity primary key,
    type         varchar(40) not null,
    aggregate_id bigint      not null,
    payload      text        not null,
    created_at   timestamptz not null,
    published_at timestamptz,
    attempts     int         not null default 0,
    last_error   varchar(500)
);

create index ix_outbox_unpublished on outbox_event (id) where published_at is null;

-- Stands in for sending an email: one row per order and kind.
create table sent_email (
    id         bigint generated always as identity primary key,
    order_id   bigint       not null references ticket_order (id),
    kind       varchar(30)  not null,
    to_email   varchar(254) not null,
    subject    varchar(200) not null,
    body       text         not null,
    created_at timestamptz  not null,
    constraint uq_sent_email unique (order_id, kind)
);
