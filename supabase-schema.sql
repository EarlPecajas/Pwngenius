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
values ('first', 'First Flag', '951a5dd0e9afd6d89e6da0d039a8f93ca695f0acc87bda49ca3d09cc83d8416e', 100);
