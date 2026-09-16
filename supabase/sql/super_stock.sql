-- Additive Super Stock schema. Existing portfolio data is untouched.
create table if not exists public.super_stock_watchlist (
 user_id uuid not null references auth.users(id) on delete cascade,
 ticker text not null check(ticker ~ '^[A-Z][A-Z0-9]{0,5}([.-][A-Z0-9]{1,2})?$'),
 active boolean not null default true, created_at timestamptz not null default now(),
 primary key(user_id,ticker)
);
create table if not exists public.super_stock_weekly_scores (
 ticker text not null, week_date date not null check(extract(dow from week_date)=6),
 quality_score numeric not null check(quality_score between 0 and 40),
 delta_score numeric not null check(delta_score between 0 and 40),
 super_score numeric not null check(super_score between 0 and 100),
 classification text not null, assessment jsonb not null,
 model text not null, rubric_version text not null default '1',
 created_at timestamptz not null default now(), primary key(ticker,week_date)
);
create table if not exists public.super_stock_runs (
 week_date date primary key, cohort text[] not null, completed text[] not null default '{}',
 failed jsonb not null default '{}', status text not null default 'pending' check(status in ('pending','running','complete','partial','blocked')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.super_stock_user_weeks (
 user_id uuid not null references auth.users(id) on delete cascade, week_date date not null,
 tickers text[] not null, primary key(user_id,week_date)
);
alter table public.super_stock_watchlist enable row level security;
alter table public.super_stock_weekly_scores enable row level security;
alter table public.super_stock_runs enable row level security;
alter table public.super_stock_user_weeks enable row level security;
revoke all on public.super_stock_watchlist,public.super_stock_weekly_scores,public.super_stock_runs,public.super_stock_user_weeks from anon,authenticated;
grant select,insert,update on public.super_stock_watchlist to authenticated;
grant select on public.super_stock_weekly_scores,public.super_stock_user_weeks to authenticated;
grant all on public.super_stock_watchlist,public.super_stock_weekly_scores,public.super_stock_runs,public.super_stock_user_weeks to service_role;
create policy super_stock_watch_read on public.super_stock_watchlist for select to authenticated using((select auth.uid())=user_id);
create policy super_stock_watch_add on public.super_stock_watchlist for insert to authenticated with check((select auth.uid())=user_id);
create policy super_stock_watch_edit on public.super_stock_watchlist for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy super_stock_scores_read on public.super_stock_weekly_scores for select to authenticated using(exists(select 1 from public.super_stock_watchlist w where w.user_id=(select auth.uid()) and w.ticker=super_stock_weekly_scores.ticker));
create policy super_stock_cohort_read on public.super_stock_user_weeks for select to authenticated using((select auth.uid())=user_id);
create index if not exists super_stock_scores_week on public.super_stock_weekly_scores(week_date desc);
