create table if not exists public.super_stock_research (
 user_id uuid not null references auth.users(id) on delete cascade,
 ticker text not null,
 week_date date not null check(extract(dow from week_date)=6),
 snapshot jsonb not null,
 imported_at timestamptz not null default now(),
 primary key(user_id,ticker,week_date),
 check(snapshot->>'ticker'=ticker),
 check(snapshot->>'week_date'=week_date::text),
 check(snapshot->'research'->>'origin'='historical_reassessment')
);
alter table public.super_stock_research enable row level security;
revoke all on public.super_stock_research from anon,authenticated;
grant select on public.super_stock_research to authenticated;
grant all on public.super_stock_research to service_role;
create policy super_stock_research_read on public.super_stock_research for select to authenticated using ((select auth.uid())=user_id);

