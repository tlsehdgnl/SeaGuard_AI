import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app.programs import programs, read_listing


class ProgramListingTests(unittest.IsolatedAsyncioTestCase):
    async def test_open_filter_reads_second_page(self):
        def page(number):
            html = f"""<select id="searchStatusCd"><option value="apply" selected></option></select>
                <span class="total"><b>2</b></span><div class="article-item"><a class="title"
                onclick="fnDetail('{number}')">강좌 {number}</a><div class="info-info">
                <p>강좌기간 : 2026-12-01</p><p>접수기간 : 2026-11-20 ~ 2026-11-22</p></div>
                <div class="status">접수중</div></div>"""
            return httpx.Response(200,text=html,request=httpx.Request("GET","https://example.org"))
        client = AsyncMock()
        client.get.side_effect = [page(1), page(2)]
        items = await read_listing(client, "2026-11-20", "apply")
        self.assertEqual([p["days_left"] for p in items], [2, 2])
        self.assertEqual(client.get.call_args.kwargs["params"]["currentPageNo"], 2)

    async def test_filtered_outage_does_not_report_zero(self):
        async def listing(client, today, category):
            if category == "apply":
                raise httpx.ReadTimeout("offline")
            return []
        with patch("app.programs.read_listing", listing):
            data = await programs()
        self.assertIsNone(data["open_count"])
        self.assertEqual(data["missing"], ["접수중"])
