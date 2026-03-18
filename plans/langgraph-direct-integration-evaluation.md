# 评估报告：tasksubsession 执行层直接接入 LangGraph 可行性

> 评估日期：2026-03-16
> 评估范围：保持现有 `业务 → PRD.md → design.md → task.md → session-N-prompt.md` 文档链路不变，在 session 执行层不使用本地脚本，直接以 LangGraph 作为执行运行时。

---

## 目录

- [一、评估边界说明](#一评估边界说明)
- [二、当前实际状态（证据）](#二当前实际状态证据)
- [三、核心技术约束分析](#三核心技术约束分析)
- [四、"不使用本地脚本"的实质含义拆解](#四不使用本地脚本的实质含义拆解)
- [五、主要风险与阻断点](#五主要风险与阻断点)
- [六、可行性评分矩阵](#六可行性评分矩阵)
- [七、专业建议](#七专业建议)
- [八、结论](#八结论)
- [补充评估：接受本地 LangGraph 前提下的 Workflow 托管方案](#补充评估2026-03-16接受本地-langgraph-前提下tasksubsession-能否包装为-langgraph-workflow-托管执行)
  - [结论](#结论先说)
  - [session → LangGraph 节点映射关系](#session--langgraph-节点的映射关系)
  - [图结构设计（路径 A）](#图结构设计路径-a)
  - [关键设计约束](#关键设计约束)
  - [从 stub 到可用图的实际距离](#从当前-stub-到可用图的实际距离)
  - [VSCode Extension 侧的变化](#vscode-extension-侧的变化)
  - [补充结论汇总](#补充结论汇总)

---

## 一、评估边界说明

**评估命题**：在保持现有 `业务 → PRD.md → design.md → task.md → session-N-prompt.md` 文档链路不变的前提下，在 **session 执行层**不使用本地脚本（`run-vibecoding-loop.py`），直接以 LangGraph 作为执行运行时。

**当前执行链路（基线）**：

```
VSCode Extension
  → 调 run-vibecoding-loop.py (Python CLI)
    → 读 memory.md
    → 构造 session prompt
    → 调 Codex/Claude Code CLI
    → 写 summary/manifest
    → 更新 memory.md
```

**命题等价于**：用 LangGraph Graph/Server 替换上述 Python CLI 这一层。

---

## 二、当前实际状态（证据）

| 文件/位置 | 现状 |
|---|---|
| `src/vibecoding_langgraph/graph.py` | **仅是 stub**，只有 `load_workflow_snapshot` 一个节点，没有任何 session 执行能力 |
| `pyproject.toml` `dependencies = []` | **LangGraph 未声明为依赖**，包结构是空壳 |
| `langgraph.json` | 已配置 local dev，指向 stub graph |
| `scripts/run-vibecoding-loop.py` | **完整实现**，具备 inspect/prepare/run/auto 四种 action |
| `integrations/vibecoding-vscode-extension` | 对 Python driver 有**硬合约依赖**（python-driver-contract.md），Session 8/9/11 均已通过 smoke |
| `plans/langgraph-integration-plan.md` | 已存在完整集成方案，推荐"保留 driver + 引入 LangGraph 运行时"的双层架构 |

---

## 三、核心技术约束分析

### 3.1 session 执行的不可回避要求

任何 session 执行层，无论是否用 LangGraph，**必须满足以下三个能力**：

| 能力 | 具体要求 |
|---|---|
| **文件系统读写** | 读 `memory.md`/`session-N-prompt.md`，写 `session-N-summary.md`/`session-N-manifest.json`，更新 `memory.md` |
| **子进程执行** | 调 `claude`/`codex` CLI，跑测试命令 |
| **人工审批暂停** | `session_gate: pending_review` 暂停、等待、恢复 |

这三个能力决定了执行层**必须能访问本地运行环境**。

### 3.2 LangGraph 的两种部署模式对比

| 维度 | LangGraph Platform (云) | LangGraph Local Dev Server |
|---|---|---|
| 文件系统访问 | ❌ 无法访问本地磁盘 | ✅ 可访问 |
| 子进程（CLI）调用 | ❌ 不可能在云端调本地 CLI | ✅ 可通过 `subprocess` 调用 |
| Checkpoint/HITL | ✅ 完整支持 | ✅ 完整支持 |
| 网络依赖 | ❌ 每次都需要网络 | ✅ 本地离线可用 |
| 运行时稳定性 | 受平台限制 | 需要自己保持 server 存活 |
| 与 VSCode Extension 集成 | 需要完全重写 driver contract | 需要修改 driver contract |

**结论：LangGraph Platform（远端云）无法替代 session 执行层，因为无法访问本地文件和 CLI。**

---

## 四、"不使用本地脚本"的实质含义拆解

"不使用本地脚本"可以有三种解读，每种的可行性不同：

### 解读 A：完全不运行任何本地进程
- 含义：不运行 Python、不运行 Node、不运行 CLI
- **不可行。** session 执行本质上需要在本地运行 Codex/Claude Code，无法绕过。

### 解读 B：不使用 `run-vibecoding-loop.py` 这个特定脚本，改用 LangGraph Python 图
- 含义：把 `run-vibecoding-loop.py` 的职责迁移到 LangGraph 节点中，但仍在本地运行
- **条件可行。** 需要实现完整的 LangGraph 节点，本质上是"用 LangGraph 重写 driver"。
- 代价：当前 stub 离可用状态差距约 7-8 个核心节点。

### 解读 C：VSCode Extension 不再调 Python CLI，改调 LangGraph Local Server HTTP API
- 含义：Extension 从 `child_process.exec('python run-vibecoding-loop.py ...')` 改为 `fetch('http://localhost:2024/threads/…/runs')`
- **技术上可行，但需要重写 driver contract 层**，且需要 LangGraph server 持续在后台运行。
- 增加了"server 是否在线"的运维负担。

---

## 五、主要风险与阻断点

### 风险 R1 — VSCode Extension 硬合约破坏（高）

VSCode Extension 的 driver 层是基于 `python-driver-contract.md` 构建的，已经过 Session 8/9/11 三轮 smoke 验证。直接替换后端需要：
- 重新定义 JSON 输出 schema（LangGraph API response ≠ 当前 driver response）
- 重新处理 exit code 语义
- 重写 `vscode-ext/src/driver/` 层
- 重新执行完整回归矩阵

### 风险 R2 — LangGraph Server 存活依赖（中）

如果走"本地 LangGraph Server"路线：
- Extension 启动时需要先确认 server 是否在线
- 用户冷启动场景下需要自动启动 server 或给出提示
- 当前 `start-langgraph-dev.command` 是手动脚本，没有 Extension 管理生命周期的机制

### 风险 R3 — 幂等性与双写问题（高）

`memory.md` 和 LangGraph Checkpoint 存在两套状态：
- 如果 LangGraph 节点在写完 `memory.md` 之前 crash，两者会不一致
- 需要严格的事务设计（写文件 → 更新 checkpoint）或最终一致性策略
- 当前 stub 完全未处理此问题

### 风险 R4 — 当前 LangGraph 集成是空壳（阻断）

`src/vibecoding_langgraph/graph.py` 只有一个快照节点，`dependencies = []`，没有任何执行能力。**从 stub 到可用 session 执行器，至少需要实现以下节点：**

1. `load_workflow_state` — 读 memory.md/task.md/design.md
2. `select_session` — 判断 next_session / session_gate
3. `build_runner_input` — 组装 session prompt + startup prompt
4. `review_gate` + `interrupt()` — 审批暂停
5. `run_runner_task` — 调 Codex/Claude Code CLI
6. `collect_outputs` — 检查 summary/manifest/tests
7. `persist_workflow_files` — 幂等写 memory.md/summary/manifest
8. `route_next` — 决定继续/暂停/失败

这是一个完整的 ~2-3 周开发量，不是配置层变更。

### 风险 R5 — 子进程调用的 durable execution 要求（中）

LangGraph 官方 durable execution 要求：调用外部 runner（Codex CLI）必须包装成 task 并保证幂等。否则 checkpoint 恢复时会重复调用 CLI，导致重复执行 session。这是非平凡的工程问题。

---

## 六、可行性评分矩阵

| 场景 | 技术可行性 | 工程成本 | 风险等级 | 综合评分 |
|---|---|---|---|---|
| 完全不用本地进程（解读 A） | ❌ 不可行 | — | 极高 | 不可行 |
| LangGraph Platform 云端执行 | ❌ 不可行（CLI 访问） | — | 极高 | 不可行 |
| 用 LangGraph 重写 driver，仍本地运行（解读 B） | ✅ 技术可行 | 高（~2-3周） | 中 | 条件可行 |
| Extension 改调 LangGraph Local HTTP API（解读 C） | ✅ 技术可行 | 中（重写 driver 层） | 中 | 条件可行，需 server 管理 |
| 保持当前 driver，用 LangGraph 补 HITL/checkpoint | ✅ 技术可行 | 低（渐进集成） | 低 | **推荐** |

---

## 七、专业建议

### 7.1 不推荐"直接替换"的原因

1. 当前 `run-vibecoding-loop.py` 是**唯一经过完整 smoke 验证的执行路径**（Session 8/9/11）。直接替换等于放弃已验证的基础。
2. LangGraph stub 当前是空壳，没有任何 session 执行能力，距离可用状态有实质开发距离。
3. "不使用本地脚本"在技术层面不构成约束——无论是 Python script 还是 LangGraph Server，都需要本地进程。本质区别是 **orchestration 框架**，不是"有没有本地进程"。

### 7.2 推荐的正确集成路径

遵循现有 `plans/langgraph-integration-plan.md` 的分层设计：

**阶段 1（低风险，当前可做）**
- 保持 `run-vibecoding-loop.py` 作为 driver
- 在 LangGraph stub 上实现 `load_workflow_state`
- 验证 LangGraph Studio 能正确读取 memory.md 状态

**阶段 2（中等风险）**
- 在 LangGraph 中实现 `select_session` + `build_runner_input`
- 以 driver 输出为 ground truth 验证 LangGraph 节点结果一致

**阶段 3（主要工程量）**
- 实现 `review_gate` + `interrupt()`
- 实现 `run_runner_task`（幂等 CLI 调用）
- 实现 `persist_workflow_files`（幂等写 memory.md）
- 与 driver 结果并行验证

**阶段 4（切换）**
- VSCode Extension driver 层切换到 LangGraph HTTP API
- `memory.md` 契约与 LangGraph checkpoint 对齐
- 执行完整回归矩阵后，下线 `run-vibecoding-loop.py`

### 7.3 关键原则不变

无论是否引入 LangGraph，以下原则必须保持：
- `memory.md` 仍然是业务真相源
- `startup-prompt.md` 仍然是唯一入口
- session 执行的幂等性必须显式保证
- 文件层必须 Git 可追踪、人类可读

---

## 八、结论

**"在 tasksubsession 执行层不使用本地脚本、直接接入 LangGraph"**

| 维度 | 评估 |
|---|---|
| 技术上是否可行 | **条件可行**（必须是本地 LangGraph Server，不能是云端） |
| 当前状态是否可直接切换 | **不可行**（stub 未实现，无 session 执行能力） |
| 是否有必要"完全替换" | **不必要**，LangGraph 应作为 driver 的运行时增强层，而非全量替代 |
| 推荐路径 | **渐进集成**，保留 driver 作为 fallback，逐步将 orchestration 节点迁移至 LangGraph |
| 最高优先阻断点 | 当前 graph.py 是空壳；CLI 调用的幂等性；Extension driver contract 重写代价 |

> 核心判断：**LangGraph 无法让你消除"本地进程"这件事，它只能让你用更健壮的方式来管理本地进程的状态机。** 真正的价值在于 checkpoint、HITL interrupt、durable execution，而不是"去掉脚本"。

---

## 补充评估（2026-03-16）：接受本地 LangGraph 前提下，tasksubsession 能否包装为 LangGraph Workflow 托管执行

### 结论（先说）

**可行，且���态机映射关系清晰，几乎 1:1。**

| 路径 | 描述 | 可行性 |
|---|---|---|
| **路径 A（推荐）** | LangGraph 负责编排状态机，每个 session 节点 spawn Claude Code/Codex CLI 子进程 | ✅ 完全可行，实现路径清晰 |
| **路径 B** | LangGraph 直接调 Claude API with tool_use，不依赖外部 CLI | ✅ 技术可行，但需要重构 session prompt 为 API 调用格式，复杂度高 |

---

### session → LangGraph 节点的映射关系

当前 `memory.md` 状态机和 `run-vibecoding-loop.py` 的逻辑，可以几乎 1:1 映射到 LangGraph：

| 当前 Python driver 概念 | LangGraph 等价 |
|---|---|
| `parse_memory()` 读 memory.md | `load_workflow_state` 节点 |
| `status.may_advance` 判断 | `select_session` 节点 + 条件边 |
| `session_gate = blocked` | 条件边路由到 `interrupt()` |
| `session_gate = done` | 路由到 `END` |
| `build_runner_command()` | `build_runner_input` 节点 |
| `run_command(command)` | `run_session_task` 节点（subprocess） |
| `parse_memory()` 二次读（runner 后） | `collect_outputs` 节点 |
| `persist_next_session_spec()` | `persist_workflow_files` 节点 |
| 手动 HITL 等待 | `interrupt()` 暂停 |
| 跨天续跑 | 同 `thread_id` resume |

---

### 图结构设计（路径 A）

```
START
  ↓
load_workflow_state      # 读 memory.md / task.md / design.md / work-plan.md
  ↓
select_session           # 判断 session_gate: ready / blocked / in_progress / done
  ↓ (ready)
build_runner_input       # 组装 startup-prompt + session-N-prompt + previous summary
  ↓
review_gate              # 需审批 → interrupt()，等 resume；否则直通
  ↓
run_session_task         # subprocess: claude --project {project_root} / codex ...
  ↓
collect_outputs          # 检查 session-N-summary.md + manifest.json + tests
  ↓
persist_workflow_files   # 幂等写 memory.md，更新 session_gate
  ↓
route_next               # 继续下一 session → 回到 select_session
                         # 需审批 → interrupt()
                         # done → END
                         # 失败 → 保持当前 session，等待人工介入
```

**条件边**：
- `select_session → END`：`session_gate = done`
- `select_session → interrupt()`：`session_gate = blocked`
- `route_next → select_session`：自动推进下一 session
- `route_next → END`：流程全部结束

---

### 关键设计约束

#### "fresh context" 原则不变

LangGraph 负责**编排**，不负责**对话**。每个 session 节点仍然 spawn 新的 Claude Code 进程：

```python
async def run_session_task(state: WorkflowState) -> dict:
    command = build_runner_command(state)
    # 新进程 = fresh context，符合 startup-prompt.md 原则
    result = await asyncio.to_thread(subprocess.run, command, shell=True)
    return {"runner_exit_code": result.returncode}
```

LangGraph 的 thread/checkpoint 管理的是**工作流状态**，不是 LLM 对话历史。两者不冲突。

#### 幂等写 memory.md

`persist_workflow_files` 必须设计为幂等：检查是否已有同 `run_id` 的写入记录，原子写入 `memory.md`，文件已存在则跳过或校验一致性。这是 LangGraph durable execution 的强制要求，避免 checkpoint 恢复时重复写入。

#### thread_id 设计

```
thread_id = sha1(project_root + ":" + task_identifier)
```

一个 task 对应一个 thread，跨天、跨次执行复用同一 `thread_id`，checkpoint 保证可续跑。

#### `memory.md` 仍然是业务真相源

LangGraph checkpoint 只保存**运行时快照**（当前节点、runner 结果）。`memory.md` 继续保存**业务状态**（哪个 session 完成了、tests 结果）。两者不合并、不替代。

---

### 从当前 stub 到可用图的实际距离

当前 `graph.py` 只有 1 个快照节点，`dependencies = []`。现有 `run-vibecoding-loop.py` 的逻辑基本可以直接移植，不需要从零写业务逻辑。

| 节点 | 工作量 | 依赖 |
|---|---|---|
| `load_workflow_state` | 小（复用 `parse_memory()` 逻辑） | 直接移植 driver 代码 |
| `select_session` | 小（复用 `may_advance` 判断逻辑） | 同上 |
| `build_runner_input` | 小（复用 `build_runner_command()` 逻辑） | 同上 |
| `review_gate` + `interrupt()` | 中（设计 HITL payload 结构） | LangGraph interrupt API |
| `run_session_task` | 中（幂等 subprocess + task 包装） | LangGraph task API |
| `collect_outputs` | 小（检查文件存在性 + manifest 校验） | — |
| `persist_workflow_files` | 中（幂等写 memory.md） | 原子写文件设计 |
| `route_next` | 小（条件边逻辑） | — |

---

### VSCode Extension 侧的变化

如果 LangGraph 完全接管执行，Extension 的 driver 调用层需要调整：

**现在**：`child_process.exec('python run-vibecoding-loop.py --action inspect --json')`

**切换后**：
- 读状态：`GET http://localhost:2024/threads/{thread_id}/state`
- 触发执行：`POST http://localhost:2024/threads/{thread_id}/runs`

LangGraph Local Server 提供标准 REST API，Extension 消费该 API 即可。driver contract 字段需要适配层，但结构上一对一可映射。

---

### 补充结论汇总

| 问题 | 答案 |
|---|---|
| tasksubsession 能否包装为 LangGraph workflow？ | **能**，状态机映射关系清晰，几乎 1:1 |
| LangGraph 能否直接管理和执行？ | **能**（本地 LangGraph Server + subprocess runner） |
| session prompt / memory.md 结构需要改变吗？ | **不需要**，文档链路完全保留 |
| 现有 driver 代码能复用吗？ | **能**，`parse_memory()`/`build_runner_command()` 等逻辑直接移植为节点函数 |
| 当前 stub 距可用有多远？ | 需要实现 7-8 个节点，现有 driver 逻辑可大量复用 |
| 核心不变的原则是什么？ | `memory.md` 是业务真相源；每个 session 仍是 fresh context（新子进程）；LangGraph 只管编排，不管对话 |
