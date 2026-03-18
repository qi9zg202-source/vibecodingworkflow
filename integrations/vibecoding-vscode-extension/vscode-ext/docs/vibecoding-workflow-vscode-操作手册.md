# VibeCoding Workflow VS Code 插件操作手册

## 1. 适用范围
- 本手册适用于 `skills/vibecoding-vscode-extension/vscode-ext/` 目录下的 VS Code 插件源码。
- 当前阶段为 LangGraph 迁移完成后的开发版，源码已在 2026-03-17 完成 `compile`、本地 smoke 联调、边界回归、真实场景联调、LangGraph HITL、cold resume、offline fallback 与 dashboard smoke，尚未形成正式 VSIX 发布包。

## 2. 核心原则
- 插件不是状态机真相源。
- `memory.md` 是唯一状态源。
- 每次 fresh session 必须重新经过 `startup-prompt.md`。
- 插件不能绕过 `startup-prompt.md` 和 `memory.md` 自己决定 next session。
- 插件进入 project 后，会扫描工程内所有 `startup-prompt.md`，由用户先选中某个 workflow 再执行 flow。
- 推荐架构固定为 `LangGraph Local Server + VS Code UI shell`。
- `Dashboard` 是 workflow 主操作台，负责 refresh、prepare、run、open files 这类业务动作。
- `LangSmith Studio` 是 LangGraph 辅助调试台，负责查看 thread、node、checkpoint、runtime 状态，不是普通使用者的主入口。
- `Session 时间线` 里的“待启动”只表示该 session 尚未被用户显式触发，不表示插件或 LangGraph 会自动执行。

## 3. 当前能力
- 打开独立 Dashboard 页面
- 在 Dashboard 中树状展示工程内所有 workflow
- 底部状态栏常驻 `Vibe Dashboard` 按钮
- 刷新 workflow 状态
- 打开 `memory.md`
- 打开 `startup-prompt.md`
- 打开 next session prompt
- 准备 fresh session
- 通过 LangGraph 触发当前 Session run
- 打开 loop log
- 在 Dashboard 中展示 LangGraph 服务地址、Studio 入口、thread/run 标识
- Session Runtime Inspector / LangGraph Manager 双面板
- 状态栏显示当前 workflow 摘要
- 统一错误态提示与设置入口

## 3.5 Dashboard / Studio 使用边界
| 场景 | 应该使用什么 | 说明 |
|---|---|---|
| 选择 workflow、查看 `next_session`、判断 `ready/blocked/done` | Dashboard | 这里是 workflow 业务操作主界面。 |
| 打开 `memory.md`、`startup-prompt.md`、session prompt、loop log | Dashboard | 文件入口和业务上下文都以 Dashboard 为准。 |
| 启动当前 session、刷新状态 | Dashboard | 当前插件的主操作路径仍在 Dashboard。 |
| 查看 thread history、node traversal、checkpoint、runtime diff | LangSmith Studio | 这是 LangGraph 运行时排障与调试视角。 |
| 判断某个 session 是否已经“官方推进” | Dashboard + `memory.md` | 不能只看 Studio 的 run 状态；业务推进真相仍以 `memory.md` 和 Dashboard 展示为准。 |

## 4. 目录说明
- `src/driver/`
  - LangGraph HTTP driver、daemon 探测与状态映射
- `src/workspace/`
  - workflow 项目探测与文件打开
- `src/ui/`
  - Dashboard、状态栏、Session Runtime Inspector、LangGraph Manager
- `scripts/session8_smoke.js`
  - Session 8 联调脚本
- `scripts/session9_regression.js`
  - Session 9 边界回归脚本
- `scripts/session11_real_scenario.js`
  - 双业务目录真实场景测试脚本
- `scripts/session12_langgraph_hitl.js`
  - LangGraph approve / reject 联调脚本
- `scripts/session13_cold_resume.js`
  - 线程冷恢复回归脚本
- `scripts/session13_offline_fallback.js`
  - LangGraph 离线兼容路径回归脚本
- `scripts/dashboard_state_smoke.js`
  - Dashboard 状态展示 smoke
