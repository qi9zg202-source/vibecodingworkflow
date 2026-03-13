---
name: vibecodingworkflow
description: Set up and enforce a task-centered multi-session webcoding workflow with task.md, startup-prompt.md, memory routing, session summaries (human-readable) + manifests (machine-verifiable), work plan, PRD/design templates, and session 0-10 prompt templates where each completed session hands off to a fresh next session.
---

# vibecodingworkflow

Use this skill when the user wants to:

- create a reusable vibecoding workflow project
- bootstrap a new webcoding project with `task.md`, `startup-prompt.md`, `memory.md`, session summaries, session manifests, and session prompts
- enforce fresh-session multi-session development with dual-track handoff (summary + manifest)
- standardize session boundaries and test gates across projects
- standardize task-level orchestration and session-to-session handoff
- implement machine-verifiable session completion tracking

## Workflow

1. Read [`README.md`](./README.md) for purpose and usage.
2. Read [`docs/workflow-standard.md`](./docs/workflow-standard.md) when the user wants the process rules.
3. Read [`docs/session-map.md`](./docs/session-map.md) when the user wants a recommended 0-10 split.
4. Read [`docs/progress-loop.md`](./docs/progress-loop.md) when the user asks about session restarts or orchestration.
5. Use [`scripts/init-web-vibecoding-project.sh`](./scripts/init-web-vibecoding-project.sh) to generate a new project from the templates.
6. Use [`scripts/migrate-vibecoding-project.sh`](./scripts/migrate-vibecoding-project.sh) when an older workflow project must be upgraded to the new task-centered layout without overwriting existing files.
7. Use [`scripts/run-vibecoding-loop.py`](./scripts/run-vibecoding-loop.py) when you need an external fresh-session driver prototype with task and session-summary handoff.
8. Only read files under [`templates/`](./templates/) when you need to inspect or adjust the generated prompt/doc contents.

## Boundaries

- Do not move business code, business data, or feature-specific assets into this project.
- Keep this repository generic and workflow-only.
- Generated projects should consume these templates, not inherit unrelated runtime logic.
- Keep the model `Task > Session > Summary + Manifest handoff`; do not reintroduce prompt-only routing without task and summary layers.
- Prefer explicit migration for legacy projects; do not add driver fallback that makes `task.md` optional again.

Exception:

- if the user explicitly asks to carry a companion integration into this repository, keep it isolated under `integrations/` and do not let it rewrite the shared workflow contract
