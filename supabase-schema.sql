create table if not exists public.challenges (
  id text primary key,
  name text not null,
  category text not null default 'General',
  difficulty text not null default 'Beginner',
  description text not null default '',
  hint text not null default '',
  author text not null default 'Anonymous',
  flag_hash text not null,
  points integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  username text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.challenges add column if not exists category text not null default 'General';
alter table public.challenges add column if not exists difficulty text not null default 'Beginner';
alter table public.challenges add column if not exists description text not null default '';
alter table public.challenges add column if not exists hint text not null default '';
alter table public.challenges add column if not exists author text not null default 'Anonymous';
alter table public.challenges add column if not exists submission_limit integer;
alter table public.challenges add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists email text not null default '';
alter table public.submissions add column if not exists user_id uuid references auth.users(id) on delete set null;

create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  challenge_id text not null references public.challenges(id),
  submitted_hash text not null,
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value text not null
);

insert into public.site_settings (key, value)
values ('challenges_locked', 'true')
on conflict (key) do nothing;

insert into storage.buckets (id, name, public)
values ('challenge-files', 'challenge-files', true)
on conflict (id) do update set public = true;

alter table public.challenges enable row level security;
alter table public.profiles enable row level security;
alter table public.submissions enable row level security;

-- The API is the only intended reader of flag_hash. Browser roles must not
-- be able to select this column through Supabase REST.
revoke select (flag_hash)
on table public.challenges
from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, username)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop policy if exists "Authenticated users can view challenges" on public.challenges;
create policy "Authenticated users can view challenges"
  on public.challenges for select to authenticated using (true);

drop policy if exists "Users can view their profile" on public.profiles;
create policy "Users can view their profile"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "Users can insert their submissions" on public.submissions;
create policy "Users can insert their submissions"
  on public.submissions for insert to authenticated
  with check (true);
