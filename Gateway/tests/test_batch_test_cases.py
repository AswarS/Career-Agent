import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

spec = importlib.util.spec_from_file_location("batch", Path(__file__).parents[1] / "scripts" / "batch_test_cases.py")
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)
RUN_ID = "ace9f41d-e91f-4a17-93b2-91d5904f7418"


class FakeClient:
    def __init__(self, status="completed"):
        self.status = status
        self.calls = []

    def request(self, method, path, body=None):
        self.calls.append((method, path))
        if "trajectory?" in path:
            return {"messages_list": [{"role": "assistant", "content": "完成"}], "issues": [], "trainingReady": False, "reasons": ["missing_or_duplicate_tokens"]}
        if path.endswith("/finalize"):
            return {"runId": RUN_ID}
        return {"runId": RUN_ID, "status": "cancelled" if path.endswith("/cancel") else self.status}


class BatchTests(unittest.TestCase):
    def run_sample(self, client):
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root) / "case"
            result = {}
            batch.run_case(client, "case.json", {"query": "测试"}, folder, result)
            messages = json.loads((folder / "messages_list.json").read_text(encoding="utf-8"))
            saved = json.loads((folder / "result.json").read_text(encoding="utf-8"))
            self.assertEqual(saved, result)
            self.assertIsInstance(messages, list)
            return result

    def test_completed_export_does_not_require_training_tokens(self):
        client = FakeClient()
        result = self.run_sample(client)
        self.assertTrue(result["executionAndExportPassed"])
        self.assertFalse(result["trainingReady"])
        self.assertEqual(client.calls.count(("POST", "/v1/runs")), 1)
        self.assertIn(("POST", f"/v1/runs/{RUN_ID}/finalize"), client.calls)

    def test_failed_task_still_exports(self):
        result = self.run_sample(FakeClient("failed"))
        self.assertFalse(result["executionAndExportPassed"])
        self.assertEqual(result["status"], "failed")

    def test_client_timeout_cancels_and_keeps_partial_messages(self):
        client = FakeClient("running")
        with patch.object(batch, "RUN_TIMEOUT_SECONDS", -1):
            result = self.run_sample(client)
        self.assertTrue(result["cancelConfirmed"])
        self.assertFalse(result["executionAndExportPassed"])
        self.assertNotIn(("POST", f"/v1/runs/{RUN_ID}/finalize"), client.calls)

    def test_unconfirmed_post_is_not_retried(self):
        client = batch.Client("http://localhost:8787", "test-secret")
        with patch.object(client.opener, "open", side_effect=URLError("connection lost")) as request:
            with self.assertRaises(batch.ApiError):
                client.request("POST", "/v1/runs", {})
            self.assertEqual(request.call_count, 1)


if __name__ == "__main__":
    unittest.main()
