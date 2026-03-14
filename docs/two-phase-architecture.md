# 两阶段架构详解

## 概述

VibeCoding Workflow 采用**两阶段架构**，将每个 Task 的执行分为两个明确的阶段：

| 阶段 | current_phase | Sessions | 目标 | 产出 |
|------|--------------|----------|------|------|
| **设计阶段** | `design` | Session 0 | 产出全部规划文档和 Session prompts | 文档 + prompts |
| **开发阶段** | `development` | Sessions 1–10 | 逐个执行 Session prompts，实现功能 | 代码 + 测试 |
| **完成** | `done` | — | 流程结束 | — |

---

## Phase 1 — 设计阶段（Design Phase）

### 目标

Session 0 产出：
1. **6 个核心文档**：`CLAUDE.md`, `task.md`, `PRD.md`, `design.md`, `work-plan.md`, `memory.md`
2. **11 个 Session prompts**：`session-0-prompt.md` 到 `session-10-prompt.md`
3. **Session 0 handoff artifacts**：`artifacts/session-0-summary.md` + `artifacts/session-0-manifest.json`

### 完整流程图

```mermaid
flowchart TD
    START["用户描述需求\n项目背景 + 功能目标"] --> ONBOARD["Agent 执行 onboarding-prompt.md\n引导问答"]
    ONBOARD --> INIT["运行 init-web-vibecoding-project.sh\n初始化项目目录"]
    INIT --> S0["执行 Session 0"]

    S0 --> DOC["生成所有文档"]
    DOC --> DOC1["CLAUDE.md\n项目背景和约束"]
    DOC --> DOC2["task.md\n功能目标和验收标准"]
    DOC --> DOC3["PRD.md\n需求文档"]
    DOC --> DOC4["design.md\n技术设计"]
    DOC --> DOC5["work-plan.md\nSession 0-10 拆分计划"]
    DOC --> DOC6["memory.md\n初始状态路由\ncurrent_phase: design\nnext_session: 0"]

    DOC --> PROMPTS["生成所有 Session prompts"]
    PROMPTS --> P0["session-0-prompt.md"]
    PROMPTS --> P1["session-1-prompt.md"]
    PROMPTS --> P2["session-2-prompt.md"]
    PROMPTS --> P3["session-3-prompt.md"]
    PROMPTS --> P4["..."]
    PROMPTS --> P10["session-10-prompt.md"]

    DOC1 & DOC2 & DOC3 & DOC4 & DOC5 & DOC6 & P0 & P1 & P2 & P3 & P4 & P10 --> TEST{"文档测试"}
    TEST -->|"passed"| SUMMARY["写 artifacts/session-0-summary.md\n写 artifacts/session-0-manifest.json"]
    TEST -->|"failed/blocked"| FIX["修复问题\n保持在 Session 0"]
    FIX --> S0

    SUMMARY --> UPDATE["更新 memory.md:\ncurrent_phase: development\nnext_session: 1\nsession_gate: ready"]
    UPDATE --> DONE["✅ Session 0 完成\n阶段转换：design → development"]
    DONE --> STOP["关闭当前会话"]

    style START fill:#f0fdf4,stroke:#0f766e
    style S0 fill:#dff1ec,stroke:#0f766e
    style DOC1 fill:#fef3c7,stroke:#d97706
    style DOC2 fill:#fef3c7,stroke:#d97706
    style DOC3 fill:#fef3c7,stroke:#d97706
    style DOC4 fill:#fef3c7,stroke:#d97706
    style DOC5 fill:#fef3c7,stroke:#d97706
    style DOC6 fill:#fef3c7,stroke:#d97706
    style P1 fill:#dbeafe,stroke:#3b82f6
    style P2 fill:#dbeafe,stroke:#3b82f6
    style P3 fill:#dbeafe,stroke:#3b82f6
    style P10 fill:#dbeafe,stroke:#3b82f6
    style UPDATE fill:#fed7aa,stroke:#d97706
    style DONE fill:#1d2725,color:#6ee7b7,stroke:#0f766e
```

### 关键点

1. **Session prompts 在 Session 0 就全部生成好了**
   - `session-1-prompt.md` 到 `session-10-prompt.md` 在设计阶段就写好
   - 每个 prompt 包含该 Session 的 Deliverable、Test Gate、执行指令
   - 开发阶段不需要再生成 prompts，只需逐个执行

2. **阶段转换条件**
   - Session 0 测试通过 → `current_phase: development`, `next_session: 1`
   - 测试失败 → 保持 `current_phase: design`, `next_session: 0`

