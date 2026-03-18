# LangGraph 测试标准

## 1. 目的

本文档定义 `vibecodingworkflow` 项目中 LangGraph 执行运行时的标准测试方法、通过条件和异常判定规则。

目标：
- 验证 `src/vibecoding_langgraph/graph.py` 的 8 节点执行图可正常工作
- 验证同步调用、异步调用和 HTTP Server 调用三条入口
- 验证单次 run 的单 Session 推进能力，以及 approve / reject 的人工验收分支
- 验证 `memory.md`、`summary`、`manifest`、`loop log` 的联动结果
- 避免测试依赖真实 `claude` 付费账号或外部不稳定条件

当前统一契约：
- `current_phase = design | development | done`
- `last_completed_session_tests = n/a | passed | failed | blocked`
- `session_gate = ready | blocked | in_progress | done`

---

## 2. 适用范围

适用于以下文件和链路：

- `src/vibecoding_langgraph/graph.py`
- `langgraph.json`
- `start-langgraph-dev.sh`
- `scripts/mock_langgraph_runner.py`
- `scripts/test_langgraph_e2e.py`
- `scripts/test_langgraph_http_smoke.py`
- `scripts/reset-langgraph-test-data.sh`
- `src/vibecoding_langgraph/test_support.py`
- `integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project/`

---

## 3. 测试分层

LangGraph 测试分为 6 层：

1. Demo reset / baseline 恢复
2. LangGraph fixture reset / baseline 恢复
3. 图加载测试
4. 进程内调用测试
5. 多 Session E2E 测试
6. Local Server HTTP / HITL Smoke 测试

其中：

- 第 1-6 层为标准必测
- 真实 `claude` / `codex` CLI 调用不作为标准通过门，只作为补充环境验证

原因：

- 真实 CLI 结果受本机登录状态、订阅状态、网络和第三方 API 配额影响
- 标准测试必须可重复、可离线复现、可在 CI 或本地稳定执行

---

## 4. 标准环境

执行目录：

```bash
cd /Users/beckliu/Documents/0agentproject2026/vibecodingworkflow
```

标准 Python：

```bash
./.venv/bin/python --version
```

标准 LangGraph CLI：

```bash
./.venv/bin/langgraph dev --help
```

要求：

- 必须使用项目内 `.venv`
- 不使用系统 `python3` 作为标准执行入口
- 默认 fixture 使用 `session8-smoke-project`

---

## 5. 前置检查

### 5.1 Demo 基线重置

如果本轮测试使用 `demo/stic-fab-chiller-strategy/` 作为完整业务测试项目，必须先执行：

```bash
./scripts/reset-demo-stic-fab-cus.sh
```

脚本职责：

- 清理 demo 历史 `artifacts/session-*`
- 清理 `outputs/session-logs/*`
- 清理 `outputs/session-specs/*`
- 将 `memory.md` 重置为：
  - `last_completed_session: 0`
  - `next_session: 1`
  - `next_session_prompt: session-1-prompt.md`
  - `session_gate: ready`
- 调用 driver 做一次 `inspect` 自检
- 自检结束后再次清理临时生成的 log / spec，保证 demo 仍为干净起点

通过条件：

- 输出包含 `Demo reset complete.`
- 输出包含 `status=ready`
- 输出包含 `next_session=1`

---

### 5.2 LangGraph Fixture 基线重置

如果本轮测试会直接读取或复用 `integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project/`，必须先执行：

```bash
./scripts/reset-langgraph-test-data.sh
```

脚本职责：

- 将 fixture 的 `memory.md` 重置为：
  - `last_completed_session: 4`
  - `next_session: 5`
  - `next_session_prompt: session-5-prompt.md`
  - `session_gate: ready`
- 清理 `artifacts/session-*-summary.md`
- 清理 `artifacts/session-*-manifest.json`
- 清理 `outputs/session-logs/*`
- 清理 `outputs/session-specs/*`
- 删除 `.vibecoding/runner-state.sqlite`
- 清空 `.vibecoding/runner.log`
- 移除 reject 路径可能残留的 `review_notes`

通过条件：

- 输出包含 `LangGraph test data reset complete.`
- 输出包含 `last_completed_session=4`
- 输出包含 `next_session=5`
- 输出包含 `session_gate=ready`

说明：

