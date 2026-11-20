import json
import os
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from app.main import app, analyze, KST
from app.guide import CATALOG, recommendations, validate_selection
from app import ai

PROFILE = dict(beach='mangsang', mode='demo', activity='walk', children=False, mobility='any', transport='any', budget='any', time_budget='any', exclude=[])

class GuideTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.env = patch.dict(os.environ, {'LLM_API_KEY':'', 'LLM_API_URL':''})
        self.env.start()
        ai._cache.clear(); ai._calls.clear()

    def tearDown(self):
        self.env.stop()

    def test_twenty_activity_and_data_scenarios(self):
        # 5 conditions × 4 profiles. These are simulated validation cases, not user trials.
        profiles = ['activity=walk', 'activity=swim', 'activity=swim&children=true', 'activity=walk&mobility=stroller']
        values = dict(wave_height=.4, wind_speed=2, precipitation=0, temperature=20)
        stamps = dict(weather=datetime.now(KST).isoformat(), marine=datetime.now(KST).isoformat())
        cases = [('normal','mangsang',None),('caution','chuam',None),('danger','eodal',None),('missing','mangsang',httpx.ConnectError('offline')),('stale','mangsang',ValueError('stale'))]
        for condition, beach, error in cases:
            for params in profiles:
                with self.subTest(condition=condition,params=params):
                    with patch('app.main.forecast', side_effect=error, return_value=(values,stamps,900)):
                        response = self.client.get(f'/api/guide/{beach}?{params}&mode={"forecast" if error else "demo"}')
                    self.assertEqual(response.status_code,200)
                    data = response.json()
                    self.assertTrue(data['actions'])
                    self.assertEqual(len(data['official_links']),3)
                    if error:
                        self.assertIsNone(data['weather'])
                        self.assertEqual(data['state'],'information_needed')
                    else:
                        self.assertIn('data_times',data['weather']['meta'])
                        self.assertTrue(data['weather']['meta']['is_demo'])
                    for group in ['candidates','needs_check','excluded']:
                        for place in data['alternatives'][group]:
                            self.assertIn(place['id'],[p['id'] for p in CATALOG['places']])
                            self.assertTrue(place['sources'])
                            self.assertTrue(all(s['checked_at'] and s['url'].startswith('https://') for s in place['sources']))

    def test_family_and_mobility_actions(self):
        data=self.client.get('/api/guide/chuam?activity=swim&children=true&mobility=stroller').json()
        ids={a['id'] for a in data['actions']}
        self.assertTrue({'swim','children','mobility','signal','official','demo'} <= ids)

    def test_unknown_constraints_remain_pending(self):
        data=recommendations({**PROFILE,'mobility':'step_free','transport':'transit','time_budget':'60'}, date(2026,11,22))
        self.assertEqual(data['candidates'],[])
        self.assertTrue(data['needs_check'])
        self.assertIn('cave',[p['id'] for p in data['excluded']])
        self.assertTrue(all(p['checks'] for p in data['needs_check']))

    def test_paid_excluded_and_unknown_fee_never_free(self):
        data=recommendations({**PROFILE,'budget':'free'},date(2026,11,22))
        self.assertEqual(data['candidates'],[])
        self.assertEqual({p['id'] for p in data['excluded']},{'cave','pencil','forest'})
        self.assertEqual(len(data['needs_check']),3)

    def test_regular_closures(self):
        friday=recommendations(PROFILE,date(2026,11,20))
        self.assertTrue({'balhan','buksam'} <= {p['id'] for p in friday['excluded']})
        monday=recommendations(PROFILE,date(2026,11,23))
        self.assertIn('dream',[p['id'] for p in monday['excluded']])
        tuesday=recommendations(PROFILE,date(2026,11,24))
        self.assertIn('pencil',[p['id'] for p in tuesday['excluded']])

    def test_aging_catalog_downgrades_candidates(self):
        data=recommendations(PROFILE,date(2027,6,1))
        self.assertEqual(data['candidates'],[])
        self.assertTrue(all(any('90일' in c for c in p['checks']) for p in data['needs_check']))

    def test_all_excluded_is_honest_empty(self):
        ids=','.join(p['id'] for p in CATALOG['places'])
        data=self.client.get('/api/guide/mangsang?exclude='+ids).json()
        self.assertEqual(data['alternatives']['candidates'],[])
        self.assertEqual(data['alternatives']['needs_check'],[])
        self.assertEqual(len(data['alternatives']['excluded']),6)

    def test_parameter_validation(self):
        for query in ['activity=diving','mobility=magic','time_budget=5','budget=cheap','exclude=unknown','children=maybe','mode=live','transport=flight','exclude='+'x'*101]:
            with self.subTest(query=query):
                self.assertEqual(self.client.get('/api/guide/mangsang?'+query).status_code,422)
        self.assertEqual(self.client.get('/api/guide/unknown').status_code,404)

    def test_ai_unknown_place_cannot_escape(self):
        fake={'action_ids':['official'],'recommendations':[{'place_id':'invented','fact_ids':['made-up']}]}
        with patch('app.guide.select_json',return_value=(fake,'ok')):
            data=self.client.get('/api/guide/mangsang').json()
        self.assertEqual(data['ai']['status'],'invalid')
        self.assertNotIn('invented',json.dumps(data))
        self.assertEqual(data['ai']['source'],'rules')

    def test_ai_prose_injection_rejected(self):
        fake={'action_ids':['official'],'recommendations':[], 'text':'입수해도 안전합니다'}
        with patch('app.guide.select_json',return_value=(fake,'ok')):
            data=self.client.get('/api/guide/mangsang').json()
        self.assertEqual(data['ai']['status'],'invalid')
        self.assertNotIn('입수해도 안전합니다',json.dumps(data,ensure_ascii=False))

    def test_ai_valid_selection_preserves_fixed_actions(self):
        with patch('app.guide.recommendations',return_value=recommendations(PROFILE,date(2026,11,22))):
            baseline=self.client.get('/api/guide/mangsang').json()
            fake={'action_ids':['walk'],'recommendations':[{'place_id':'pencil','fact_ids':['pencil-exhibit']}]}
            with patch('app.guide.select_json',return_value=(fake,'ok')):
                data=self.client.get('/api/guide/mangsang').json()
        self.assertEqual(data['ai']['source'],'rules+llm')
        self.assertEqual(data['actions'],baseline['actions'])
        self.assertEqual(data['alternatives']['candidates'][0]['id'],'pencil')

    def test_selection_rejects_foreign_evidence_duplicates_and_types(self):
        actions=[{'id':'official','text':'fixed'}]
        places=CATALOG['places']
        invalid=[
          {'action_ids':['unknown'],'recommendations':[]},
          {'action_ids':['official','official'],'recommendations':[]},
          {'action_ids':['official'],'recommendations':[{'place_id':'pencil','fact_ids':['cave-nature']}]},
          {'action_ids':['official'],'recommendations':[{'place_id':{},'fact_ids':[]}]},
          {'action_ids':['official'],'recommendations':[{'place_id':'pencil','fact_ids':['pencil-exhibit']}] * 2},
          {'action_ids':['official'],'recommendations':[]},
        ]
        for selection in invalid:
            with self.subTest(selection=selection), self.assertRaises(ValueError):
                validate_selection(selection,actions,places)

    def test_llm_outage_still_returns_actions_and_places(self):
        with patch('app.guide.select_json',return_value=(None,'failed')):
            data=self.client.get('/api/guide/eodal?children=true').json()
        self.assertEqual(data['ai']['status'],'failed')
        self.assertEqual(data['weather']['risk']['level'],'danger')
        self.assertTrue(data['alternatives']['candidates'] or data['alternatives']['needs_check'])

    def test_rain_intervals_not_compared(self):
        values=dict(wave_height=0,wind_speed=0,precipitation=8,temperature=20)
        self.assertEqual(analyze(values,900)['level'],'low')
        self.assertEqual(analyze(values,3600)['level'],'danger')
        self.assertIn('제외',' '.join(analyze(values,900)['reasons']))

    def test_forecast_staleness_units_and_interval(self):
        current=datetime.now(KST).replace(tzinfo=None).isoformat(timespec='minutes')
        def responses(stale=False,bad_unit=False,interval=900):
            stamp=(datetime.now(KST)-timedelta(days=1)).replace(tzinfo=None).isoformat(timespec='minutes') if stale else current
            w={'current_units':{'wind_speed_10m':'km/h' if bad_unit else 'm/s','precipitation':'mm'},'current':{'wave_height':0,'temperature_2m':20,'wind_speed_10m':2,'precipitation':0,'time':stamp,'interval':interval}}
            m={'current_units':{'wave_height':'m'},'current':{'wave_height':.3,'time':stamp}}
            return [httpx.Response(200,json=v,request=httpx.Request('GET','https://example.com')) for v in [w,m]]
        for opts in [{'stale':True},{'bad_unit':True},{'interval':None},{'interval':False},{'interval':0}]:
            with self.subTest(opts=opts), patch('httpx.AsyncClient.get',side_effect=responses(**opts)):
                data=self.client.get('/api/guide/mangsang?mode=forecast').json()
                self.assertEqual(data['state'],'information_needed')
                self.assertIsNone(data['weather'])

    def test_existing_risk_api_rejects_raw_ai_claims(self):
        with patch('app.main.select_json',return_value=({'text':'입수해도 안전합니다'},'ok')):
            data=self.client.get('/api/risk/eodal').json()
        self.assertNotIn('입수해도 안전합니다',json.dumps(data,ensure_ascii=False))
        self.assertEqual(data['explanation']['source'],'rules')

class AIClientTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        ai._cache.clear(); ai._calls.clear()
        self.env=patch.dict(os.environ,{'LLM_API_KEY':'test','LLM_API_URL':'https://example.invalid','LLM_MODEL':'test'})
        self.env.start()
    def tearDown(self):
        self.env.stop()
    async def test_cache_avoids_duplicate_paid_calls(self):
        response=httpx.Response(200,json={'choices':[{'message':{'content':'{"action_ids":["official"],"recommendations":[]}'}}]},request=httpx.Request('POST','https://example.invalid'))
        with patch('httpx.AsyncClient.post',new=AsyncMock(return_value=response)) as post:
            first,status=await ai.select_json({'condition':'walk'},'test')
            second,cached=await ai.select_json({'condition':'walk'},'test')
        self.assertEqual(post.await_count,1)
        self.assertEqual(status,'ok');self.assertEqual(cached,'cached');self.assertEqual(first,second)
    async def test_request_limit_falls_back(self):
        import time
        ai._calls.extend([time.monotonic()]*12)
        with patch('httpx.AsyncClient.post',new=AsyncMock()) as post:
            value,status=await ai.select_json({},'test')
        self.assertEqual(status,'limited');self.assertIsNone(value);post.assert_not_called()
    async def test_malformed_ai_json_falls_back(self):
        response=httpx.Response(200,json={'choices':[{'message':{'content':'not json'}}]},request=httpx.Request('POST','https://example.invalid'))
        with patch('httpx.AsyncClient.post',new=AsyncMock(return_value=response)):
            value,status=await ai.select_json({},'test')
        self.assertEqual(status,'failed');self.assertIsNone(value)
