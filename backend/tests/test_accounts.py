import os
import unittest
from unittest.mock import patch,AsyncMock
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app import accounts

class AccountTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)
        self.origin={'Origin':'http://127.0.0.1:5175'}
    def test_guest_never_fetches_cloud(self):
        with patch.object(accounts,'supa',AsyncMock()) as network:
            self.assertIsNone(self.client.get('/api/account/me').json()['user'])
            self.assertEqual(self.client.get('/api/account/plans').status_code,401)
            network.assert_not_called()
    def test_cross_origin_blocked_before_auth(self):
        with patch.object(accounts,'supa',AsyncMock()) as network:
            r=self.client.post('/api/account/login',json={'username':'person','password':'somepassword'},headers={'Origin':'https://evil.invalid'})
            self.assertEqual(r.status_code,403);network.assert_not_called()
    def test_birthdate_and_username_validation(self):
        for fields in ({'birth_date':'2999-01-01'},{'username':'../admin'}):
            r=self.client.post('/api/account/signup',headers=self.origin,json={'username':'person','password':'somepassword','nickname':'여행자','birth_date':'2000-01-01',**fields})
            self.assertEqual(r.status_code,422)
    def test_user_response_excludes_private_fields(self):
        user={'id':'abc','user_metadata':{'nickname':'Test','birth_date':'2000-01-01','username':'test'},'email':'internal','role':'authenticated'}
        self.assertEqual(accounts.public_user(user),{'id':'abc','nickname':'Test','username':'test'})
    def test_cookies_http_only_secure_in_production(self):
        from fastapi import Response
        r=Response()
        with patch.dict(os.environ,{'VERCEL':'1'}):accounts.cookies(r,{'access_token':'secret-a','refresh_token':'secret-b','expires_in':3600})
        for value in r.headers.getlist('set-cookie'):
            self.assertIn('HttpOnly',value);self.assertIn('Secure',value);self.assertIn('SameSite=lax',value);self.assertIn('Path=/api/account',value)
    def test_rate_limit_is_fail_closed(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://example.invalid','SUPABASE_SECRET_KEY':'secret'}),patch.object(accounts,'supa',AsyncMock(return_value=httpx.Response(200,json=False))) as call:
            r=self.client.post('/api/account/login',headers=self.origin,json={'username':'person','password':'somepassword'})
            self.assertEqual(r.status_code,429);self.assertEqual(call.await_count,1)
    def test_logout_clears_guest_cookies(self):
        r=self.client.post('/api/account/logout',headers=self.origin,json={})
        self.assertEqual(r.status_code,200);self.assertIn('Max-Age=0',r.headers['set-cookie'])