- `scripts/test_langgraph_e2e.py`、`scripts/test_langgraph_http_smoke.py`、`scripts/test_langgraph_hitl_http.py` 在复制 fixture 到临时目录后，会再次复用同一套 reset helper，保证每个 case 都从统一基线开始。
- `scripts/run_langgraph_test_suite.py` 现在会在 suite 开始前和结束后各执行一次该 reset，避免源码 fixture 被测试污染。

### 5.3 LangGraph 前置检查

执行正式测试前，必须确认：

1. `.venv` 可用
2. `./.venv/bin/langgraph` 可执行
3. `src/vibecoding_langgraph/graph.py` 可被 import
4. `langgraph.json` 的 graph id 为 `vibecoding_workflow`
5. `session8-smoke-project` fixture 存在

建议命令：

```bash
./.venv/bin/python - <<'PY'
from vibecoding_langgraph.graph import graph
print(type(graph))
PY
```

通过条件：

- import 成功
- 无 `ModuleNotFoundError`
- 无 `No synchronous function provided`

---

## 6. 标准测试用例

### 6.1 用例 A：同步入口基础验证

目的：

- 验证 `graph.invoke(...)` 可直接调用
- 验证同步图节点执行正常

推荐命令：

```bash
./.venv/bin/python - <<'PY'
from vibecoding_langgraph.graph import graph
fixture='/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project'
result = graph.invoke({
    'project_root': fixture,
    'runner_command_template': 'printf %s {next_session}\\|{next_prompt} > /tmp/vibe-langgraph-sync.txt'
})
print(result['runner_result']['runner'])
print(result['runner_result']['exit_code'])
print(result['session_gate'])
PY
```

通过条件：

- `runner_result.runner = custom`
- `runner_result.exit_code = 0`
- 图调用不抛异常
- `session_gate = ready`

说明：

- 此用例只验证图可同步执行，不要求推进 workflow

---

### 6.2 用例 B：异步入口基础验证

目的：

- 验证 `graph.ainvoke(...)` 可正常调用
- 验证 async 调用链与 sync 行为一致

推荐命令：

```bash
./.venv/bin/python - <<'PY'
import asyncio
from vibecoding_langgraph.graph import graph
fixture='/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project'
async def main():
    result = await graph.ainvoke({
        'project_root': fixture,
        'runner_command_template': 'printf %s {next_session}\\|{next_prompt} > /tmp/vibe-langgraph-ainvoke.txt'
    })
    print(result['runner_result']['runner'])
    print(result['runner_result']['exit_code'])
    print(result['session_gate'])
asyncio.run(main())
PY
```

通过条件：

- `runner_result.runner = custom`
- `runner_result.exit_code = 0`
- 图调用不抛异常
- `session_gate = ready`

---

### 6.3 用例 C：单次 Run 的多 Session 边界 E2E 测试

目的：

- 验证 LangGraph 在单次 run 中只推进当前 `next_session`
- 验证 Session 5 完成后，状态正确推进到 Session 6 待执行
- 验证 `memory.md`、`summary`、`manifest`、`loop log` 一致

标准命令：

```bash
./.venv/bin/python scripts/test_langgraph_e2e.py
```

脚本行为：

- 复制 `session8-smoke-project` 到临时目录
- 清理旧 `loop log`、`session-5/6 summary`、`session-5/6 manifest`
- 使用 `scripts/mock_langgraph_runner.py` 作为 deterministic runner
- 只执行当前 `next_session = 5`
- 校验 post-run 状态收敛到 Session 6 ready

通过条件：

- 输出包含 `LangGraph E2E passed`
- `current_phase = development`
- `session_gate = ready`
- `last_completed_session = 5`
- `next_session = 6`
- `log_entries = 1`
- `session-5-summary.md`、`session-5-manifest.json` 存在
- `session-6-summary.md`、`session-6-manifest.json` 不存在

失败判定：

- 中途停在 `blocked`
- `memory.md` 未推进到 Session 6 ready
- `loop log` 条目数不为 1
- Session 5 `summary` 或 `manifest` 缺失
- 同一次 run 错误推进到了 Session 6 的正式产物

---

### 6.4 用例 D：LangGraph Local Server HTTP Smoke

目的：

- 验证本地 LangGraph Server 可正确加载 `vibecoding_workflow`
- 验证 HTTP API 可驱动同一套多 Session 流程
- 验证 thread state 与返回结果一致

