BEGIN;
CREATE TABLE IF NOT EXISTS public.depart_saved_plans (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object' AND octet_length(profile::text) <= 20000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.depart_saved_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.depart_saved_plans FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depart_saved_plans TO authenticated;
GRANT ALL ON public.depart_saved_plans TO service_role;
CREATE POLICY depart_plans_select ON public.depart_saved_plans FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY depart_plans_insert ON public.depart_saved_plans FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY depart_plans_update ON public.depart_saved_plans FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY depart_plans_delete ON public.depart_saved_plans FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
CREATE INDEX IF NOT EXISTS depart_plans_owner_date ON public.depart_saved_plans(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS public.depart_catalog (
 id text PRIMARY KEY, kind text NOT NULL, name text NOT NULL, address text,
 latitude double precision, longitude double precision, recommend_state text,
 checked_at text, source_file text NOT NULL, payload jsonb NOT NULL
);
ALTER TABLE public.depart_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.depart_catalog FROM anon, authenticated;
GRANT ALL ON public.depart_catalog TO service_role;
CREATE INDEX IF NOT EXISTS depart_catalog_kind ON public.depart_catalog(kind);
CREATE TABLE IF NOT EXISTS public.depart_source_records (
 id text PRIMARY KEY, source_file text NOT NULL, row_number integer NOT NULL, payload jsonb NOT NULL
);
ALTER TABLE public.depart_source_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.depart_source_records FROM anon, authenticated;
GRANT ALL ON public.depart_source_records TO service_role;
CREATE TABLE IF NOT EXISTS public.depart_imports (
 filename text PRIMARY KEY, sha256 text NOT NULL, bytes integer NOT NULL, rows integer NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.depart_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.depart_imports FROM anon, authenticated;
GRANT ALL ON public.depart_imports TO service_role;
CREATE TABLE IF NOT EXISTS public.depart_auth_limits (key text PRIMARY KEY, bucket bigint NOT NULL, attempts integer NOT NULL);
ALTER TABLE public.depart_auth_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.depart_auth_limits FROM anon, authenticated;
GRANT ALL ON public.depart_auth_limits TO service_role;
CREATE OR REPLACE FUNCTION public.depart_auth_attempt(limiter_key text, max_attempts integer)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
 INSERT INTO public.depart_auth_limits(key,bucket,attempts) VALUES(limiter_key, floor(extract(epoch FROM now())/900)::bigint,1)
 ON CONFLICT(key) DO UPDATE SET bucket=excluded.bucket, attempts=CASE WHEN depart_auth_limits.bucket=excluded.bucket THEN depart_auth_limits.attempts+1 ELSE 1 END
 RETURNING attempts <= max_attempts;
$$;
REVOKE ALL ON FUNCTION public.depart_auth_attempt(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.depart_auth_attempt(text,integer) TO service_role;
COMMIT;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'depart_%';
