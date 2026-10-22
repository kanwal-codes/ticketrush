-- An event can show a designed poster image instead of the generated one. Only files the web app itself serves under
-- /posters/ are allowed, so a poster can never point at another site.
alter table event add column poster_image varchar(200);
alter table event add constraint ck_event_poster_image
    check (poster_image is null or poster_image ~ '^/posters/[a-z0-9-]+\.webp$');
