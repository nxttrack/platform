do $$
begin
  create role anon nologin;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create role authenticated nologin;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create role service_role nologin bypassrls;
exception
  when duplicate_object then null;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select null::uuid;
$$;

drop schema if exists public cascade;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
