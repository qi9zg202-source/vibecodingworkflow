# 1paperprdasprompt.md 全回归测试执行文档

> 状态：Plan only
> 目标文件：`/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/1paperprdasprompt.md`
> 主测试用例：`/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/tests/test-1paperprdasprompt.md`
> 编排原则：单 session 显式触发、单 session 单边界、通过后才推进、reject 后不前跳

---

## 1. 目的

本文件用于把 `test-1paperprdasprompt.md` 中的回归测试用例，编排成可按 session 执行的测试流程。

目标不是一次性把所有用例堆给同一轮执行，而是：

- 保证每个 session 只覆盖一个明确测试边界
- 保证 session 之间有文件化自动衔接
- 保证未验收通过前不推进到下一 session
- 保证后续执行时可以按本文件直接恢复，不依赖聊天上下文

---

## 2. 适用范围

本计划覆盖以下测试域：

- `TC-E`：入口协议
- `TC-0A`：Session 0a 需求阶段
- `TC-0B`：Session 0b 规划阶段
- `TC-EX`：执行阶段
- `TC-CTX`：上下文缺失处理
- `TC-HTML`：HTML 交付规范
- `TC-BEH`：大模型行为规范
- `TC-MOD`：需求变更与修订

本计划当前只做测试编排与持久化，不在本轮直接执行回归。

---

## 3. 执行总原则

### 3.1 单 session 不越界

每个测试 session 只允许：

- 读取本 session 定义的输入文件
- 执行本 session 分配的测试用例
- 写入本 session 的 summary/result
- 更新测试路由状态文件

每个测试 session 不允许：

- 预先执行下一 session 的用例
- 提前输出最终总报告
- 跳过当前 session 的失败项直接推进

### 3.2 自动衔接必须文件化

测试执行时必须使用以下持久化文件作为衔接层：

- 路由真相源：
  `artifacts/1paperprdasprompt-regression/test-memory.md`
- 人类交接：
  `artifacts/1paperprdasprompt-regression/session-RN-summary.md`
- 机器校验：
  `artifacts/1paperprdasprompt-regression/session-RN-result.json`

其中：

- `test-memory.md` 决定下一轮该执行哪个测试 session
- `session-RN-summary.md` 提供下一轮所需的人类可读上下文
- `session-RN-result.json` 保存本轮覆盖用例、结果、证据路径、阻断项

### 3.3 推进规则

- `approve`：写 summary/result，更新 `test-memory.md`，推进到下一 session
- `reject`：保留当前 `next_session`，写 `review_notes`，禁止推进
- `blocked`：缺少前置输入、证据不足、环境异常，停止并等待处理

### 3.4 测试优先级执行顺序

执行顺序遵循 `P0 -> P1 -> P2`，但按 session 聚合，不按单条 case 跳跃执行。

---

## 4. 测试持久化契约

### 4.1 `test-memory.md`

建议结构：

```md
# 1paperprdasprompt Regression Memory

## Session Status
- current_phase: regression
- last_completed_session: R0
- last_completed_session_tests: passed
- next_session: R1
- next_session_prompt: `tests/test-1paperprdasprompt-execution-plan.md#session-r1`
- session_gate: ready
- review_notes:

## Session Record
- R0: 测试计划已固化 | tests: passed | 2026-03-18
```

### 4.2 `session-RN-summary.md`

每轮至少包含：

- 完成了什么
- 覆盖了哪些 case
- 关键结论
- 阻断与风险
- 下一 session 注意事项

### 4.3 `session-RN-result.json`

建议字段：

```json
{
  "session": "R1",
  "status": "passed",
  "covered_cases": ["TC-E-01", "TC-E-02"],
  "failed_cases": [],
  "blocked_cases": [],
  "evidence": [],
  "next_session": "R2"
}
```

---

## 5. Session 编排总表

| 回归 Session | 范围 | 只测什么 | 不测什么 | 进入条件 | 通过后推进 |
|---|---|---|---|---|---|
| `R0` | 测试基线建立 | 测试范围、夹具策略、产物路径、状态文件规则 | 任何正式 case 判定 | 已有本计划与用例文档 | `R1` |
| `R1` | 入口协议 | `TC-E-*` + `TC-BEH-04` | 0a/0b 文档内容完整性 | `test-memory.md -> next_session=R1` | `R2` |
| `R2` | Session 0a | `TC-0A-*` + `TC-BEH-01` 中 0a 部分 | 0b 与执行阶段 | `R1` 已通过 | `R3` |
| `R3` | Session 0b | `TC-0B-*` + `TC-BEH-01` 中 0b 部分 | 执行阶段与 HTML 交付 | `R2` 已通过 | `R4` |
| `R4` | 执行/上下文/行为 | `TC-EX-*` + `TC-CTX-*` + `TC-BEH-02/03/05/06` | HTML 视觉/数据质量 | `R3` 已通过 | `R5` |
| `R5` | HTML/修订/收口 | `TC-HTML-*` + `TC-MOD-*` + 剩余 P2 case + 全局结论 | 重跑已通过的前序域 | `R4` 已通过 | `R6` |
| `R6` | 总验收与归档 | 汇总覆盖率、失败项、残余风险、回归结论 | 新增 case 扩展 | `R5` 已通过 | `done` |

---

## 6. 各 Session 详细定义

## Session R0

### 目标

建立回归测试执行基线，只固化测试流程，不做正式判定。

### 输入

- `tests/test-1paperprdasprompt.md`
- `tests/test-1paperprdasprompt-execution-plan.md`
- `docs/workflow-standard.md`
- `docs/session-map.md`
- `docs/progress-loop.md`

### 产出

- 测试计划已确认
- 后续执行路径、证据路径、状态文件规则已冻结

### Test Gate

- 已明确 session 切分
- 已明确每轮输入/输出
- 已明确推进/阻断规则

### 完成后操作

- 写 `session-R0-summary.md`
- 初始化 `test-memory.md` 指向 `R1`

## Session R1

### 目标

只验证入口协议与启动分流是否正确。

### 覆盖用例

- `TC-E-01` ~ `TC-E-06`
- `TC-BEH-04`

### 输入

- `1paperprdasprompt.md`
- `tests/test-1paperprdasprompt.md`
- `artifacts/1paperprdasprompt-regression/test-memory.md`
- `artifacts/1paperprdasprompt-regression/session-R0-summary.md`

### 边界

- 允许检查是否进入 `Session 0a` / `0b` / 执行阶段
- 不允许评判 `CLAUDE.md` / `task.md` / `PRD.md` 的内容完整性
- 不允许进入 0a/0b 详细文档结构测试

### 通过条件

- 所有 `TC-E` 结论具备证据
- 未发现入口路由误跳转

## Session R2

### 目标

只验证 `Session 0a` 需求阶段的问卷、追问、文档输出和停止点。

### 覆盖用例

- `TC-0A-01` ~ `TC-0A-09`
- `TC-BEH-01` 中“Session 0a 禁止写业务实现代码”

### 输入

- `1paperprdasprompt.md`
- `tests/test-1paperprdasprompt.md`
- `artifacts/1paperprdasprompt-regression/test-memory.md`
- `artifacts/1paperprdasprompt-regression/session-R1-summary.md`

### 边界

- 允许验证问卷结构、需求确认、三份文档模板要求、停止等待
- 不允许验证 `design.md`、`work-plan.md`、`tasksubsession` 质量

### 通过条件

- `0a` 所有 case 有明确通过/失败判定
- 已确认 `0a` 完成后不会自动越界到 `0b`

## Session R3

### 目标

只验证 `Session 0b` 的规划阶段输出质量与边界。

### 覆盖用例

- `TC-0B-01` ~ `TC-0B-12`
- `TC-BEH-01` 中“Session 0b 禁止写业务实现代码”

### 输入

- `1paperprdasprompt.md`
- `tests/test-1paperprdasprompt.md`
- `artifacts/1paperprdasprompt-regression/test-memory.md`
- `artifacts/1paperprdasprompt-regression/session-R2-summary.md`

### 边界

- 允许验证 `design.md`、`work-plan.md`、`tasksubsessionN.md`、`memory.md`
- 不允许验证 Session 1-N 执行结果本身
- 不允许验证最终 HTML 交付成品质量

### 通过条件

- 已确认 session 拆分、最终 HTML session 约束、`memory.md` 初始化满足规范
- 已确认 `0b` 完成后停止等待，不自动执行 `Session 1`

## Session R4

### 目标

只验证执行阶段、上下文缺失处理和执行期行为规范。

### 覆盖用例

- `TC-EX-01` ~ `TC-EX-10`
- `TC-CTX-01` ~ `TC-CTX-04`
- `TC-BEH-02`
- `TC-BEH-03`
- `TC-BEH-05`
- `TC-BEH-06`

### 输入

- `1paperprdasprompt.md`
- `tests/test-1paperprdasprompt.md`
- `artifacts/1paperprdasprompt-regression/test-memory.md`
- `artifacts/1paperprdasprompt-regression/session-R3-summary.md`

### 边界

- 允许验证“只执行当前 tasksubsession”“summary/memory 更新时间点”“缺上下文时停止”
- 不允许进入 HTML 视觉规范和模拟数据质量判断

### 通过条件

- 已确认执行阶段不会跨 session 提前开发
- 已确认未通过 gate 时不会写 summary/memory
- 已确认通过后等待验收，验收通过后才推进

## Session R5

### 目标

只验证最终 HTML 交付规范、修订规则和剩余 P2 行为。

### 覆盖用例

- `TC-HTML-01` ~ `TC-HTML-08`
- `TC-MOD-01` ~ `TC-MOD-03`
- 如前序未覆盖的剩余 `P2` case

### 输入

- `1paperprdasprompt.md`
- `tests/test-1paperprdasprompt.md`
- `artifacts/1paperprdasprompt-regression/test-memory.md`
- `artifacts/1paperprdasprompt-regression/session-R4-summary.md`

### 边界

- 允许验证 HTML 单文件交付约束、视觉/数据规范、修订策略
- 不回头重跑前序已通过 case，除非前序结论被本轮证据推翻

### 通过条件

- HTML 交付规范覆盖完成
- 修订与变更规则覆盖完成
- 所有 P0/P1/P2 case 已被映射到结果文件

## Session R6

### 目标

形成最终回归结论并归档。

### 输入

- `artifacts/1paperprdasprompt-regression/test-memory.md`
- `artifacts/1paperprdasprompt-regression/session-R1-summary.md`
- `artifacts/1paperprdasprompt-regression/session-R2-summary.md`
- `artifacts/1paperprdasprompt-regression/session-R3-summary.md`
- `artifacts/1paperprdasprompt-regression/session-R4-summary.md`
- `artifacts/1paperprdasprompt-regression/session-R5-summary.md`
- `artifacts/1paperprdasprompt-regression/session-R1-result.json`
- `artifacts/1paperprdasprompt-regression/session-R2-result.json`
- `artifacts/1paperprdasprompt-regression/session-R3-result.json`
- `artifacts/1paperprdasprompt-regression/session-R4-result.json`
- `artifacts/1paperprdasprompt-regression/session-R5-result.json`

### 产出

- 最终回归总报告
- 用例覆盖率
- 失败项清单
- 阻断项清单
- 是否达到“可交付标准”的测试结论

### 通过条件

- 前序结果可追溯
- 每条 case 都有归属和结论
- 总结论与分 session 结果一致

---

## 7. Session 自动衔接规则

### 7.1 启动规则

每次只允许由 `test-memory.md` 的 `next_session` 启动一轮测试 session。

禁止：

- 直接跳到后续 session
- 并行执行两个测试 session
- 基于聊天记忆猜测上一轮结果

### 7.2 输入规则

执行 `RN` 前必须读取：

- 本计划文件
- `test-memory.md`
- `session-R(N-1)-summary.md`，若 `N > 0`
- 本轮覆盖所需的源文档

若 `N > 0` 且前序 summary 缺失：

- 立即停止
- 检查 `test-memory.md`
- 判定是 summary 丢失还是前序未完成
- 不允许自行脑补继续

### 7.3 状态推进规则

当 `RN` 通过时：

- 写 `session-RN-summary.md`
- 写 `session-RN-result.json`
- 更新 `test-memory.md`：
  - `last_completed_session = RN`
  - `last_completed_session_tests = passed`
  - `next_session = R(N+1)` 或 `done`
  - `session_gate = ready` 或 `done`

当 `RN` reject / blocked 时：

- `next_session` 保持为 `RN`
- `session_gate = blocked`
- 写入 `review_notes`
- 禁止推进

---

## 8. 用例映射规则

### 8.1 不允许跨 session 漂移

若某条 case 同时涉及多个阶段，按“主责任阶段”归属：

- 入口分流归 `R1`
- 需求阶段归 `R2`
- 规划阶段归 `R3`
- 执行与上下文归 `R4`
- HTML 成品与修订归 `R5`

### 8.2 不允许遗漏

执行前，必须为 `tests/test-1paperprdasprompt.md` 中每条 case 指定唯一归属 session。

执行后，必须在 `session-RN-result.json` 中记录：

- `covered_cases`
- `passed_cases`
- `failed_cases`
- `blocked_cases`

---

## 9. 本计划对应的后续执行入口

后续开始正式回归时，按以下顺序启动：

1. 初始化 `artifacts/1paperprdasprompt-regression/`
2. 创建 `test-memory.md`，状态指向 `R1`
3. 执行 `R1`
4. 每轮验收通过后，再推进到下一轮
5. 最后由 `R6` 统一收口

---

## 10. 当前结论

本次已完成：

- 测试用例读取与范围确认
- workflow session 边界规则对齐
- `1paperprdasprompt.md` 全回归测试的 session 编排固化

本次未执行：

- 任何正式回归 case
- 任何通过/失败判定
- 任何测试状态文件初始化

下一步应做：

- 按本计划从 `R1` 开始执行正式回归