启动服务：

```bash
./.venv/bin/langgraph dev --host 127.0.0.1 --port 2024 --no-browser
```

或：

```bash
./start-langgraph-dev.sh
```

标准命令：

```bash
./.venv/bin/python scripts/test_langgraph_http_smoke.py
```

如需指定非默认 server 地址，可设置：

```bash
LANGGRAPH_BASE_URL=http://127.0.0.1:2024 ./.venv/bin/python scripts/test_langgraph_http_smoke.py
```

脚本行为：

- 检查 `GET /ok`
- 创建 thread
- 调用 `POST /threads/{thread_id}/runs/wait`
- 读取 `GET /threads/{thread_id}/state`
- 校验结果和 state 同步

通过条件：

- 输出包含 `LangGraph HTTP smoke passed`
- `current_phase = development`
- `session_gate = ready`
- `last_completed_session = 5`
- `next_session = 6`

失败判定：

- Server 未启动
- graph 未被 assistant 正确注册
- `runs/wait` 执行失败
- `state.values` 与 run 返回结果不一致

---

### 6.5 用例 E：LangGraph Local Server HITL Smoke

目的：

- 验证 `review_gate` 的 interrupt / resume 真实 HTTP 路径
- 验证 approve 不会越权多跑后续 Session
- 验证 reject 会恢复 `memory.md` 并写入 `review_notes`

标准命令：

```bash
./.venv/bin/python scripts/test_langgraph_hitl_http.py
```

通过条件：

- 输出包含 `LangGraph HITL HTTP smoke passed`
- approve case:
  - `session_gate = ready`
  - `last_completed_session = 5`
  - `next_session = 6`
- reject case:
  - `session_gate = blocked`
  - `last_completed_session = 4`
  - `next_session = 5`
  - `review_notes = need more tests`

失败判定：

- `review_gate` 没有产出 interrupt
- resume 后 thread state 未清空 interrupt
- approve / reject 任一路径与 `memory.md` 不一致

---

## 7. mock runner 标准

标准 mock runner：

```text
scripts/mock_langgraph_runner.py
```

职责：

- 根据 `next_session` 写入对应 `summary`
- 写入对应 `manifest`
- 更新 `memory.md`
- 在 final session 时推进到：
  - `current_phase: done`
  - `next_session: none`
  - `next_session_prompt: none`
  - `session_gate: done`

使用规则：

- 标准测试必须优先使用 mock runner
- 不允许将真实 `claude` 成功与否作为 LangGraph 主通过门

---

## 8. 真实 CLI 验证规则

真实 `claude` / `codex` CLI 验证仅作补充。

结论规则：

- 若 mock runner 标准测试通过，则 LangGraph 编排层视为通过
- 若真实 CLI 失败，但错误来自订阅、认证、网络、外部 API，则记为“环境问题”，不记为 LangGraph 逻辑失败
- 若真实 CLI 失败，且确认是 `graph.py` 组装 runner command、状态推进或输出收集错误，则记为 LangGraph 逻辑失败

已知示例：

- `claude` 返回 `402 No available asset for API access`
- 该类失败不构成 LangGraph 测试不通过

---

## 9. 回归重点

每次修改以下内容后，必须至少重跑用例 C、D、E：

- `src/vibecoding_langgraph/graph.py`
- `langgraph.json`
- `start-langgraph-dev.sh`
- `scripts/mock_langgraph_runner.py`
- `scripts/test_langgraph_e2e.py`
- `scripts/test_langgraph_http_smoke.py`
- `scripts/test_langgraph_hitl_http.py`
- `src/vibecoding_langgraph/test_support.py`

如果修改了以下逻辑，必须额外检查同步 / 异步入口：

- 节点函数的同步 / 异步实现方式
- `route_next` 路由
- `run_id` 幂等逻辑
- `runner_command_template` 注入逻辑
- `collect_outputs` 的 `summary` / `manifest` 检测逻辑

---

## 10. 标准通过定义

LangGraph 测试标准通过，必须同时满足：

1. 用例 A 通过
2. 用例 B 通过
3. 用例 C 通过
4. 用例 D 通过
5. 用例 E 通过

只有 A/B 通过、C/D/E 未通过，不算完成全流程验证。

---

## 11. 标准执行顺序

推荐固定顺序：

