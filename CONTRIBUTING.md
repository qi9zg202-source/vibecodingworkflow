# Contributing

## Scope

This repository is workflow-first.

Core content stays generic under the root workflow kit. Companion implementations
or productized integrations must remain isolated under `integrations/`.

Allowed content:

- task-level workflow docs and templates
- vibecoding workflow prompts
- session summary handoff templates
- session templates
- project bootstrap scripts
- reference docs for process, testing, and output shape
- companion integrations under `integrations/`

Not allowed:

- business source code
- business data
- feature-specific runtime logic
- product assets copied from other projects

Exception:

- explicitly requested companion integrations may live under `integrations/`

## Update Rule

When updating this repository:

1. keep templates generic
2. do not embed project-specific paths except placeholders
3. preserve the model `Task > Session > Summary handoff`
4. validate the bootstrap script by generating a sample project
5. validate legacy-project migration when the task-centered contract changes
6. avoid changes that require past conversation context to use
7. keep integration-specific code out of `templates/`, `docs/`, and core scripts unless the integration truly changes the shared contract

## Validation

Before commit:

- check generated files exist
- check template placeholders are replaced
- check `task.md` and session-summary paths are generated
- check legacy projects can be migrated without overwriting existing workflow files
- check the generated project can be initialized as its own git repo
- check the driver still emits machine-readable task and handoff artifacts