3. **产出验证**
   - 所有文档存在且内容完整
   - `memory.md` 状态有效
   - `work-plan.md` 包含 Session 0-10 的 Deliverable + Test Gate

---

## Phase 2 — 开发阶段（Development Phase）

### 目标

逐个执行 Session 1 到 Session 10，每个 Session：
1. 读取对应的 `session-N-prompt.md`
2. 完成一个可测试的 Deliverable
3. 通过 Test Gate
4. 写 handoff artifacts
5. 更新 `memory.md`
6. 关闭会话

### 完整流程图

```mermaid
flowchart TD
    START["开新会话"] --> STARTUP["执行 startup-prompt.md"]
    STARTUP --> READ["读取 memory.md"]
    READ --> CHECK{"current_phase?"}

    CHECK -->|"done"| COMPLETE["🎉 Task 完成\n两阶段全部通过"]
    CHECK -->|"design"| S0["执行 Session 0\n（不应该到这里）"]
    CHECK -->|"development"| ROUTE["路由到 session-N-prompt.md\n（N = next_session）"]

    ROUTE --> EXEC["执行 Session N\n完成 Deliverable"]
    EXEC --> TEST{"测试结果"}

    TEST -->|"failed/blocked"| FIX["修复问题\n保持在 Session N"]
    FIX --> EXEC

    TEST -->|"passed"| WRITE1["写 artifacts/session-N-summary.md"]
    WRITE1 --> WRITE2["写 artifacts/session-N-manifest.json"]
    WRITE2 --> UPDATE{"N = 10?"}

    UPDATE -->|"No"| UPDATE1["更新 memory.md:\nnext_session = N+1\nsession_gate: ready"]
    UPDATE -->|"Yes"| UPDATE2["更新 memory.md:\ncurrent_phase: done\nsession_gate: done"]

    UPDATE1 --> CLOSE1["关闭当前会话"]
    UPDATE2 --> CLOSE2["关闭当前会话\n✅ 开发阶段完成"]

    CLOSE1 --> START
    CLOSE2 --> COMPLETE

    style START fill:#eff6ff,stroke:#3b82f6
    style ROUTE fill:#dbeafe,stroke:#3b82f6
    style EXEC fill:#dbeafe,stroke:#3b82f6
    style WRITE1 fill:#fef3c7,stroke:#d97706
    style WRITE2 fill:#fef3c7,stroke:#d97706
    style UPDATE1 fill:#fed7aa,stroke:#d97706
    style UPDATE2 fill:#fed7aa,stroke:#d97706
    style COMPLETE fill:#1d2725,color:#6ee7b7,stroke:#0f766e
```

### 每个 Session 的执行模式

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as Agent (Fresh Session)
    participant M as memory.md
    participant P as session-N-prompt.md
    participant S as artifacts/

    U->>A: 开新会话，执行 startup-prompt.md
    A->>M: 读取 current_phase + next_session
    M-->>A: development, next_session: N
    A->>P: 读取 session-N-prompt.md
    P-->>A: Session N 执行指令
    A->>A: 完成 Deliverable + 测试
    A->>S: 写 session-N-summary.md
    A->>S: 写 session-N-manifest.json
    A->>M: 更新 next_session = N+1
    A-->>U: Session N 完成，关闭会话

    Note over U,A: 关闭会话，开新会话

    U->>A: 开新会话，执行 startup-prompt.md
    A->>M: 读取 next_session
    M-->>A: next_session: N+1
    A->>P: 读取 session-(N+1)-prompt.md
    P-->>A: Session N+1 执行指令
