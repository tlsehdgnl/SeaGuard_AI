import unittest
import os
from unittest.mock import patch,AsyncMock
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app import integrations as checks

class IntegrationTests(unittest.TestCase):
    def setUp(self):
        checks._cache.clear()
        self.env=patch.dict(os.environ,{'ADMIN_TOKEN':'private-admin','OPENAI_API_KEY':'private-openai','OPENAI_MODEL':'test-model','FISHING_API_KEY':'private-fishing','VERCEL':'1'},clear=True)
        self.env.start();self.addCleanup(self.env.stop)
        self.client=TestClient(app)
    def test_no_checks_without_auth(self):
        with patch.object(checks,'gpt',AsyncMock()) as probe:
            r=self.client.post('/api/admin/integrations/check',json={})
            self.assertEqual(r.status_code,401);probe.assert_not_called()
    def test_database_failure_does_not_hide_other_services_or_secrets(self):
        async def good(*a,**k):return checks.item('gpt','GPT','ok','model_access_ok')
        with patch.object(checks,'gpt',good),patch.object(checks,'fishing',good),patch.object(checks,'forecast',good),patch.object(checks,'library',good):
            r=self.client.post('/api/admin/integrations/check',json={},headers={'Authorization':'Bearer private-admin'})
        self.assertEqual(r.status_code,200);self.assertEqual(r.headers['cache-control'],'no-store')
        data=r.json();self.assertEqual(len(data['services']),10)
        db=next(x for x in data['services'] if x['id']=='database')
        self.assertEqual(db['status'],'missing')
        for secret in ('private-admin','private-openai','private-fishing'):self.assertNotIn(secret,r.text)
    def test_cache_avoids_repeating_provider_requests(self):
        probe=AsyncMock(return_value=checks.item('gpt','GPT','ok','model_access_ok'))
        with patch.object(checks,'gpt',probe),patch.object(checks,'fishing',probe),patch.object(checks,'forecast',probe),patch.object(checks,'library',probe):
            a=self.client.post('/api/admin/integrations/check',json={},headers={'Authorization':'Bearer private-admin'})
            b=self.client.post('/api/admin/integrations/check',json={},headers={'Authorization':'Bearer private-admin'})
        self.assertFalse(a.json()['cached']);self.assertTrue(b.json()['cached']);self.assertEqual(probe.await_count,5)

class ProbeTests(unittest.IsolatedAsyncioTestCase):
    async def test_kakao_auth_error_hides_credentials_and_provider_body(self):
        client = AsyncMock()
        client.get.return_value = httpx.Response(403, text='private provider response')
        with patch.dict(os.environ, {'KAKAO_LOCAL_KEY': 'private-key'}):
            row = await checks.kakao_places(client)
        self.assertEqual(row['status'], 'auth_error')
        self.assertNotIn('private', str(row))

    async def test_invalid_key_is_not_reported_as_connected(self):
        client=AsyncMock();client.get.return_value=httpx.Response(401,json={'error':{'message':'secret should never escape'}})
        with patch.dict(os.environ,{'OPENAI_API_KEY':'secret','OPENAI_MODEL':'model'}):r=await checks.gpt(client,False)
        self.assertEqual(r['status'],'auth_error');self.assertNotIn('secret',str(r))
    async def test_model_missing_and_actual_generation(self):
        client=AsyncMock();client.get.return_value=httpx.Response(200,json={'data':[{'id':'other'}]})
        client.post.return_value=httpx.Response(200,json={'choices':[{'message':{'content':'{"ok":true}'}}]})
        with patch.dict(os.environ,{'OPENAI_API_KEY':'secret','OPENAI_MODEL':'model'}):
            r=await checks.gpt(client,False);g=await checks.gpt(client,True)
        self.assertEqual(r['detail'],'model_missing');self.assertEqual(g['detail'],'generation_ok')
    async def test_fishing_http_200_provider_error(self):
        client=AsyncMock();client.get.return_value=httpx.Response(200,json={'response':{'header':{'resultCode':'30','resultMsg':'private-key'}}})
        with patch.dict(os.environ,{'FISHING_API_KEY':'private-key'}):r=await checks.fishing(client)
        self.assertEqual(r['status'],'error');self.assertNotIn('private-key',str(r))
    async def test_timeout_is_isolated(self):
        probe=AsyncMock(side_effect=httpx.ReadTimeout('sensitive request URL'))
        r=await checks.guarded('fishing','Fishing',probe)
        self.assertEqual(r['status'],'timeout');self.assertNotIn('sensitive',str(r))
