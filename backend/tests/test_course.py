import unittest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.course import Course, Stop, schedule


class ScheduleTests(unittest.TestCase):
    def course(self, **changes):
        return Course(**dict(dict(start='Beach', activities='', conditions='', weather='',
            candidates=[Stop(name='Lunch',detail='',meal=True,duration=60,windows=[(720,840)],required=True),
                        Stop(name='Closed',detail='',windows=[],required=True),
                        Stop(name='Museum',detail='',duration=40,windows=[(840,960)],required=True)],
            extras=0,start_minute=660,end_minute=960,meal_times=[720]), **changes))

    def test_hours_closed_and_meal(self):
        result=schedule(self.course(),[1,2,0])
        self.assertEqual(result['order'],[0,2])
        self.assertEqual(result['timeline'][0]['arrival'],720)
        self.assertEqual(result['timeline'][1]['arrival'],840)
        self.assertEqual(result['missing_meals'],0)
        self.assertEqual(result['skipped'],[1])

    def test_meal_cannot_fit(self):
        result=schedule(self.course(end_minute=750),[0,1,2])
        self.assertEqual(result['missing_meals'],1)
        self.assertEqual(result['order'],[])

    def test_unknown_hours_are_not_verified(self):
        course=self.course(candidates=[Stop(name='Unknown',detail='')],meal_times=[])
        self.assertFalse(schedule(course,[0])['timeline'][0]['hours_known'])

    def test_break_is_respected(self):
        course=self.course(candidates=[Stop(name='Lunch',detail='',meal=True,duration=60,windows=[(600,730),(780,900)])])
        self.assertEqual(schedule(course,[0])['timeline'][0]['arrival'],780)

    def test_invalid_constraints(self):
        with self.assertRaises(ValueError): self.course(meal_times=[1000])
        with self.assertRaises(ValueError): Stop(name='X',detail='',windows=[(900,600)])

    def test_chat_disabled_and_untrusted_order(self):
        client=TestClient(app)
        payload={'course':self.course().model_dump(),'messages':[{'role':'user','content':'Less walking'}]}
        with patch('app.course.select_json',AsyncMock(return_value=(None,'disabled'))):
            self.assertEqual(client.post('/api/course/chat',json=payload).status_code,503)
        with patch('app.course.select_json',AsyncMock(return_value=({'order':[999,0,0,True,2,1],'reply':'Try lunch first'},'ok'))):
            result=client.post('/api/course/chat',json=payload)
            self.assertEqual(result.status_code,200)
            self.assertEqual(result.json()['order'],[0,2])
            self.assertEqual(result.json()['reply'],'Try lunch first')
