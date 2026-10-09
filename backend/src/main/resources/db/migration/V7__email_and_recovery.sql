-- Accounts that exist today count as confirmed; new guests start unconfirmed when the app can really send email.
alter table app_user add column email_verified boolean not null default true;
alter table app_user add column password_changed_at timestamptz;

-- Links sent by email. Only a hash of the secret is kept, so a leaked table cannot be used to sign in.
create table email_token (
    id         bigint generated always as identity primary key,
    user_id    bigint      not null references app_user (id),
    kind       varchar(10) not null,
    token_hash varchar(64) not null,
    created_at timestamptz not null,
    expires_at timestamptz not null,
    used_at    timestamptz,
    constraint ck_email_token_kind check (kind in ('VERIFY', 'RESET'))
);
create unique index uq_email_token_hash on email_token (token_hash);
create index ix_email_token_user on email_token (user_id, kind, created_at desc);

-- The table of "sent" messages becomes a real outbox: a relay sends what is not yet sent and retries failures.
alter table sent_email add column sent_at timestamptz;
alter table sent_email add column attempts int not null default 0;
alter table sent_email add column last_error varchar(500);
update sent_email set sent_at = created_at;
