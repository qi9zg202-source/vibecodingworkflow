#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/migrate-vibecoding-project.sh <project-root> [--title <task-title>] [--dry-run]

Upgrade a legacy vibecoding workflow project to the task-centered layout without
overwriting existing project files.
EOF
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

project_root=""
task_title=""
dry_run=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --title" >&2
        exit 1
      fi
      task_title="$2"
      shift 2
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -n "$project_root" ]]; then
        echo "Unexpected argument: $1" >&2
        usage >&2
        exit 1
      fi
      project_root="$1"
      shift
      ;;
  esac
done

if [[ -z "$project_root" ]]; then
  echo "Project root is required." >&2
  usage >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
template_root="$repo_root/templates"
project_root="$(cd -- "$project_root" && pwd)"

if [[ ! -f "$project_root/startup-prompt.md" || ! -f "$project_root/memory.md" ]]; then
  echo "Legacy workflow root must contain startup-prompt.md and memory.md: $project_root" >&2
  exit 1
fi

if [[ -z "$task_title" ]]; then
  task_title="$(basename "$project_root")"
fi

declare -a planned_paths=()
declare -a created_paths=()
declare -a skipped_paths=()

record_path() {
  local kind="$1"
  local path="$2"
  case "$kind" in
    planned) planned_paths+=("$path") ;;
    created) created_paths+=("$path") ;;
    skipped) skipped_paths+=("$path") ;;
  esac
}

ensure_dir() {
  local dir_path="$1"
  if [[ -d "$dir_path" ]]; then
    record_path skipped "$dir_path"
    return
  fi
  if $dry_run; then
    record_path planned "$dir_path"
    return
  fi
  mkdir -p "$dir_path"
  record_path created "$dir_path"
}

ensure_gitkeep() {
  local dir_path="$1"
  local keep_path="$dir_path/.gitkeep"
  if [[ -f "$keep_path" ]]; then
    record_path skipped "$keep_path"
    return
  fi
  if $dry_run; then
    record_path planned "$keep_path"
    return
  fi
  mkdir -p "$dir_path"
  : > "$keep_path"
  record_path created "$keep_path"
}

seed_file() {
  local src="$1"
  local dest="$2"
  if [[ -f "$dest" ]]; then
    record_path skipped "$dest"
    return
  fi
  if $dry_run; then
    record_path planned "$dest"
    return
  fi
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  FEATURE_NAME="$task_title" PROJECT_ROOT="$project_root" perl -0pi \
    -e 's/__FEATURE_NAME__/$ENV{FEATURE_NAME}/g; s#__PROJECT_ROOT__#$ENV{PROJECT_ROOT}#g' \
    "$dest"
  record_path created "$dest"
}

ensure_dir "$project_root/artifacts"
ensure_dir "$project_root/outputs/session-specs"
ensure_dir "$project_root/outputs/session-logs"

ensure_gitkeep "$project_root/artifacts"
ensure_gitkeep "$project_root/outputs/session-specs"
ensure_gitkeep "$project_root/outputs/session-logs"

seed_file "$template_root/task.md" "$project_root/task.md"
seed_file "$template_root/artifacts/session-summary-template.md" "$project_root/artifacts/session-summary-template.md"

if $dry_run; then
  echo "Migration dry run for: $project_root"
  if [[ ${#planned_paths[@]} -eq 0 ]]; then
    echo "No changes needed."
  else
    echo "Planned additions:"
    printf '  %s\n' "${planned_paths[@]}"
  fi
  exit 0
fi

echo "Migrated vibecoding workflow project:"
echo "  $project_root"

if [[ ${#created_paths[@]} -gt 0 ]]; then
  echo "Created:"
  printf '  %s\n' "${created_paths[@]}"
fi

if [[ ${#skipped_paths[@]} -gt 0 ]]; then
  echo "Already present:"
  printf '  %s\n' "${skipped_paths[@]}"
fi

echo "Next:"
echo "  Review existing startup-prompt.md, memory.md, and session prompts if this project predates task-centered templates."
printf '  Re-run the driver to verify: python3 %q %q --action inspect --json\n' \
  "$repo_root/scripts/run-vibecoding-loop.py" \
  "$project_root"
