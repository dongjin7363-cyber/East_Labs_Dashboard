-- Apply only after the page and API are deployed.
-- Saturday 00:00 UTC = 09:00 KST. Each call handles one ticker.
-- 5-minute spacing avoids overlapping <=300-second requests.
-- The immutable cutoff stays 09:00 even when computation finishes later.
-- Intentionally paused until OPENAI_API_KEY has been configured and tested.
select cron.schedule('east-super-stock-weekly','*/5 0-11 * * 6',$job$
 select net.http_post(
  url:='https://east-labs-dashboard.vercel.app/api/cron/super-stock',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization',
   'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='east_portfolio_cron_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=300000
 );
$job$);
select cron.alter_job(jobid,active:=false) from cron.job where jobname='east-super-stock-weekly';
-- After a successful live API smoke test:
-- select cron.alter_job(jobid,active:=true) from cron.job where jobname='east-super-stock-weekly';
