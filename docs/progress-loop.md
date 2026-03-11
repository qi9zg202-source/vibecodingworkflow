# Progress Loop

## Why This Exists

Multi-session development fails when the next step depends on chat memory instead of files.
This workflow avoids that by using a fixed loop:

1. finish one session
2. record progress in `memory.md`
3. end the current session
4. start a fresh session / fresh context
5. re-enter through `startup-prompt.md`
6. continue from the session selected by `memory.md`

## What Must Be Recorded Every Session

At minimum, write these back into `memory.md`:

- `last_completed_session`
- `last_completed_session_tests`
- `next_session`
- `next_session_prompt`
- `session_gate`

Also record a short progress note:

- what this session completed
- what tests were run
- whether tests passed, failed, or were blocked
- what the next session needs to read

## Why Startup Must Run Every Time

After a session ends, the model should not guess which session comes next.
`startup-prompt.md` exists to:

- read `memory.md`
- validate `session_gate`
- route to the correct `session-N-prompt.md`
- block unsafe forward movement

## Required Loop

- do not jump directly into `session-2-prompt.md` or later
- do not continue based on previous chat memory
- do not push `next_session` forward if tests failed
- do not end a session before updating `memory.md`
- do not treat "auto-continue inside the same chat" as the preferred mode

## Preferred Restart Strategy

The preferred execution mode is:

- one completed deliverable per session
- then terminate that session
- then open a fresh session
- then run `startup-prompt.md` again

Why:

- cleaner context boundaries
- lower risk of hidden prompt carry-over
- easier automation outside the chat window
- safer gating on `memory.md`

## Automation Shape

The preferred automation shape is an external session driver, not in-chat self continuation.

Example responsibilities:

- inspect `memory.md`
- confirm `session_gate = ready`
- launch one fresh session
- feed `startup-prompt.md`
- wait for session completion
- re-check `memory.md`

## Correct Sequence

```text
Session N work
-> tests
-> update memory.md
-> end current session
-> start fresh session
-> run startup-prompt.md
-> startup reads memory.md
-> Session N+1 or stay on Session N
```

## Blocked and Failed Sessions

If the session is blocked or failed:

- keep `next_session` on the current session
- set `last_completed_session_tests` to `blocked` or `failed`
- set `session_gate` to `blocked`
- explain the blocker in `memory.md`

## Completed Sessions

If the session is complete:

- set `last_completed_session_tests: passed`
- move `next_session` forward
- set `session_gate: ready`
- describe the handoff inputs for the next session
