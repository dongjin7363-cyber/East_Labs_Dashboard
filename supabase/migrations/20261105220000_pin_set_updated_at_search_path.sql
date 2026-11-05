-- Pin the trigger function to a fixed search path; pg_catalog remains available.
ALTER FUNCTION public.set_updated_at() SET search_path = '';
