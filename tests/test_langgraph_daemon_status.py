from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "start-langgraph-dev.sh"


class LangGraphDaemonStatusScriptTests(unittest.TestCase):
    def test_status_json_returns_expected_keys(self) -> None:
        completed = subprocess.run(
            ["bash", str(SCRIPT), "status-json"],
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(completed.stdout)

        self.assertIn(payload["manager"], {"launchd", "nohup", "manual", "unknown"})
        self.assertIn(payload["lifecycle"], {"online", "offline", "starting"})
        self.assertEqual(payload["server_url"], "http://localhost:2024")
        self.assertEqual(payload["port"], 2024)
        self.assertIn("pid_file", payload)
        self.assertIn("stdout_log", payload)
        self.assertIn("stderr_log", payload)
        self.assertIn("launchd_loaded", payload)
        self.assertIn("autostart_installed", payload)
        self.assertIn("summary", payload)


if __name__ == "__main__":
    unittest.main()
