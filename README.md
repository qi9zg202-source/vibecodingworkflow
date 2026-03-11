# vibecodingworkflow

Standalone workflow kit for multi-session webcoding projects.

This project is intentionally generic. It does not contain business data, business
source code, or any feature-specific runtime logic. It only provides:

- startup routing prompt
- memory/status template
- work plan template
- PRD/design/CLAUDE templates
- session 0 to 10 prompt templates
- reference docs for evidence, output shape, and testing
- a bootstrap script to generate a new workflow-driven project
- a fresh-session loop driver prototype for external orchestration

## Use Cases

Use this project before or during webcoding development when you need:

- a fixed `startup -> memory -> session` loop
- a recoverable workflow based on one fresh session per deliverable
- session-level test gates
- a reusable prompt/doc skeleton for new projects

## Quick Start

```bash
cd /Users/beckliu/Documents/0agentproject2026/googledrivesyn/skills/vibecodingworkflow
./scripts/init-web-vibecoding-project.sh my-web-feature /path/to/parent --git-init
```

The generated project will contain its own workflow files and can be used
independently from this template repository.

## Fresh Session Driver

This repository also includes:

```bash
python3 ./scripts/run-vibecoding-loop.py /path/to/project --print-startup
```

It is an external orchestration prototype that reads `memory.md`, checks whether
the next session may start, and prepares a fresh-session handoff.

## Project Structure

```text
vibecodingworkflow/
├── README.md
├── SKILL.md
├── .gitignore
├── docs/
├── scripts/
└── templates/
```