```

### 关键规则

1. **不是批量执行，而是逐个执行**
   ```
   执行 Session 1 → 测试 → 更新 memory.md → 停止 → 关闭会话
   ↓
   开新会话 → 执行 startup-prompt.md → 读取 memory.md → 执行 Session 2 → ...
   ```

2. **每个 Session 在独立的 fresh context 中执行**
   - 不依赖聊天历史
   - 不依赖上一个 Session 的内存状态
   - 只依赖文件：`memory.md`, `task.md`, `design.md`, `work-plan.md`, `session-N-summary.md`

3. **`memory.md` 是唯一路由真相**
   - `current_phase` 决定是设计阶段还是开发阶段
   - `next_session` 决定该执行哪个 Session
   - `session_gate` 决定是否允许推进

4. **阶段转换条件**
   - Session 10 测试通过 → `current_phase: done`, `session_gate: done`
   - 测试失败 → 保持 `current_phase: development`, `next_session: 10`

---

## 两阶段对比

| 维度 | 设计阶段（Phase 1） | 开发阶段（Phase 2） |
|------|-------------------|-------------------|
| **Sessions** | Session 0 | Sessions 1–10 |
| **current_phase** | `design` | `development` |
| **产出类型** | 文档 + Session prompts | 代码 + 测试 |
| **执行次数** | 1 次 | 10 次（逐个） |
| **是否写业务代码** | ❌ 否 | ✅ 是 |
| **Session prompts** | 生成所有 prompts | 逐个执行 prompts |
| **阶段转换** | Session 0 passed → development | Session 10 passed → done |

---

## 常见误解澄清

### ❌ 误解 1：开发阶段需要先生成 Session prompts

**错误理解**：
```
开发阶段 = 计划节点（生成 sessionsubtask.md）→ 执行所有 sessionsubtask.md
```

**正确理解**：
```
Session prompts 在 Session 0 就全部生成好了
开发阶段只是逐个执行这些 prompts
```

### ❌ 误解 2：调度器批量执行所有 Sessions

**错误理解**：
```
调度器一次性执行 Session 1-10
```

**正确理解**：
```
调度器每次只执行一个 Session
执行完后停止，等待下一次调用
```

### ❌ 误解 3：Session 之间可以在同一个会话中连续执行

**错误理解**：
```
Session 1 → Session 2 → Session 3（同一个会话）
```

**正确理解**：
```
Session 1 → 关闭会话 → 开新会话 → Session 2 → 关闭会话 → 开新会话 → Session 3
```

---

## 实际执行示例

### Session 0（设计阶段）

```bash
# 用户发送
请读取 vibecodingworkflow/templates/onboarding-prompt.md，
然后按照其中的步骤引导我开始开发。

# Agent 执行
1. 引导问答，收集需求
2. 运行 init-web-vibecoding-project.sh
3. 生成所有文档（CLAUDE.md, task.md, PRD.md, design.md, work-plan.md, memory.md）
4. 生成所有 Session prompts（session-0-prompt.md 到 session-10-prompt.md）
5. 写 artifacts/session-0-summary.md
6. 写 artifacts/session-0-manifest.json
7. 更新 memory.md: current_phase: development, next_session: 1
8. 停止

# memory.md 状态
current_phase: development
next_session: 1
session_gate: ready
```

### Session 1（开发阶段）

```bash
# 用户关闭会话，开新会话，发送
工作目录切到 <项目目录>
请执行 startup-prompt.md 中的启动流程。

# Agent 执行
1. 读取 memory.md → current_phase: development, next_session: 1
2. 读取 session-1-prompt.md
3. 完成 Session 1 Deliverable（项目骨架）
4. 运行测试
5. 写 artifacts/session-1-summary.md
6. 写 artifacts/session-1-manifest.json
7. 更新 memory.md: next_session: 2
8. 停止

# memory.md 状态
current_phase: development
next_session: 2
session_gate: ready
```

### Session 2（开发阶段）

```bash
# 用户关闭会话，开新会话，发送
工作目录切到 <项目目录>
请执行 startup-prompt.md 中的启动流程。

# Agent 执行
1. 读取 memory.md → current_phase: development, next_session: 2
2. 读取 session-2-prompt.md
3. 完成 Session 2 Deliverable（Schema）
4. 运行测试
5. 写 artifacts/session-2-summary.md
6. 写 artifacts/session-2-manifest.json
7. 更新 memory.md: next_session: 3
8. 停止

# memory.md 状态
current_phase: development
next_session: 3
session_gate: ready
```

### ... 重复直到 Session 10

### Session 10（开发阶段最后一个）

```bash
# Agent 执行
1. 读取 memory.md → current_phase: development, next_session: 10
2. 读取 session-10-prompt.md
3. 完成 Session 10 Deliverable（收尾）
4. 运行测试
5. 写 artifacts/session-10-summary.md
6. 写 artifacts/session-10-manifest.json
7. 更新 memory.md: current_phase: done, session_gate: done
8. 停止

# memory.md 状态
current_phase: done
next_session: none
session_gate: done
```

---

## 总结

两阶段架构的核心原则：

1. **Session prompts 在 Session 0 就全部生成好了**
2. **开发阶段只是逐个执行这些 prompts**
3. **每个 Session 在独立的 fresh context 中执行**
4. **`memory.md` 是唯一路由真相**
5. **不是批量执行，而是逐个执行 → 停止 → 开新会话 → 执行下一个**
