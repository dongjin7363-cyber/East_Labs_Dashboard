-- Server-only leases and idempotent daily portfolio snapshots.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.dashboard_leases (
  key text primary key,
  owner uuid not null,
  expires_at timestamptz not null
);
alter table public.dashboard_leases enable row level security;
revoke all on public.dashboard_leases from public, anon, authenticated;
grant all on public.dashboard_leases to service_role;

create or replace function public.try_acquire_dashboard_lease(p_key text, p_owner uuid, p_seconds integer)
returns boolean language sql security invoker set search_path = '' as $$
  with acquired as (
    insert into public.dashboard_leases(key, owner, expires_at)
    values (p_key, p_owner, now() + make_interval(secs => least(greatest(p_seconds,1),600)))
    on conflict (key) do update set owner=excluded.owner, expires_at=excluded.expires_at
      where public.dashboard_leases.expires_at < now()
    returning 1
  ) select exists(select 1 from acquired);
$$;
create or replace function public.release_dashboard_lease(p_key text, p_owner uuid)
returns void language sql security invoker set search_path = '' as $$
  delete from public.dashboard_leases where key=p_key and owner=p_owner;
$$;
revoke all on function public.try_acquire_dashboard_lease(text,uuid,integer) from public, anon, authenticated;
revoke all on function public.release_dashboard_lease(text,uuid) from public, anon, authenticated;
grant execute on function public.try_acquire_dashboard_lease(text,uuid,integer) to service_role;
grant execute on function public.release_dashboard_lease(text,uuid) to service_role;

create table if not exists public.portfolio_schedule_runs (
  scheduled_at timestamptz primary key,
  slot_kst integer not null check (slot_kst in (7,12,17)),
  status text not null check (status in ('running','complete','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_count integer,
  snapshot_count integer,
  error text
);
alter table public.portfolio_schedule_runs enable row level security;
revoke all on public.portfolio_schedule_runs from public, anon, authenticated;
grant all on public.portfolio_schedule_runs to service_role;

create or replace function public.complete_portfolio_schedule(
  p_scheduled_at timestamptz, p_snapshots jsonb, p_updated_count integer
) returns void language plpgsql security invoker set search_path = '' as $$
declare current_status text;
begin
  select status into current_status from public.portfolio_schedule_runs
    where scheduled_at=p_scheduled_at for update;
  if current_status='complete' then return; end if;
  if current_status is distinct from 'running' then raise exception 'No active scheduled run'; end if;
  if jsonb_array_length(p_snapshots)>0 and extract(hour from p_scheduled_at at time zone 'Asia/Seoul')<>7 then
    raise exception 'Snapshots are only permitted for the 07:00 slot';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_snapshots) as x(date date)
    where x.date is distinct from ((p_scheduled_at at time zone 'Asia/Seoul')::date-1)) then
    raise exception 'Invalid snapshot date';
  end if;
  insert into public.total_asset_snapshots(user_id,date,total_asset_krw_int,fx_rate,updated_at)
    select user_id,date,total_asset_krw_int,fx_rate,now()
    from jsonb_to_recordset(p_snapshots) as x(user_id uuid,date date,total_asset_krw_int bigint,fx_rate numeric)
    on conflict(user_id,date) do update
      set total_asset_krw_int=excluded.total_asset_krw_int,fx_rate=excluded.fx_rate,updated_at=excluded.updated_at;
  -- Existing memo/created_at remain unchanged on an automatic update.
  update public.portfolio_schedule_runs set status='complete', finished_at=now(),
    updated_count=p_updated_count,snapshot_count=jsonb_array_length(p_snapshots),error=null
    where scheduled_at=p_scheduled_at;
end;
$$;
revoke all on function public.complete_portfolio_schedule(timestamptz,jsonb,integer) from public, anon, authenticated;
grant execute on function public.complete_portfolio_schedule(timestamptz,jsonb,integer) to service_role;
