# Workflow Standard

## Core Rule

Always re-enter through `startup-prompt.md`. Never jump directly into `session-N-prompt.md` after `/clear`.

## State Machine

- `memory.md` is the only source of truth
- `session_gate = ready` means the next session may start
- `failed` or `blocked` means stay on the current session
- `done` means the flow is complete

## Session Rule

- one session = one deliverable
- one session = one test gate
- no cross-session implementation
- no "code complete but untested" handoff
