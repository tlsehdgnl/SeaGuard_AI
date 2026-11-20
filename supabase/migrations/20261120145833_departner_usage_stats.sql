BEGIN;
CREATE TABLE public.depart_events (
 id uuid PRIMARY KEY, session_id uuid NOT NULL, kind text NOT NULL,
 beach text NOT NULL, poi_id text NOT NULL, demo boolean NOT NULL,
 created_at bigint NOT NULL, context jsonb
);
ALTER TABLE public.depart_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.depart_events FROM anon,authenticated;
GRANT ALL ON public.depart_events TO service_role;
CREATE INDEX depart_events_time ON public.depart_events(created_at);
CREATE INDEX depart_events_session ON public.depart_events(session_id,created_at);
CREATE FUNCTION public.depart_usage_stats(p_from bigint,p_to bigint,p_demo integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
WITH s AS (SELECT * FROM public.depart_events WHERE created_at BETWEEN p_from AND p_to AND (p_demo=-1 OR demo=(p_demo=1))),
plans AS (SELECT session_id,min(created_at) first_view FROM s WHERE kind='plan_seen' GROUP BY session_id),
c AS (SELECT coalesce((context->>'start_hour')::integer,-1) h,context->>'risk' risk, CASE WHEN context->>'car' IS NULL THEN -1 WHEN (context->>'car')::boolean THEN 1 ELSE 0 END car,context->>'travel_date' travel_date,beach FROM s WHERE context IS NOT NULL)
SELECT jsonb_build_object(
'starts',(SELECT count(*) FROM public.depart_events WHERE kind='start' AND created_at BETWEEN p_from AND p_to),
'counts',coalesce((SELECT jsonb_object_agg(kind,n) FROM (SELECT kind,count(*) n FROM s WHERE kind<>'start' GROUP BY kind) x),'{}'::jsonb),
'beaches',coalesce((SELECT jsonb_agg(jsonb_build_array(beach,n)) FROM (SELECT beach,count(*) n FROM s WHERE kind='plan_seen' GROUP BY beach) x),'[]'::jsonb),
'popular',coalesce((SELECT jsonb_agg(jsonb_build_array(poi_id,n)) FROM (SELECT poi_id,count(*) n FROM s WHERE poi_id<>'' AND kind IN ('map_click','official_click') GROUP BY poi_id) x),'[]'::jsonb),
'daily',coalesce((SELECT jsonb_agg(jsonb_build_array(epoch_day,kind,n)) FROM (SELECT (created_at+32400)/86400 AS epoch_day,kind,count(*) n FROM s WHERE kind<>'start' GROUP BY 1,2) x),'[]'::jsonb),
'funnel',(SELECT jsonb_build_array(count(*),count(*) FILTER (WHERE EXISTS (SELECT 1 FROM s WHERE s.session_id=plans.session_id AND s.created_at>=plans.first_view AND s.kind IN ('map_click','official_click')))) FROM plans),
'context',coalesce((SELECT jsonb_agg(jsonb_build_array(h,risk,car,n)) FROM (SELECT h,risk,car,count(*) n FROM c GROUP BY h,risk,car) x),'[]'::jsonb),
'schedule',coalesce((SELECT jsonb_agg(jsonb_build_array(travel_date,beach,h,n,nocar)) FROM (SELECT travel_date,beach,h,count(*) n,count(*) FILTER (WHERE car=0) nocar FROM c WHERE travel_date IS NOT NULL GROUP BY travel_date,beach,h) x),'[]'::jsonb),
 'trails','[]'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.depart_usage_stats(bigint,bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.depart_usage_stats(bigint,bigint,integer) TO service_role;
COMMIT;
SELECT public.depart_usage_stats(0,4102444800,-1);
