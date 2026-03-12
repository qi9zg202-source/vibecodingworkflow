#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

current_project=""
legacy_project=""

python3 -m py_compile "$repo_root/scripts/run-vibecoding-loop.py"

"$repo_root/scripts/init-web-vibecoding-project.sh" current-task "$tmp_root"
current_project="$(cd "$tmp_root/current-task" && pwd -P)"

current_json_path="$tmp_root/current-inspect.json"
python3 "$repo_root/scripts/run-vibecoding-loop.py" "$current_project" --action inspect --json > "$current_json_path"

python3 - "$current_project" "$current_json_path" <<'PY'
import json
import pathlib
import sys

project_root = pathlib.Path(sys.argv[1])
inspect_path = pathlib.Path(sys.argv[2])
payload = json.loads(inspect_path.read_text(encoding="utf-8"))

assert payload["status"] == "ready", payload
assert payload["task"]["path"] == str(project_root / "task.md"), payload
assert payload["artifacts"]["expected_session_summary_path"] == str(project_root / "artifacts" / "session-1-summary.md"), payload
assert payload["artifacts"]["next_session_spec_path"] == str(project_root / "outputs" / "session-specs" / "session-1-spec.json"), payload
assert pathlib.Path(payload["artifacts"]["next_session_spec_path"]).exists(), payload
PY

cp -R "$current_project" "$tmp_root/legacy-task"
legacy_project="$(cd "$tmp_root/legacy-task" && pwd -P)"
rm -f "$legacy_project/task.md"
rm -rf "$legacy_project/artifacts" "$legacy_project/outputs/session-specs" "$legacy_project/outputs/session-logs"

"$repo_root/scripts/migrate-vibecoding-project.sh" "$legacy_project"

legacy_json_path="$tmp_root/legacy-inspect.json"
python3 "$repo_root/scripts/run-vibecoding-loop.py" "$legacy_project" --action inspect --json > "$legacy_json_path"

python3 - "$legacy_project" "$legacy_json_path" <<'PY'
import json
import pathlib
import sys

project_root = pathlib.Path(sys.argv[1])
inspect_path = pathlib.Path(sys.argv[2])
payload = json.loads(inspect_path.read_text(encoding="utf-8"))

assert (project_root / "task.md").exists()
assert (project_root / "artifacts" / "session-summary-template.md").exists()
assert (project_root / "outputs" / "session-specs").exists()
assert (project_root / "outputs" / "session-logs").exists()
assert payload["status"] == "ready", payload
assert payload["task"]["path"] == str(project_root / "task.md"), payload
assert pathlib.Path(payload["artifacts"]["next_session_spec_path"]).exists(), payload
PY

echo "Workflow verification passed."