- `../fixtures/session8-smoke-project/`
  - 真实 workflow smoke 项目
- `../fixtures/mock-html-alpha/`
  - 持久化 mock workflow，适合手工验证 `session-1-prompt.md -> 1.html`
- `../fixtures/mock-html-beta/`
  - 持久化 mock workflow，适合手工验证 `session-2-prompt.md -> 2.html`

## 5. 开发前准备
1. 进入插件目录：
```bash
cd /Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/vscode-ext
```
2. 安装依赖：
```bash
npm install
```
3. 编译：
```bash
npm run compile
```

## 6. VS Code 配置项
- `vibeCoding.langGraphServerUrl`
  - 默认 `http://localhost:2024`
- `vibeCoding.defaultProjectRoot`
  - 默认空；留空时优先使用当前 workspace
- `vibeCoding.runnerCommandTemplate`
  - 用于 `Start Runner In Terminal`

补充说明：

- 历史 `pythonPath` / `driverPath` 设置仍可能存在于旧配置文件中，但不再属于推荐设计基线。
- 当前 `Refresh Workflow Status` 和 `Prepare Fresh Session` 都直接读取 LangGraph thread state。

## 7. 推荐配置示例
```json
{
  "vibeCoding.langGraphServerUrl": "http://localhost:2024",
  "vibeCoding.defaultProjectRoot": "/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project",
  "vibeCoding.runnerCommandTemplate": "python3 -c \"print('{next_session}|{next_prompt}')\""
}
```

## 8. 命令说明
- `VibeCoding: Open Dashboard`
  - 打开独立 Webview 控制台页面，集中展示 workflow 状态、下一步动作、LangGraph runtime 摘要和常用命令按钮
- `VibeCoding: Refresh Workflow Status`
  - 调 LangGraph `GET /threads/{thread_id}/state`
- `VibeCoding: Open Memory`
  - 打开 workflow 根目录下的 `memory.md`
- `VibeCoding: Open Startup Prompt`
  - 打开 workflow 根目录下的 `startup-prompt.md`
- `VibeCoding: Open Next Session Prompt`
  - 通过 LangGraph state 映射拿 `next_session_prompt_path`
- `VibeCoding: Prepare Fresh Session`
  - 刷新当前 workflow，并打开 next session prompt
- `VibeCoding: Start Runner In Terminal`
  - 先探测 LangGraph 状态，必要时尝试 auto-start，再触发当前 Session run
- `VibeCoding: Approve Current Session`
  - 优先走 LangGraph resume；离线时回退为直接更新 `memory.md`
- `VibeCoding: Reject Current Session`
  - 优先走 LangGraph resume；离线时回退为直接更新 `memory.md`
- `VibeCoding: Open Loop Log`
  - 打开 `outputs/session-logs/vibecoding-loop.jsonl`
- `VibeCoding: Configure LangGraph Server URL`
  - 打开 VS Code 设置项

## 9. 推荐操作流程
1. 打开包含多套 workflow 的工程根目录。
2. 先执行 `Open Dashboard`。
3. 在 Dashboard 的 workflow tree 里选择一个 `startup-prompt.md` flow。
4. 再点击 `Refresh Workflow Status`。
5. 先在 Dashboard 确认当前 workflow 的 `ready` / `blocked` / `done`、`next_session` 和 `session_gate`。
6. 如果 `Session 时间线` 显示“待启动”，其含义是“还没手动触发”，不是“系统即将自动跑”。
7. 状态为 `ready` 时，继续点击 `Prepare Fresh Session` 或直接打开当前 session prompt。
8. 在 Dashboard 里按需打开该 workflow 下的 `memory.md`、`startup-prompt.md`、session prompt、loop log。
9. 如需排查 LangGraph 线程或节点执行细节，查看 Dashboard 的 `LangGraph 运行时` 卡片，使用其中的 Studio 链接，并结合 `Thread ID` / `Run ID` 进入 Studio 定位。
10. 最后点击 `Start Runner In Terminal`，由 LangGraph 触发当前 Session。

