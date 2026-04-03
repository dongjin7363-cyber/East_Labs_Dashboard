alter table if exists public.portfolio_holdings
  add column if not exists is_credit boolean not null default false;

update public.portfolio_holdings
set is_credit = false
where is_credit is null;
