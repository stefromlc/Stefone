-- ─────────────────────────────────────────────────────────────
--  Stefone Kids — Supabase schema (cloud sync)
--  Run this once in Supabase → SQL Editor → New query → Run.
--  Safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- Family members (one row per login)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin', 'parent', 'child')),
  email text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Everything else (lessons, assignments, progress, chats, documents, settings…)
create table if not exists public.records (
  collection text not null,
  id text not null,
  child_id text,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (collection, id)
);
create index if not exists records_collection_child on public.records (collection, child_id);
create index if not exists records_data_gin on public.records using gin (data jsonb_path_ops);

-- Helper: the signed-in user's role
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Lets the login page know whether first-time setup is needed (returns only true/false)
create or replace function public.family_exists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles)
$$;

-- First person to run setup becomes the administrator. Fails once an admin exists.
create or replace function public.claim_admin(p_name text, p_email text, p_data jsonb default '{}'::jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.profiles) then raise exception 'This family is already set up. Ask the administrator to add you.'; end if;
  insert into public.profiles (id, name, role, email, data) values (auth.uid(), p_name, 'admin', p_email, coalesce(p_data, '{}'::jsonb));
  return true;
end $$;

revoke all on function public.claim_admin(text, text, jsonb) from public;
grant execute on function public.claim_admin(text, text, jsonb) to authenticated;
grant execute on function public.family_exists() to anon, authenticated;
grant execute on function public.my_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.records enable row level security;

-- profiles: any family member can see the family list; only the admin can change it
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.my_role() is not null);
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- records: read
--   parents/admin: everything
--   children: shared records (child_id is null: lessons, settings, spelling lists) + their own
drop policy if exists records_read on public.records;
create policy records_read on public.records for select to authenticated using (
  public.my_role() in ('admin', 'parent')
  or (public.my_role() = 'child' and (child_id is null or child_id = auth.uid()::text))
);

-- records: write
--   admin: everything
--   parent: everything except settings
--   child: only their own work/progress collections
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (
  public.my_role() = 'admin'
  or (public.my_role() = 'parent' and collection <> 'settings')
  or (public.my_role() = 'child' and child_id = auth.uid()::text and collection in
      ('assignments', 'evidence', 'practice', 'timelog', 'activity', 'chats', 'documents', 'notes', 'prefs', 'images', 'reading', 'journal', 'words'))
);
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (
    public.my_role() = 'admin'
    or (public.my_role() = 'parent' and collection <> 'settings')
    or (public.my_role() = 'child' and child_id = auth.uid()::text and collection in
        ('assignments', 'evidence', 'practice', 'timelog', 'activity', 'chats', 'documents', 'notes', 'prefs', 'images', 'reading', 'journal', 'words'))
  )
  with check (
    public.my_role() = 'admin'
    or (public.my_role() = 'parent' and collection <> 'settings')
    or (public.my_role() = 'child' and child_id = auth.uid()::text and collection in
        ('assignments', 'evidence', 'practice', 'timelog', 'activity', 'chats', 'documents', 'notes', 'prefs', 'images', 'reading', 'journal', 'words'))
  );
drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated using (
  public.my_role() = 'admin'
  or (public.my_role() = 'parent' and collection <> 'settings')
  or (public.my_role() = 'child' and child_id = auth.uid()::text and collection in ('documents', 'chats'))
);
