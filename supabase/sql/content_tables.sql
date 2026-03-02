-- Memo
create table if not exists public.memo_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  buy_tickers text not null default '',
  sell_tickers text not null default '',
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memo_entries add column if not exists buy_tickers text not null default '';
alter table public.memo_entries add column if not exists sell_tickers text not null default '';
alter table public.memo_entries add column if not exists comment text not null default '';

do $$
declare
  has_tags boolean;
  has_body boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memo_entries'
      and column_name = 'tags'
  ) into has_tags;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memo_entries'
      and column_name = 'body'
  ) into has_body;

  if has_tags then
    execute $sql$
      update public.memo_entries
      set buy_tickers = array_to_string(tags, ', ')
      where coalesce(buy_tickers, '') = ''
    $sql$;
  end if;

  if has_body then
    execute $sql$
      update public.memo_entries
      set comment = body
      where coalesce(comment, '') = ''
    $sql$;
  end if;
end $$;

alter table public.memo_entries drop constraint if exists memo_entries_user_id_date_key;
create index if not exists memo_entries_user_id_date_idx on public.memo_entries(user_id, date);

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
