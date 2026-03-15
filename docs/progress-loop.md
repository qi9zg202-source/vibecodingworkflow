# Progress Loop

## Two-Phase Structure

This workflow operates in **two distinct phases**:

| Phase | current_phase | Sessions | 目标 |
|-------|--------------|----------|------|
| 设计阶段 | `design` | Session 0 | 产出全部规划文档，不写业务代码 |
| 开发阶段 | `development` | Session 1–10 | 按 Session 逐步实现功能 |
| 完成 | `done` | — | 流程全部结束 |

### Phase Transition Rules

- **design → development**: Session 0 完成且 `tests: passed` → `current_phase: development`, `next_session: 1`
- **development → done**: Session 10 完成且 `tests: passed` → `current_phase: done`, `session_gate: done`
- 任意 Session 未通过 → 不转换阶段，不推进 `next_session`

```mermaid
stateDiagram-v2
    [*] --> design : Task 初始化
    design --> development : Session 0 通过
    development --> done : Session 10 通过
    done --> [*]
```

---

## Why This Exists

Multi-session development fails when the next step depends on chat memory instead of files.
This workflow avoids that by using a fixed loop:

1. finish one session
2. write `artifacts/session-N-summary.md`
3. record progress in `memory.md`
4. end the current session
5. start a fresh session / fresh context
6. re-enter through `startup-prompt.md`
7. continue from the session selected by `memory.md`

This loop now has two handoff layers:

- `memory.md`: machine routing truth
- `artifacts/session-N-summary.md`: human/model handoff evidence (human-readable)
- `artifacts/session-N-manifest.json`: machine-verifiable session completion record

```mermaid
graph TD
    A[Session N 执行工作] --> B[运行测试]
    B --> C{测试结果}
    C -->|failed / blocked| E[保持 session_gate: blocked\n不推进 next_session]
    E --> A
    C -->|passed| D[写 session-N-summary.md]
    D --> F[写 session-N-manifest.json]
    F --> G[更新 memory.md\nsession_gate = pending_review]
    G --> H[结束当前 Session]
    H --> WAIT[调度程序暂停\n通知用户验收]
    WAIT --> REVIEW{人工验收}
    REVIEW -->|✅ 验收通过| APPROVE[外部更新 memory.md\nnext_session = N+1\nsession_gate = ready]
    REVIEW -->|❌ 验收拒绝| REJECT[外部更新 memory.md\nsession_gate = blocked\n填写 review_notes]
    APPROVE --> I[调度程序推进\n开启 Fresh Session]
    REJECT --> A
    I --> J[执行 startup-prompt.md]
    J --> K[读取 memory.md\n路由到 Session N+1]
    K --> A
```

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

And persist a session summary file:

- `artifacts/session-N-summary.md`
- completed work
- changed files
- tests
- decisions
- risks
- next session inputs

And persist a session manifest file:

- `artifacts/session-N-manifest.json`
- session number and status
- produced artifacts list
- next session requirements
- test status

## Why Startup Must Run Every Time

After a session ends, the model should not guess which session comes next.
`startup-prompt.md` exists to:

- read `memory.md`
- read `task.md`
- read the previous session summary when it exists
- validate `session_gate`
- route to the correct `session-N-prompt.md`
- block unsafe forward movement

## Required Loop

- do not jump directly into `session-2-prompt.md` or later
- do not continue based on previous chat memory
- do not push `next_session` forward if tests failed
- do not skip writing `artifacts/session-N-summary.md`
- do not skip writing `artifacts/session-N-manifest.json`
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

The preferred automation shape is an external session driver with a **Human-in-the-Loop (HITL) review gate** after every session.

```
Claude 执行 Session N
  → 测试通过 → 写 summary + manifest → session_gate = pending_review
  → 调度程序暂停，通知用户验收
  → 用户验收通过 → session_gate = ready → 驱动器推进下一个 Session
  → 用户验收拒绝 → session_gate = blocked + review_notes → 驱动器重做本 Session
```

Example responsibilities:

- inspect `memory.md`
- confirm `session_gate = ready`
- resolve the previous session summary
- emit `outputs/session-specs/session-N-spec.json`
- launch one fresh session
- feed `startup-prompt.md`
- wait for session completion
- re-check `memory.md`

```mermaid
sequenceDiagram
    participant D as External Driver\n(run-vibecoding-loop.py)
    participant M as memory.md
    participant S as startup-prompt.md
    participant A as Agent (Fresh Session)
    participant U as Engineer (Human Review)
    participant O as outputs/

    D->>M: inspect session_gate
    M-->>D: session_gate = ready, next_session = N
    D->>O: emit session-N-spec.json
    D->>A: launch fresh session + feed startup-prompt.md
    A->>M: read memory.md
    A->>S: execute startup-prompt.md
    S-->>A: route to session-N-prompt.md
    A->>A: execute Session N work + tests
    A->>O: write session-N-summary.md
    A->>O: write session-N-manifest.json
    A->>M: update memory.md (session_gate = pending_review)
    A-->>D: session complete, awaiting review
    D->>U: notify: Session N ready for review
    U->>O: review session-N-summary.md + artifacts
    alt 验收通过
        U->>M: session_gate = ready, next_session = N+1
        D->>M: re-check memory.md → advance
    else 验收拒绝
        U->>M: session_gate = blocked, review_notes = "..."
        D->>M: re-check memory.md → re-run Session N
    end
```

## Correct Sequence

```text
Session N work
-> tests
-> write session-N-summary.md
-> write session-N-manifest.json
-> update memory.md (session_gate = pending_review)
-> end current session
-> driver pauses, notifies engineer
-> engineer reviews artifacts
-> [approved] update memory.md (session_gate = ready, next_session = N+1)
-> [rejected] update memory.md (session_gate = blocked, review_notes = "...")
-> driver re-checks memory.md
-> [approved] start fresh session -> run startup-prompt.md -> Session N+1
-> [rejected] start fresh session -> run startup-prompt.md -> re-run Session N
```

## Blocked and Failed Sessions

If the session is blocked or failed:

- keep `next_session` on the current session
- set `last_completed_session_tests` to `blocked` or `failed`
- set `session_gate` to `blocked`
- explain the blocker in `memory.md`

```mermaid
stateDiagram-v2
    [*] --> ready : Session 0 完成后初始化
    ready --> in_progress : 进入 Session N
    in_progress --> pending_review : 测试通过\n写 summary + manifest
    pending_review --> ready : 人工验收通过\nnext_session +1
    pending_review --> blocked : 人工验收拒绝\n留 review_notes
    in_progress --> blocked : 遇到阻塞或失败
    blocked --> in_progress : 修复后重试
    ready --> done : Session 10 验收通过
    done --> [*]
```

## Completed Sessions

If the session is complete:

- set `last_completed_session_tests: passed`
- move `next_session` forward
- set `session_gate: ready`
- describe the handoff inputs for the next session