## 10. 本地 smoke 联调
1. 运行：
```bash
npm run smoke:session8
```
2. 结果报告输出到：
```text
/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/artifacts/session8-smoke-report.json
```
3. 该脚本会验证：
- workflow 识别
- LangGraph 状态刷新
- open files
- start runner in terminal
- loop log

## 10.5 真实场景多 workflow 测试
1. 运行：
```bash
npm run smoke:session11
```
2. 结果报告输出到：
```text
/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/artifacts/session11-real-scenario-report.json
```
3. 该脚本会验证：
- 工程根目录下识别两套业务 workflow
- 点击 startup 后切换当前 workflow
- 右侧 session prompt 路径跟随当前 workflow 变化
- `ready` workflow 可以 prepare 和 start runner
- `blocked` workflow 只能 refresh 和查看 next session，不允许启动 runner
- 脚本运行时会动态创建带 `TEST_FIXTURE.md` 标记的临时业务目录，测试结束自动删除

## 11. 边界回归
1. 运行：
```bash
npm run regression:session9
```
2. 结果报告输出到：
```text
/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/artifacts/session9-regression-report.json
```
3. 当前已覆盖样例：
- `blocked` workflow state
- bad `pythonPath`
- missing `runnerCommandTemplate`
- invalid JSON driver output
- missing workflow file

## 12. 最新验证结果
- 验证日期：2026-03-17
- 已执行：
  - `npm run compile`
  - `npm run smoke:session8`
  - `npm run regression:session9`
  - `npm run smoke:session11`
  - `npm run smoke:session12`
  - `npm run smoke:session13:cold-resume`
  - `npm run smoke:session13:offline`
  - `npm run smoke:dashboard`
- 结果：全部通过
- 补充确认：
  - 三个集成脚本在打印 `passed` 并写出报告后会自行退出
  - 原因是测试宿主现已在 `finally` 中 dispose `context.subscriptions`，不会残留 workflow polling timer
- 对应证据：
  - `../artifacts/session8-smoke-report.json`
  - `../artifacts/session9-regression-report.json`
  - `../artifacts/session11-real-scenario-report.json`
  - `../artifacts/session12-langgraph-hitl-report.json`
  - `../artifacts/session13-cold-resume-report.json`
  - `../artifacts/session13-offline-fallback-report.json`
  - `../artifacts/session-13-summary.md`

## 13. 常见问题
- 为什么 Dashboard 和 Studio 看到的“状态”不一样
  - Dashboard 主要展示 workflow 业务状态，例如 `next_session`、`session_gate`、`ready/blocked/done`
  - Studio 主要展示 LangGraph runtime 状态，例如 run 是否 `running/interrupted/success`
  - 两者不是一回事；是否正式推进到下一轮，仍以 `memory.md` 和 Dashboard 口径为准

- 状态栏显示 `Vibe: invalid`
  - 优先看 output channel
  - 再看 loop log
  - 再检查 `langGraphServerUrl`、`runnerCommandTemplate`、workflow 文件是否齐全

- `Start Runner In Terminal` 不可用
  - 检查 `vibeCoding.runnerCommandTemplate`
  - 检查 workflow 是否 `ready`
  - 检查 LangGraph server 是否在线或能否被自动拉起

- `Open Next Session Prompt` 打不开
  - 插件不会自己解析 `memory.md`
  - 需要先保证 LangGraph state 映射返回有效 `next_session_prompt_path`

- 自定义 Node 集成脚本打印 `passed` 后仍不退出
  - 先检查是否只调用了 `activate()` 但没有 teardown
  - extension 会在激活阶段注册 polling / listener
  - 独立脚本结束前需要执行 `deactivate()` 并 dispose `context.subscriptions`

## 14. 当前限制
- 还未形成正式 VSIX 发布包
- 仍缺少真机 VS Code Extension Host 手工验证记录
- Dashboard 现在会把当前 `thread_id` 带进 Studio deep-link；如果本地 thread 已存在，打开后会直接定位到该 thread，而不是停在 `New Thread`
- 当前离线兼容路径只覆盖 review gate 的 `memory.md` 直写，不替代完整 LangGraph run 语义
