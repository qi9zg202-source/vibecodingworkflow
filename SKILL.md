---
name: vibecodingworkflow
description: Set up and enforce a multi-session webcoding workflow with a startup prompt, memory state machine, work plan, PRD/design templates, and session 0-10 prompt templates for recoverable AI-driven development.
---

# vibecodingworkflow

Use this skill when the user wants to:

- create a reusable vibecoding workflow project
- bootstrap a new webcoding project with `startup-prompt.md`, `memory.md`, and session prompts
- enforce `/clear`-safe multi-session development
- standardize session boundaries and test gates across projects

## Workflow

1. Read [`README.md`](./README.md) for purpose and usage.
2. Read [`docs/workflow-standard.md`](./docs/workflow-standard.md) when the user wants the process rules.
3. Read [`docs/session-map.md`](./docs/session-map.md) when the user wants a recommended 0-10 split.
4. Use [`scripts/init-web-vibecoding-project.sh`](./scripts/init-web-vibecoding-project.sh) to generate a new project from the templates.
5. Only read files under [`templates/`](./templates/) when you need to inspect or adjust the generated prompt/doc contents.

## Boundaries

- Do not move business code, business data, or feature-specific assets into this project.
- Keep this repository generic and workflow-only.
- Generated projects should consume these templates, not inherit unrelated runtime logic.
