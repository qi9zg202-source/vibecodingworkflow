工作目录切到 __TASK_ROOT__

你现在进入的是一个两阶段多 Session webcoding 开发流程。

---

## 两阶段结构

| 阶段 | current_phase | Sessions | 目标 |
|------|--------------|----------|------|
| 设计阶段 | `design` | Session 0 | 产出全部规划文档，不写业务代码 |
| 开发阶段 | `development` | Session 1–10 | 按 Session 逐步实现功能 |
| 完成 | `done` | — | 流程全部结束 |

---

## 启动规则

1. 先读取 `memory.md` 的 `Session Status`
2. 检查 `current_phase`（`design` / `development` / `done`）
3. 检查 `session_gate`（`ready` / `blocked` / `in_progress` / `done`）
4. 只有 `session_gate = ready` 才允许进入下一 Session
5. 若 `session_gate != ready`，必须停止并报告原因
6. 若 `current_phase = done`，说明两阶段全部完成，流程结束

---

## 阶段路由

### 设计阶段（current_phase = design）

- 只执行 Session 0
- Session 0 产出：`__PROJECT_ROOT__/CLAUDE.md`、`__TASK_ROOT__/task.md`、`__TASK_ROOT__/PRD.md`、`__TASK_ROOT__/design.md`、`__TASK_ROOT__/work-plan.md`、`__TASK_ROOT__/memory.md`
- Session 0 通过后：`current_phase` 转为 `development`，`next_session: 1`

### 开发阶段（current_phase = development）

必须先读取：
- `__PROJECT_ROOT__/CLAUDE.md`
- `__TASK_ROOT__/task.md`
- `__TASK_ROOT__/design.md`
- `__TASK_ROOT__/work-plan.md`
- `__TASK_ROOT__/memory.md`

补充规则：
- 若 `last_completed_session > 0` 且存在 `artifacts/session-{last_completed_session}-summary.md`，必须在进入下一轮前读取上一轮 summary
- 不允许只凭上一轮聊天历史继续推进

---

## 执行方式

1. 读取 `Session Status`（`current_phase` + `session_gate` + `next_session`）
2. 按阶段路由确认当前 Session
3. 若存在上一轮 summary，先��取上一轮 summary
4. 读取对应 `session-X-prompt.md`
5. 严格只完成该 Session
6. 执行本 Session 测试 Gate
7. 先写本轮 `artifacts/session-X-summary.md`（人类可读）
8. 再写本轮 `artifacts/session-X-manifest.json`（机器可验证）
9. 再更新 `memory.md`（含 `current_phase` 若发生阶段转换）
10. 输出收尾说明后停止

---

## 每轮循环规则

- Session 完成后，必须先写本轮 `session summary`（artifacts/session-X-summary.md）
- Session 完成后，必须同步写入本轮 `session manifest`（artifacts/session-X-manifest.json）
- 再更新 `memory.md`（含阶段转换字段）
- 更新完成后，结束当前会话
- 推荐做法是启动一个新的 Session / 新上下文，而不是在原会话里自动续跑
- 新会话里再次执行 `startup-prompt.md`
- 不要直接执行 `session-N-prompt.md`
- 下一轮该进入哪个 Session，只能由 `memory.md` 决定

---

## 固定输出格式

```
Phase: design | development | done
Session X complete
Tests: passed | failed | blocked
Phase transition: design → development  （仅在阶段转换时输出）
Summary: artifacts/session-X-summary.md
Manifest: artifacts/session-X-manifest.json
Next: session-Y-prompt.md
Start a fresh session before running the next startup-prompt.md
```
