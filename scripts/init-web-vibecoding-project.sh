#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/init-web-vibecoding-project.sh <project-name> [target-parent-dir] [--task-slug <task-slug>] [--git-init]

Generate a new webcoding workflow project from the templates in this repository.
EOF
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

project_name="$1"
shift

target_parent="$(pwd)"
task_slug=""
git_init=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-slug)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --task-slug" >&2
        exit 1
      fi
      task_slug="$2"
      shift 2
      ;;
    --git-init)
      git_init=true
      shift
      ;;
    *)
      target_parent="$1"
      shift
      ;;
  esac
done

if [[ ! "$project_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid project name: $project_name" >&2
  exit 1
fi

if [[ -z "$task_slug" ]]; then
  task_slug="$project_name"
fi

if [[ ! "$task_slug" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid task slug: $task_slug" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
template_root="$repo_root/templates"
project_root="${target_parent%/}/$project_name"
task_root="$project_root/tasks/$task_slug"

if [[ -e "$project_root" ]]; then
  echo "Target already exists: $project_root" >&2
  exit 1
fi

mkdir -p \
  "$project_root/customer_context" \
  "$project_root/tasks" \
  "$task_root/artifacts" \
  "$task_root/scripts" \
  "$task_root/outputs/samples" \
  "$task_root/outputs/reports" \
  "$task_root/outputs/session-specs" \
  "$task_root/outputs/session-logs"

# Project-level files.
cp "$template_root/CLAUDE.md" "$project_root/CLAUDE.md"

# Task-level files.
for f in \
  task.md \
  memory.md \
  startup-prompt.md \
  design.md \
  PRD.md \
  work-plan.md \
  session-0-prompt.md \
  session-1-prompt.md \
  session-2-prompt.md \
  session-3-prompt.md \
  session-4-prompt.md \
  session-5-prompt.md \
  session-6-prompt.md \
  session-7-prompt.md \
  session-8-prompt.md \
  session-9-prompt.md \
  session-10-prompt.md
do
  cp "$template_root/$f" "$task_root/$f"
done

# Copy artifacts directory (contains session-summary-template.md) into task_root.
cp -R "$template_root/artifacts/." "$task_root/artifacts/"
touch \
  "$project_root/customer_context/.gitkeep" \
  "$task_root/scripts/.gitkeep" \
  "$task_root/artifacts/.gitkeep" \
  "$task_root/outputs/samples/.gitkeep" \
  "$task_root/outputs/reports/.gitkeep" \
  "$task_root/outputs/session-specs/.gitkeep" \
  "$task_root/outputs/session-logs/.gitkeep"

export FEATURE_NAME="$task_slug"
export PROJECT_ROOT="$project_root"
export TASK_ROOT="$task_root"

while IFS= read -r -d '' file; do
  perl -0pi -e 's/__FEATURE_NAME__/$ENV{FEATURE_NAME}/g; s#__PROJECT_ROOT__#$ENV{PROJECT_ROOT}#g; s#__TASK_ROOT__#$ENV{TASK_ROOT}#g' "$file"
done < <(find "$project_root" -type f -print0)

if $git_init; then
  git init -b main "$project_root" >/dev/null
fi

echo "Initialized webcoding workflow project:"
echo "  project_root: $project_root"
echo "  task_root:    $task_root"
