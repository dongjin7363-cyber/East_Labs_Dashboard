-- ChatGPT Cloud writes through owner-connected Supabase tools. No model API call.
-- Existing account RLS and immutable score/history tables remain in use.
create or replace function public.prepare_super_stock_cloud(p_week date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_cutoff timestamptz := (p_week + time '07:00') at time zone 'Asia/Seoul';
  v_run public.super_stock_runs%rowtype;
  v_cohort text[];
begin
  if p_week is null or extract(dow from p_week) <> 6 or v_cutoff > now()
     or v_cutoff < now() - interval '7 days' then
    raise exception 'Only the current completed Saturday 07:00 cutoff is allowed';
  end if;
  perform pg_advisory_xact_lock(hashtext('east-super-stock-cloud'));
  select * into v_run from public.super_stock_runs where week_date=p_week;
  if not found then
    select coalesce(array_agg(distinct ticker order by ticker),array[]::text[]) into v_cohort
      from public.super_stock_watchlist where active and created_at<=v_cutoff
      and ticker not in ('SPY','QQQ','MAGS');
    insert into public.super_stock_user_weeks(user_id,week_date,tickers)
      select user_id,p_week,array_agg(distinct ticker order by ticker)
      from public.super_stock_watchlist where active and created_at<=v_cutoff
      and ticker not in ('SPY','QQQ','MAGS') group by user_id
      on conflict(user_id,week_date) do nothing;
    insert into public.super_stock_runs(week_date,cohort,status)
      values(p_week,v_cohort,case when cardinality(v_cohort)=0 then 'complete' else 'running' end)
      returning * into v_run;
  end if;
  return to_jsonb(v_run)||jsonb_build_object('cutoff',v_cutoff,'provider','chatgpt-cloud');
end; $$;

create or replace function public.save_super_stock_cloud(
  p_week date, p_ticker text, p_assessment jsonb default null, p_error text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_run public.super_stock_runs%rowtype;
  v_cutoff timestamptz := (p_week + time '07:00') at time zone 'Asia/Seoul';
  v_keys text[] := array['tam','adoption','revenue','margin','fcf','moat','capital','rs',
    'fundamental_acceleration','narrative_change','tam_expansion','strategic_scarcity',
    'product_mix','catalyst_density','expectation_gap','institutional_confirmation'];
  v_key text; v_component jsonb; v_e jsonb; v_ref text; v_ids text[] := array[]::text[];
  v_score numeric; v_quality numeric:=0; v_delta numeric:=0; v_super numeric;
  v_raw jsonb; v_prices jsonb; v_spy jsonb; v_price jsonb; v_release jsonb;
  v_current date; v_close numeric; v_previous numeric; v_four numeric;
  v_spy_now numeric; v_spy_four numeric; v_one_return numeric; v_four_return numeric; v_spy_return numeric;
  v_processed integer; v_status text;
begin
  select * into v_run from public.super_stock_runs where week_date=p_week for update;
  if not found or not (p_ticker=any(v_run.cohort)) then raise exception 'Ticker is not in the frozen weekly cohort'; end if;
  if p_week is null or extract(dow from p_week)<>6 or v_cutoff>now() or v_cutoff<now()-interval '7 days' then
    raise exception 'Invalid weekly cutoff';
  end if;
  if exists(select 1 from public.super_stock_weekly_scores where ticker=p_ticker and week_date=p_week) then
    return jsonb_build_object('status','already_saved','ticker',p_ticker,'week_date',p_week);
  end if;
  if nullif(trim(p_error),'') is not null then
    update public.super_stock_runs set failed=failed||jsonb_build_object(p_ticker,left(p_error,500)),updated_at=now() where week_date=p_week;
  else
    if jsonb_typeof(p_assessment->'evidence') is distinct from 'array'
       or jsonb_array_length(p_assessment->'evidence') not between 2 and 40 then raise exception 'Evidence required'; end if;
    for v_e in select value from jsonb_array_elements(p_assessment->'evidence') loop
      if nullif(v_e->>'id','') is null or v_e->>'id'=any(v_ids)
         or coalesce(v_e->>'url','') !~ '^https://[^/@[:space:]]+(/|$)'
         or nullif(v_e->>'headline','') is null or nullif(v_e->>'summary','') is null
         or nullif(v_e->>'source','') is null
         or coalesce(v_e->>'source_type','') not in ('primary','analyst','news','social')
         or coalesce(v_e->>'sentiment','') not in ('positive','negative','neutral')
         or (v_e->>'published_at')::timestamptz>v_cutoff or nullif(v_e->>'published_at','') is null then
        raise exception 'Invalid evidence or future source';
      end if;
      foreach v_key in array array['materiality','novelty','confidence'] loop
        if jsonb_typeof(v_e->v_key) is distinct from 'number' or (v_e->>v_key)::numeric not between 0 and 1 then raise exception 'Invalid evidence confidence'; end if;
      end loop;
      v_ids:=array_append(v_ids,v_e->>'id');
    end loop;
    if not exists(select 1 from jsonb_array_elements(p_assessment->'evidence') e where e->>'source_type'='primary')
       or (select count(distinct e->>'url') from jsonb_array_elements(p_assessment->'evidence') e)<2 then raise exception 'Primary and distinct sources required'; end if;
    foreach v_key in array v_keys loop
      v_component:=p_assessment->'components'->v_key;
      if jsonb_typeof(v_component->'score') is distinct from 'number' or nullif(v_component->>'reason','') is null
        or jsonb_typeof(v_component->'evidence_ids') is distinct from 'array' or jsonb_array_length(v_component->'evidence_ids')=0 then raise exception 'Incomplete component %',v_key; end if;
      v_score:=(v_component->>'score')::numeric;
      if v_score not between 0 and 5 then raise exception 'Component score outside 0..5'; end if;
      for v_ref in select jsonb_array_elements_text(v_component->'evidence_ids') loop
        if not(v_ref=any(v_ids)) then raise exception 'Unknown component evidence'; end if;
      end loop;
      if v_score>3 and not exists(select 1 from jsonb_array_elements(p_assessment->'evidence') e
        where e->>'id' in (select jsonb_array_elements_text(v_component->'evidence_ids')) and e->>'source_type'<>'social') then raise exception 'Social-only high score'; end if;
      if array_position(v_keys,v_key)<=8 then v_quality:=v_quality+v_score; else v_delta:=v_delta+v_score; end if;
    end loop;
    foreach v_key in array array['narrative_momentum','market_confirmation','confidence'] loop
      if jsonb_typeof(p_assessment->v_key) is distinct from 'number' or (p_assessment->>v_key)::numeric<0
        or (p_assessment->>v_key)::numeric>(case when v_key='confidence' then 1 else 100 end) then raise exception 'Invalid assessment score'; end if;
    end loop;
    if nullif(p_assessment->>'thesis','') is null or jsonb_typeof(p_assessment->'risks') is distinct from 'array'
       or jsonb_typeof(p_assessment->'drivers') is distinct from 'array' then raise exception 'Missing thesis or risks'; end if;
    for v_e in select value from jsonb_array_elements(p_assessment->'drivers') loop
      if nullif(v_e->>'label','') is null or jsonb_typeof(v_e->'impact') is distinct from 'number'
         or abs((v_e->>'impact')::numeric)>100 or jsonb_typeof(v_e->'evidence_ids') is distinct from 'array'
         or jsonb_array_length(v_e->'evidence_ids')=0 then raise exception 'Invalid driver'; end if;
      for v_ref in select jsonb_array_elements_text(v_e->'evidence_ids') loop
        if not(v_ref=any(v_ids)) then raise exception 'Unknown driver evidence'; end if;
      end loop;
    end loop;
    v_raw:=p_assessment->'research';
    if v_raw->>'origin' is distinct from 'cloud_weekly' or v_raw->>'version' is distinct from 'cloud-v1'
      or (v_raw->>'cutoff')::timestamptz is distinct from v_cutoff
      or (v_raw->>'researched_at')::date is distinct from (now() at time zone 'Asia/Seoul')::date
      or jsonb_typeof(v_raw->'missing') is distinct from 'array'
      or jsonb_typeof(v_raw->'limitations') is distinct from 'array'
      or jsonb_typeof(v_raw->'releases') is distinct from 'array' then raise exception 'Raw research metadata required'; end if;
    for v_release in select value from jsonb_array_elements(v_raw->'releases') loop
      if nullif(v_release->>'published_at','') is null or (v_release->>'published_at')::timestamptz>v_cutoff
        or coalesce(v_release->>'url','') !~ '^https://' or jsonb_typeof(v_release->'metrics') is distinct from 'object' then raise exception 'Invalid raw release'; end if;
    end loop;
    v_prices:=v_raw->'prices'; v_spy:=coalesce(v_raw->'spy_prices','[]'::jsonb);
    if jsonb_typeof(v_prices) is distinct from 'array' or jsonb_typeof(v_spy) is distinct from 'array' then raise exception 'Raw prices must be arrays'; end if;
    if (jsonb_array_length(v_prices)>0 and coalesce(v_raw->>'price_url','') !~ '^https://')
      or (jsonb_array_length(v_spy)>0 and coalesce(v_raw->>'spy_price_url','') !~ '^https://') then raise exception 'Price source required'; end if;
    for v_price in select value from jsonb_array_elements(v_prices||v_spy) loop
      if (v_price->>'date')::date>=p_week or nullif(v_price->>'date','') is null then raise exception 'Price after cutoff'; end if;
      foreach v_key in array array['open','high','low','close','volume'] loop
        if jsonb_typeof(v_price->v_key) is distinct from 'number' or (v_price->>v_key)::numeric<0
           or (v_key<>'volume' and (v_price->>v_key)::numeric=0) then raise exception 'Invalid OHLCV'; end if;
      end loop;
      if (v_price->>'low')::numeric>least((v_price->>'open')::numeric,(v_price->>'close')::numeric)
        or (v_price->>'high')::numeric<greatest((v_price->>'open')::numeric,(v_price->>'close')::numeric) then raise exception 'Inconsistent OHLC'; end if;
    end loop;
    if (select count(*) from jsonb_array_elements(v_prices))<>(select count(distinct e->>'date') from jsonb_array_elements(v_prices) e)
       or (select count(*) from jsonb_array_elements(v_spy))<>(select count(distinct e->>'date') from jsonb_array_elements(v_spy) e) then raise exception 'Duplicate price date'; end if;
    select coalesce(jsonb_agg(e order by e->>'date' desc),'[]') into v_prices from jsonb_array_elements(v_prices) e;
    v_current:=(v_prices->0->>'date')::date; v_close:=(v_prices->0->>'close')::numeric;
    if v_current<p_week-7 then raise exception 'Stale latest price'; end if;
    select (e->>'close')::numeric into v_previous from jsonb_array_elements(v_prices) e where (e->>'date')::date<=v_current-7 order by e->>'date' desc limit 1;
    select (e->>'close')::numeric into v_four from jsonb_array_elements(v_prices) e where (e->>'date')::date<=v_current-28 order by e->>'date' desc limit 1;
    select (e->>'close')::numeric into v_spy_now from jsonb_array_elements(v_spy) e where (e->>'date')::date=v_current;
    select (e->>'close')::numeric into v_spy_four from jsonb_array_elements(v_spy) e where (e->>'date')::date=(select (p->>'date')::date from jsonb_array_elements(v_prices) p where (p->>'date')::date<=v_current-28 order by p->>'date' desc limit 1);
    v_one_return:=round((v_close/v_previous-1)*100,4); v_four_return:=round((v_close/v_four-1)*100,4); v_spy_return:=round((v_spy_now/v_spy_four-1)*100,4);
    v_raw:=v_raw||jsonb_build_object('prices',v_prices,'return_1w',v_one_return,'return_4w',v_four_return,'spy_return_4w',v_spy_return,'excess_4w',v_four_return-v_spy_return);
    if jsonb_array_length(v_prices)=0 then v_raw:=jsonb_set(v_raw,'{missing}',(v_raw->'missing')||'"prices"'::jsonb); end if;
    p_assessment:=jsonb_set(p_assessment,'{research}',v_raw);
    v_quality:=round(v_quality,1); v_delta:=round(v_delta,1);
    v_super:=round(v_quality/40*30+v_delta/40*45+(p_assessment->>'narrative_momentum')::numeric*.15+(p_assessment->>'market_confirmation')::numeric*.10,1);
    insert into public.super_stock_weekly_scores(ticker,week_date,quality_score,delta_score,super_score,classification,assessment,model)
      values(p_ticker,p_week,v_quality,v_delta,v_super,
        case when v_delta>=30 and v_quality>=30 then 'Super Stock' when v_delta>=30 then 'High-risk Inflection' when v_quality>=30 then 'Compounder' else 'Story / Early Stage' end,
        p_assessment,'chatgpt-cloud');
    update public.super_stock_runs set completed=array(select distinct t from unnest(completed||array[p_ticker]) t order by t),failed=failed-p_ticker,updated_at=now() where week_date=p_week;
  end if;
  select * into v_run from public.super_stock_runs where week_date=p_week;
  select cardinality(v_run.completed)+(select count(*) from jsonb_object_keys(v_run.failed)) into v_processed;
  v_status:=case when v_processed<cardinality(v_run.cohort) then 'running' when v_run.failed<>'{}'::jsonb then 'partial' else 'complete' end;
  update public.super_stock_runs set status=v_status,updated_at=now() where week_date=p_week;
  return jsonb_build_object('status',v_status,'ticker',p_ticker,'completed',cardinality(v_run.completed),'failed',(select count(*) from jsonb_object_keys(v_run.failed)),'total',cardinality(v_run.cohort));
end; $$;

revoke all on function public.prepare_super_stock_cloud(date) from public,anon,authenticated;
revoke all on function public.save_super_stock_cloud(date,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.prepare_super_stock_cloud(date) to service_role;
grant execute on function public.save_super_stock_cloud(date,text,jsonb,text) to service_role;
-- The legacy paid API worker stays disabled. Cloud task calls the functions above.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='east-super-stock-weekly';
