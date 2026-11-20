import unittest
from datetime import datetime,timedelta
from unittest.mock import AsyncMock,patch
from app.coastal import KST,viewing_slots,parse_day
from app.course import Course,Stop,schedule_with_coast,generate

class SeaScheduleTests(unittest.TestCase):
    def make(self):
        return Course(start='Beach',activities='walk',conditions='',weather='',origin=(37.5,129.1),candidates=[
            Stop(name='Beach',detail='',required=True,coastal=True,point=(37.5,129.1)),
            Stop(name='Cafe',detail='',required=True,point=(37.501,129.101)),
            Stop(name='Lunch',detail='',required=True,meal=True,duration=60,point=(37.502,129.102))],extras=0,
            start_minute=600,end_minute=1080,meal_times=[720])
    def test_reorders_around_afternoon_sea_and_preserves_meal(self):
        c=self.make();p={'minute':840,'score':1,'wave':.5,'wind':2,'rain':0}
        r=schedule_with_coast(c,[0,1,2],{'status':'candidates'},[p])
        self.assertEqual(r['order'],[1,2,0]);self.assertEqual(r['missing_meals'],0)
        self.assertEqual(r['timeline'][-1]['arrival'],840)
    def test_short_visit_fits_within_half_hour(self):
        c = self.make()
        c.start_minute, c.end_minute, c.meal_times = 840, 870, []
        c.candidates[0].duration = 15
        result = schedule_with_coast(c,[0],{"status":"candidates"},[{"minute":840,"score":1}])
        row, = result["timeline"]
        self.assertEqual(row["departure"] - row["arrival"], 15)
        self.assertLessEqual(row["departure"], 870)

    def test_missing_forecast_never_schedules_sea(self):
        r=schedule_with_coast(self.make(),[0,1,2],{'status':'unavailable'},[])
        self.assertNotIn(0,r['order']);self.assertIn(1,r['order']);self.assertIsNone(r['sea_plan'].get('selected'))
    def test_meal_conflict_chooses_other_hour(self):
        r=schedule_with_coast(self.make(),[0,1,2],{'status':'candidates'},[{'minute':720,'score':1},{'minute':840,'score':2}])
        self.assertEqual(r['sea_plan']['selected']['minute'],840)
    def test_bad_weather_night_and_past_are_not_candidates(self):
        base={'minute':840,'wave':.5,'wind':2,'rain':0,'thunder':False,'daylight':True}
        for changes in [{'wave':1.5},{'wind':8},{'rain':1},{'thunder':True},{'daylight':False}]:
            self.assertEqual(viewing_slots([{**base,**changes}],600,1080),[])
        self.assertEqual(viewing_slots([base],600,1080,now_minute=841),[])
    def test_missing_hourly_value_is_not_calm(self):
        day='2026-11-21';stamp=day+'T14:00'
        w={'utc_offset_seconds':32400,'hourly_units':{'wind_speed_10m':'m/s','precipitation':'mm','weather_code':'wmo code'},'hourly':{'time':[stamp],'wind_speed_10m':[2],'precipitation':[0],'weather_code':[1]},'daily':{'time':[day],'sunrise':[day+'T07:00'],'sunset':[day+'T17:00']}}
        m={'utc_offset_seconds':32400,'hourly_units':{'wave_height':'m'},'hourly':{'time':[stamp],'wave_height':[None]}}
        with self.assertRaises(ValueError):parse_day(w,m,day)

class SeaEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_closed_overrides_model(self):
        course=SeaScheduleTests().make();course.coastal_closed=True
        with patch('app.course.select_json',AsyncMock(return_value=({'order':[0,1,2]},'ok'))):
            r=await generate(course)
        self.assertEqual(r['sea_plan']['status'],'closed');self.assertNotIn(0,r['order'])
    async def test_demo_is_explicitly_labeled(self):
        course=SeaScheduleTests().make();course.mode='demo';course.beach_id='mangsang'
        with patch('app.course.select_json',AsyncMock(return_value=(None,'disabled'))):r=await generate(course)
        self.assertTrue(r['sea_plan']['is_demo']);self.assertEqual(r['sea_plan']['status'],'scheduled')
