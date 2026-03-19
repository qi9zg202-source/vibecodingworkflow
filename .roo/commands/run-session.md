---
description: "执行当前项目的下一个 tasksubsession。读取 memory.md 确认进度，加载对应 tasksubsessionN.md 并执行。"
argument-hint: "[可选: session编号，如 3]"
mode: code
---

# Run VibeCoding Session

## 执行步骤

1. 读取当前目录下的 `memory.md`，找到 `next_session` 字段值（如 `2`）

2. 如果用户提供了参数（session 编号），使用该编号；否则使用 `memory.md` 中的 `next_session`

3. 确认 `session_gate` 状态：
   - `ready` → 继续执行
   - `blocked` → 告知用户当前 Session 被阻塞，等待用户决定
   - `in_progress` → 告知用户上一次执行未完成，询问是否继续
   - `done` → 告知用户所有 Session 已完成

4. 读取对应的 `tasksubsessionN.md`（N 为确认的 session 编号）

5. 按照 `tasksubsessionN.md` 中的指令执行：
   - 先读取文件中"上下文读取"部分列出的所有文件
   - 执行所有子任务
   - 完成测试 Gate 验证

6. 测试通过后，输出结果等待用户验收：
   ```
   Session N 测试通过
   [交付物简述]
   请确认是否验收通过（回复"通过"继续，或说明需要修改的内容）
   ```

7. 用户验收通过后：
   - 写 `artifacts/session-N-summary.md`
   - 更新 `memory.md`
   - 提示下一步：再次运行 `/run-session` 继续下一个 Session
