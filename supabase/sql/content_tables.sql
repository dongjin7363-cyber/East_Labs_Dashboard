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
  date date not null default current_date,
  title text not null,
  category text not null check (category in ('Market', 'KR', 'US', 'Coin')),
  visibility text not null default 'Private' check (visibility in ('Public', 'Private')),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.membership_posts add column if not exists date date not null default current_date;
alter table public.membership_posts add column if not exists visibility text not null default 'Private';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'membership_posts'
      and column_name = 'is_public'
  ) then
    update public.membership_posts
    set visibility = case when is_public then 'Public' else 'Private' end
    where coalesce(visibility, '') = '';
  end if;
end $$;

update public.membership_posts
set category = case category
  when '시장' then 'Market'
  when '종목' then 'KR'
  when '코인' then 'Coin'
  when '리포트' then 'Market'
  else category
end;

update public.membership_posts
set category = 'Market'
where category not in ('Market', 'KR', 'US', 'Coin');

update public.membership_posts
set visibility = 'Private'
where visibility not in ('Public', 'Private');

alter table public.membership_posts drop constraint if exists membership_posts_category_check;
alter table public.membership_posts
  add constraint membership_posts_category_check
  check (category in ('Market', 'KR', 'US', 'Coin'));

alter table public.membership_posts drop constraint if exists membership_posts_visibility_check;
alter table public.membership_posts
  add constraint membership_posts_visibility_check
  check (visibility in ('Public', 'Private'));

create index if not exists membership_posts_date_idx on public.membership_posts(date);

alter table public.membership_posts enable row level security;

drop policy if exists membership_posts_select_own on public.membership_posts;
drop policy if exists membership_posts_select_public on public.membership_posts;
drop policy if exists membership_posts_select_owner on public.membership_posts;
create policy membership_posts_select_public on public.membership_posts
for select using (visibility = 'Public');

create policy membership_posts_select_owner on public.membership_posts
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

-- Future extension idea:
-- create table public.membership_access (
--   post_id uuid references public.membership_posts(id) on delete cascade,
--   allowed_user_id uuid references auth.users(id) on delete cascade,
--   primary key (post_id, allowed_user_id)
-- );
