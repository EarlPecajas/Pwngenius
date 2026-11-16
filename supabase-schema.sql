create table public.challenges (
  id text primary key,
  name text not null,
  flag_hash text not null,
  points integer not null default 100
);

create table public.submissions (
  id bigint generated always as identity primary key,
  challenge_id text not null references public.challenges(id),
  submitted_hash text not null,
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;
alter table public.submissions enable row level security;

insert into public.challenges (id, name, flag_hash, points)
values ('first', 'First Flag', '98a3afd73ff16d962daf9a826a34f0d297efa9d2a46f2bcd67ca9829642d5060', 100);
