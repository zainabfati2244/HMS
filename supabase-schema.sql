-- Run this once in Supabase Dashboard > SQL Editor.
-- New signups start as patients; assign doctor/cashier roles only to approved staff.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'patient' check (role in ('patient', 'doctor', 'cashier')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

-- Remove older policies too. A previous policy that queries profiles from
-- inside its own policy expression causes PostgreSQL infinite-recursion errors.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', existing_policy.policyname);
  end loop;
end;
$$;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'patient')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

-- Backfill accounts created before this profile trigger was installed.
insert into public.profiles (id, full_name, role)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), 'patient'
from auth.users
on conflict (id) do nothing;

-- After verifying a staff member, promote them manually from SQL Editor:
-- update public.profiles set role = 'doctor' where id = '<auth user uuid>';
-- update public.profiles set role = 'cashier' where id = '<auth user uuid>';
