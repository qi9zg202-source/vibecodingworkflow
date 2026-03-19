#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/migrate-vibecoding-project.sh <project-root> [--title <task-title>] [--task-slug <task-slug>] [--dry-run]

Upgrade a legacy vibecoding workflow project to the project_root/task_root layout
without overwriting existing files.
EOF
}

slugify() {
  local raw="$1"
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  raw="$(printf '%s' "$raw" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  if [[ -z "$raw" ]]; then
    return 1
  fi
  printf '%s\n' "$raw"
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

project_root=""
task_title=""
task_slug=""
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
    --task-slug)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --task-slug" >&2
        exit 1
      fi
      task_slug="$2"
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

if [[ -z "$task_slug" ]]; then
  task_slug="$(slugify "$task_title")"
fi

if [[ ! "$task_slug" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid task slug: $task_slug" >&2
  exit 1
fi

task_root="$project_root/tasks/$task_slug"

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

path_recorded() {
  local path="$1"
  local item
  for item in ${planned_paths[@]+"${planned_paths[@]}"} ${created_paths[@]+"${created_paths[@]}"} ${skipped_paths[@]+"${skipped_paths[@]}"}; do
    if [[ "$item" == "$path" ]]; then
      return 0
    fi
  done
  return 1
}

apply_template_vars() {
  local path="$1"
  FEATURE_NAME="$task_title" PROJECT_ROOT="$project_root" TASK_ROOT="$task_root" perl -0pi \
    -e 's/__FEATURE_NAME__/$ENV{FEATURE_NAME}/g; s#__PROJECT_ROOT__#$ENV{PROJECT_ROOT}#g; s#__TASK_ROOT__#$ENV{TASK_ROOT}#g' \
    "$path"
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

copy_file_if_missing() {
  local src="$1"
  local dest="$2"
  local apply_vars="${3:-false}"
  if [[ ! -f "$src" ]]; then
    return
  fi
  if path_recorded "$dest"; then
    return
  fi
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
  if [[ "$apply_vars" == "true" ]]; then
    apply_template_vars "$dest"
  fi
  record_path created "$dest"
}

copy_tree_if_missing() {
  local src_root="$1"
  local dest_root="$2"
  if [[ ! -d "$src_root" ]]; then
    return
  fi
  while IFS= read -r -d '' src; do
    local rel="${src#$src_root/}"
    copy_file_if_missing "$src" "$dest_root/$rel"
  done < <(find "$src_root" -type f -print0)
}

seed_file() {
  local src="$1"
  local dest="$2"
  if path_recorded "$dest"; then
    return
  fi
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
  apply_template_vars "$dest"
  record_path created "$dest"
}

ensure_dir "$project_root/customer_context"
ensure_dir "$project_root/tasks"
ensure_dir "$task_root"
ensure_dir "$task_root/artifacts"
ensure_dir "$task_root/scripts"
ensure_dir "$task_root/outputs/samples"
ensure_dir "$task_root/outputs/reports"
ensure_dir "$task_root/outputs/session-specs"
ensure_dir "$task_root/outputs/session-logs"

ensure_gitkeep "$project_root/customer_context"
ensure_gitkeep "$task_root/scripts"
ensure_gitkeep "$task_root/artifacts"
ensure_gitkeep "$task_root/outputs/samples"
ensure_gitkeep "$task_root/outputs/reports"
ensure_gitkeep "$task_root/outputs/session-specs"
ensure_gitkeep "$task_root/outputs/session-logs"

# Copy existing legacy task-level files into task_root first.
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
  copy_file_if_missing "$project_root/$f" "$task_root/$f" true
done

copy_tree_if_missing "$project_root/artifacts" "$task_root/artifacts"
copy_tree_if_missing "$project_root/outputs/session-specs" "$task_root/outputs/session-specs"
copy_tree_if_missing "$project_root/outputs/session-logs" "$task_root/outputs/session-logs"
copy_tree_if_missing "$project_root/outputs/samples" "$task_root/outputs/samples"
copy_tree_if_missing "$project_root/outputs/reports" "$task_root/outputs/reports"

# Seed anything still missing from templates.
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
  seed_file "$template_root/$f" "$task_root/$f"
done

seed_file "$template_root/artifacts/session-summary-template.md" "$task_root/artifacts/session-summary-template.md"

if [[ ! -f "$project_root/CLAUDE.md" ]]; then
  seed_file "$template_root/CLAUDE.md" "$project_root/CLAUDE.md"
fi

if $dry_run; then
  echo "Migration dry run for: $project_root"
  echo "  task_root: $task_root"
  if [[ ${#planned_paths[@]} -eq 0 ]]; then
    echo "No changes needed."
  else
    echo "Planned additions:"
    printf '  %s\n' "${planned_paths[@]}"
  fi
  exit 0
fi

echo "Migrated vibecoding workflow project:"
echo "  project_root: $project_root"
echo "  task_root:    $task_root"

if [[ ${#created_paths[@]} -gt 0 ]]; then
  echo "Created:"
  printf '  %s\n' "${created_paths[@]}"
fi

if [[ ${#skipped_paths[@]} -gt 0 ]]; then
  echo "Already present:"
  printf '  %s\n' "${skipped_paths[@]}"
fi

echo "Notes:"
echo "  Legacy root-level task files were left untouched for safety."
echo "  Continue from task_root going forward."
echo "Next:"
echo "  Review task_root/startup-prompt.md, memory.md, and session prompts before the next run."
