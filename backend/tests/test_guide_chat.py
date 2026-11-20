import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from app.main import app


class GuideChatTests(unittest.TestCase):
    client = TestClient(app)
    question = dict(step=2, language="ko", destination="망상", activities="산책", mode="demo",
                    messages=[{"role": "user", "content": "예시 데이터가 뭐야?"}])

    def test_missing_key(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            self.assertEqual(self.client.post("/api/guide/chat", json=self.question).json()["detail"], "disabled")

    def test_conversation_and_context(self):
        ask = AsyncMock(return_value=({"reply": "화면 사용을 위한 예시예요."}, "ok"))
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test"}), patch("app.guide_chat.select_json", ask):
            response = self.client.post("/api/guide/chat", json=self.question)
        self.assertEqual(response.json(), {"reply": "화면 사용을 위한 예시예요."})
        self.assertEqual(ask.await_args.args[0], self.question)
        self.assertIn("해별이", ask.await_args.args[1])

    def test_bad_requests_and_provider_failures(self):
        for change in ({"step": 5}, {"messages": []}, {"messages": [{"role": "user", "content": " "}]}):
            self.assertEqual(self.client.post("/api/guide/chat", json={**self.question, **change}).status_code, 422)
        for result, expected in (((None, "limited"), 429), (({}, "ok"), 502)):
            with patch.dict(os.environ, {"OPENAI_API_KEY": "test"}), patch("app.guide_chat.select_json", new=AsyncMock(return_value=result)):
                self.assertEqual(self.client.post("/api/guide/chat", json=self.question).status_code, expected)