1. 图 import / 基础加载
2. Demo reset
3. LangGraph fixture reset
4. 用例 A：同步入口
5. 用例 B：异步入口
6. 用例 C：E2E
7. 启动 Local Server
8. 用例 D：HTTP smoke
9. 用例 E：HTTP HITL smoke

原因：

- 先排除 import 和节点签名问题
- 再排除进程内调用问题
- 再验证多 Session 状态推进
- 最后验证 HTTP 包装层

---

## 12. 故障定位指南

### 12.1 `No synchronous function provided`

说明：

- 图节点被定义为 async，但调用走了 sync `invoke`

处理：

- 检查 `graph.py` 节点实现是否为同步函数

### 12.2 停在 `session_gate = blocked`

说明：

- runner 执行后 `memory.md` 未正确推进
- 或 `route_next` 使用了旧 state

处理：

- 检查 `run_session_task`
- 检查 `collect_outputs.post_memory`
- 检查 `route_next`
- 检查是否重新经过 `load_workflow_state`

### 12.3 `summary_exists = false`

说明：

- runner 没有写出预期 `session-N-summary.md`

处理：

- 检查 runner 模板占位符
- 检查 artifact 路径
- 检查 fixture 是否残留旧文件或未清理

### 12.4 HTTP `/runs/wait` 失败

说明：

- Local Server 未在线
- assistant 未注册
- graph config 有误

处理：

- 先检查 `GET /ok`
- 再检查 `POST /assistants/search`
- 再检查 `langgraph.json`

---

## 13. 2026-03-16 基线结果

基线验证日期：

- 2026-03-16

基线结果：

- `graph.invoke(...)` 通过
- `graph.ainvoke(...)` 通过
- `scripts/test_langgraph_e2e.py` 通过
- `scripts/test_langgraph_http_smoke.py` 通过
- `scripts/test_langgraph_hitl_http.py` 通过

基线结论：

- LangGraph 运行时编排逻辑通过
- 单次 run 单 Session 推进逻辑通过
- Local Server HTTP 与 HITL 执行链路通过
- 真实 `claude` CLI 不作为标准门，受外部订阅环境约束

---

## 14. 标准执行命令汇总

```bash
cd /Users/beckliu/Documents/0agentproject2026/vibecodingworkflow

./.venv/bin/python scripts/run_langgraph_test_suite.py

./scripts/reset-demo-stic-fab-cus.sh

./scripts/reset-langgraph-test-data.sh

./.venv/bin/python - <<'PY'
from vibecoding_langgraph.graph import graph
print(type(graph))
PY

./.venv/bin/python - <<'PY'
from vibecoding_langgraph.graph import graph
fixture='/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project'
result = graph.invoke({
    'project_root': fixture,
    'runner_command_template': 'printf %s {next_session}\\|{next_prompt} > /tmp/vibe-langgraph-sync.txt'
})
print(result['runner_result']['runner'])
print(result['runner_result']['exit_code'])
print(result['session_gate'])
PY

./.venv/bin/python - <<'PY'
import asyncio
from vibecoding_langgraph.graph import graph
fixture='/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project'
async def main():
    result = await graph.ainvoke({
        'project_root': fixture,
        'runner_command_template': 'printf %s {next_session}\\|{next_prompt} > /tmp/vibe-langgraph-ainvoke.txt'
    })
    print(result['runner_result']['runner'])
    print(result['runner_result']['exit_code'])
    print(result['session_gate'])
asyncio.run(main())
PY

./.venv/bin/python scripts/test_langgraph_e2e.py

./.venv/bin/langgraph dev --host 127.0.0.1 --port 2024 --no-browser

./.venv/bin/python scripts/test_langgraph_http_smoke.py

./.venv/bin/python scripts/test_langgraph_hitl_http.py
```

说明：

- `scripts/run_langgraph_test_suite.py` 会串行执行 demo reset、LangGraph fixture reset、graph import、sync invoke、async invoke、单元测试、E2E smoke、HTTP smoke 和 HTTP HITL smoke，是推荐的一键全流程入口
- suite 结束后会再次执行 `./scripts/reset-langgraph-test-data.sh`，保证 fixture 保持干净基线
- `scripts/test_langgraph_e2e.py` 与 `scripts/test_langgraph_http_smoke.py` 已支持仓库内自举导入，无需先执行 `pip install -e .`
