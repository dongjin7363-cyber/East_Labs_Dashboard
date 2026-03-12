create extension if not exists pgcrypto;

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text,
  title text not null,
  category_name text not null,
  color_key text not null check (color_key in ('red','orange','yellow','green','blue','purple','black')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  text text not null,
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedule_events enable row level security;
alter table public.schedule_todos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_events' and policyname = 'schedule_events_select_own'
  ) then
    create policy schedule_events_select_own on public.schedule_events for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_events' and policyname = 'schedule_events_insert_own'
  ) then
    create policy schedule_events_insert_own on public.schedule_events for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_events' and policyname = 'schedule_events_update_own'
  ) then
    create policy schedule_events_update_own on public.schedule_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_events' and policyname = 'schedule_events_delete_own'
  ) then
    create policy schedule_events_delete_own on public.schedule_events for delete using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_todos' and policyname = 'schedule_todos_select_own'
  ) then
    create policy schedule_todos_select_own on public.schedule_todos for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_todos' and policyname = 'schedule_todos_insert_own'
  ) then
    create policy schedule_todos_insert_own on public.schedule_todos for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_todos' and policyname = 'schedule_todos_update_own'
  ) then
    create policy schedule_todos_update_own on public.schedule_todos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_todos' and policyname = 'schedule_todos_delete_own'
  ) then
    create policy schedule_todos_delete_own on public.schedule_todos for delete using (auth.uid() = user_id);
  end if;
end
$$;
