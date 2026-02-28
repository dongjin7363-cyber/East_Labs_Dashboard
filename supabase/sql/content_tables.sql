-- Memo
create table if not exists public.memo_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  title text,
  body text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.memo_entries enable row level security;

drop policy if exists memo_entries_select_own on public.memo_entries;
create policy memo_entries_select_own on public.memo_entries
for select using (auth.uid() = user_id);

drop policy if exists memo_entries_insert_own on public.memo_entries;
create policy memo_entries_insert_own on public.memo_entries
for insert with check (auth.uid() = user_id);

drop policy if exists memo_entries_update_own on public.memo_entries;
create policy memo_entries_update_own on public.memo_entries
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists memo_entries_delete_own on public.memo_entries;
create policy memo_entries_delete_own on public.memo_entries
for delete using (auth.uid() = user_id);

-- Market
create table if not exists public.market_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  macro_text text not null default '',
  indices_text text not null default '',
  notes_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.market_posts enable row level security;

drop policy if exists market_posts_select_own on public.market_posts;
create policy market_posts_select_own on public.market_posts
for select using (auth.uid() = user_id);

drop policy if exists market_posts_insert_own on public.market_posts;
create policy market_posts_insert_own on public.market_posts
for insert with check (auth.uid() = user_id);

drop policy if exists market_posts_update_own on public.market_posts;
create policy market_posts_update_own on public.market_posts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists market_posts_delete_own on public.market_posts;
create policy market_posts_delete_own on public.market_posts
for delete using (auth.uid() = user_id);

-- Membership
create table if not exists public.membership_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null,
  body text not null default '',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.membership_posts enable row level security;

drop policy if exists membership_posts_select_own on public.membership_posts;
create policy membership_posts_select_own on public.membership_posts
for select using (auth.uid() = user_id);

drop policy if exists membership_posts_insert_own on public.membership_posts;
create policy membership_posts_insert_own on public.membership_posts
for insert with check (auth.uid() = user_id);

drop policy if exists membership_posts_update_own on public.membership_posts;
create policy membership_posts_update_own on public.membership_posts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists membership_posts_delete_own on public.membership_posts;
create policy membership_posts_delete_own on public.membership_posts
for delete using (auth.uid() = user_id);
