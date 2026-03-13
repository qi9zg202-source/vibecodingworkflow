#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/init-web-vibecoding-project.sh <feature-name> [target-parent-dir] [--git-init]

Generate a new webcoding workflow project from the templates in this repository.
EOF
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

feature_name="$1"
shift

target_parent="$(pwd)"
git_init=false

while [[ $# -gt 0 ]]; do
  case "$1" in
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

if [[ ! "$feature_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid feature name: $feature_name" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
template_root="$repo_root/templates"
target_dir="${target_parent%/}/$feature_name"

if [[ -e "$target_dir" ]]; then
  echo "Target already exists: $target_dir" >&2
  exit 1
fi

mkdir -p "$target_dir"

# Copy only the files a workflow project needs.
# Excluded: references/ (framework docs, not runtime files)
#           onboarding-prompt.md (lives in vibecodingworkflow repo, not in generated projects)
for f in \
  CLAUDE.md \
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
  session-10-prompt.md \
; do
  cp "$template_root/$f" "$target_dir/$f"
done

# Copy artifacts directory (contains session-summary-template.md)
cp -R "$template_root/artifacts" "$target_dir/artifacts"

mkdir -p \
  "$target_dir/scripts" \
  "$target_dir/outputs/samples" \
  "$target_dir/outputs/reports" \
  "$target_dir/outputs/session-specs" \
  "$target_dir/outputs/session-logs"
touch \
  "$target_dir/scripts/.gitkeep" \
  "$target_dir/artifacts/.gitkeep" \
  "$target_dir/outputs/samples/.gitkeep" \
  "$target_dir/outputs/reports/.gitkeep" \
  "$target_dir/outputs/session-specs/.gitkeep" \
  "$target_dir/outputs/session-logs/.gitkeep"

export FEATURE_NAME="$feature_name"
export PROJECT_ROOT="$target_dir"

while IFS= read -r -d '' file; do
  perl -0pi -e 's/__FEATURE_NAME__/$ENV{FEATURE_NAME}/g; s#__PROJECT_ROOT__#$ENV{PROJECT_ROOT}#g' "$file"
done < <(find "$target_dir" -type f -print0)

if $git_init; then
  git init -b main "$target_dir" >/dev/null
fi

echo "Initialized webcoding workflow project:"
echo "  $target_dir"
