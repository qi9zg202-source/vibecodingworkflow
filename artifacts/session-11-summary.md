# Session 11 Summary

## Session Goal

将 `src/vibecoding_langgraph/graph.py` 从单节点 stub 改造为完整的 8 节点执行图，能够替代 `run-vibecoding-loop.py` 作为 vibecoding workflow 的执行运行时。

---

## 完成内容

### 1. pyproject.toml 依赖补全

新增依赖：
- `langgraph>=0.2`
- `langgraph-checkpoint-sqlite>=1.0`
- `typing-extensions>=4.8`

`pip install -e .`（Python 3.11）验证通过。

### 2. WorkflowRuntimeState 实现

按 `langgraph-runtime-contract.md` 定义实现了完整的 TypedDict：

```python
class WorkflowRuntimeState(TypedDict, total=False):
    project_root: str
    task_title: Optional[str]
    current_phase: str
    next_session: str
    next_session_prompt: str
    last_completed_session: str
    last_completed_session_tests: str
    session_gate: str
    previous_summary_path: Optional[str]
    expected_summary_path: Optional[str]
    runner_payload: Optional[Dict[str, Any]]
    runner_result: Optional[Dict[str, Any]]
    approval_required: bool
    approval_decision: Optional[str]
    rejection_reason: Optional[str]
    load_error: Optional[str]
    run_id: Optional[str]
```

### 3. 8 个核心节点实现

| 节点 | 状态 | 说明 |
|---|---|---|
| `load_workflow_state` | ✅ 实现 | 读 memory.md，复用 parse_memory 逻辑，构造完整 state |
| `select_session` | ✅ 实现 | 判断 session_gate，路由 ready / blocked / done |
| `build_runner_input` | ✅ 实现 | 组装 startup-prompt + session-N-prompt + previous summary 路径 |
| `review_gate` | ✅ 实现 | approval_required=True 时调用 interrupt()，否则直通 |
| `run_session_task` | ✅ 实现 | asyncio.to_thread + subprocess，带 run_id 幂等检查，自动检测 claude/codex CLI |
| `collect_outputs` | ✅ 实现 | 检查 session-N-summary.md + manifest.json，重读 memory.md |
| `persist_workflow_files` | ✅ 实现 | 幂等写 loop log（JSONL append），复用 log_event 逻辑 |
| `route_next` | ✅ 实现 | 基于 post-run memory 状态决定 继续/END，runner 失败保持当前 session |

### 4. 条件边

- `select_session → END`：`session_gate = done`
- `select_session → review_gate`：`session_gate = blocked / in_progress`（触发 interrupt）
- `select_session → build_runner_input`：`session_gate = ready`
- `review_gate → END`：`approval_decision = reject`
- `review_gate → run_session_task`：批准或无需审批
- `route_next → select_session`：自动推进下一 session（gate=ready）
- `route_next → END`：gate=done 或 runner 失败

### 5. langgraph.json 更新

graph 名称从 `workflow_snapshot` / `agent` 改为 `vibecoding_workflow`。

---

## 验证结果

### Gate 1：pyproject.toml 依赖补全
- `/opt/homebrew/bin/python3.11 -m pip install -e .` ✅ 通过

### Gate 2：完整图 import 无报错
```
graph: <langgraph.graph.state.CompiledStateGraph object at ...>
nodes: ['__start__', 'load_workflow_state', 'select_session', 'build_runner_input',
        'review_gate', 'run_session_task', 'collect_outputs',
        'persist_workflow_files', 'route_next']
```
✅ 通过

### Gate 3：fixture smoke test（session8-smoke-project）
- `load_workflow_state` 正确读取 memory.md，`session_gate=ready` ✅
- `select_session` 判断 `session_gate=ready`，路由到 `build_runner_input` ✅
- `build_runner_input` 正确组装 runner_payload：
  - `startup_prompt_path` ✅
  - `session_prompt_path` → `session-5-prompt.md` ✅
  - `task_path` ✅
  - `next_session=5` ✅
  - `approval_required=False` ✅

---

## 关键设计决策

1. **fresh context 原则保持**：`run_session_task` 每次 spawn 新子进程，LangGraph 只管编排状态。
2. **幂等性**：`run_session_task` 通过 `run_id`（sha1 of project_root+session+timestamp）防止重复执行；`persist_workflow_files` 只做 append log。
3. **memory.md 是业务真相源**：`collect_outputs` 节点在 runner 结束后重读 memory.md，用于 `route_next` 路由决策。
4. **`implementation` phase 兼容**：fixture 中存在非标准 `current_phase=implementation`，已加入 `VALID_PHASES` 兼容集。
5. **CLI 自动检测**：`run_session_task` 检测 `claude` > `codex`，若均不存在则 dry-run 模式记录结果，不阻断编排。

---

## 产出文件

- `src/vibecoding_langgraph/graph.py` — 完整 8 节点图（改造完成）
- `pyproject.toml` — 依赖补全
- `langgraph.json` — graph 名称更新
- `artifacts/session-11-summary.md` — 本文件
- `artifacts/session-11-manifest.json` — 机器可验证清单
