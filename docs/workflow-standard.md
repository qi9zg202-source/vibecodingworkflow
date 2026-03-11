# Workflow Standard

## Core Rule

Always re-enter through `startup-prompt.md`. Never jump directly into `session-N-prompt.md` after a previous session ends.

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

## Progress Loop

- finish current session
- update `memory.md`
- end the current session
- start a fresh session or fresh context
- re-enter through `startup-prompt.md`
- let `memory.md` route the next session

## Preferred Execution Mode

- preferred: one deliverable per fresh session
- do not rely on automatic continuation inside the same chat after the previous session ends
- let an external driver or the engineer start the next fresh session

## External Driver Pattern

Typical implementation:

- one workflow project holds `startup-prompt.md` and `memory.md`
- one external driver reads `memory.md`
- the driver starts a fresh session
- that fresh session runs `startup-prompt.md`
- the driver waits for the session to end and checks `memory.md` again
