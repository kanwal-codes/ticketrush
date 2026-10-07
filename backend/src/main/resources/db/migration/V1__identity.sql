create table app_user (
    id            bigint generated always as identity primary key,
    email         varchar(254) not null,
    password_hash varchar(100) not null,
    display_name  varchar(80)  not null,
    role          varchar(20)  not null,
    created_at    timestamptz  not null default now(),
    constraint ck_app_user_role check (role in ('GUEST', 'ORGANIZER'))
);

-- Emails are unique ignoring case, so "Dana@x.org" and "dana@x.org" are one account.
create unique index uq_app_user_email on app_user (lower(email));
