# VibeCoding Workflow VS Code 插件操作手册

## 1. 适用范围
- 本手册适用于 `skills/vibecoding-vscode-extension/vscode-ext/` 目录下的 VS Code 插件源码。
- 当前阶段为 Session 10 文档收尾后的开发版，源码已在 2026-03-12 完成 `compile`、本地 smoke 联调、边界回归、真实场景联调与集成脚本收尾修复，尚未形成正式 VSIX 发布包。

## 2. 核心原则
- 插件不是状态机真相源。
- `memory.md` 是唯一状态源。
- 每次 fresh session 必须重新经过 `startup-prompt.md`。
- 插件不能绕过 `startup-prompt.md` 和 `memory.md` 自己决定 next session。
- 插件进入 project 后，会扫描工程内所有 `startup-prompt.md`，由用户先选中某个 workflow 再执行 flow。
- 推荐架构固定为 `Python core + VS Code UI shell`。

## 3. 当前能力
- 打开独立 Dashboard 页面
- 在 Dashboard 中树状展示工程内所有 workflow
- 底部状态栏常驻 `Vibe Dashboard` 按钮
- 刷新 workflow 状态
- 打开 `memory.md`
- 打开 `startup-prompt.md`
- 打开 next session prompt
- 准备 fresh session
- 在 integrated terminal 启动 runner
- 打开 loop log
- 状态栏显示当前 workflow 摘要
- 统一错误态提示与设置入口

## 4. 目录说明
- `src/driver/`
  - Python driver 调用与 JSON contract 消费
- `src/workspace/`
  - workflow 项目探测与文件打开
- `src/ui/`
  - 状态栏 UI
- `scripts/session8_smoke.js`
  - Session 8 联调脚本
- `scripts/session9_regression.js`
  - Session 9 边界回归脚本
- `scripts/session11_real_scenario.js`
  - 双业务目录真实场景测试脚本
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
- `vibeCoding.pythonPath`
  - 默认 `python3`
- `vibeCoding.driverPath`
  - 默认空；运行时会回退到内置 driver 路径
- `vibeCoding.defaultProjectRoot`
  - 默认空；留空时优先使用当前 workspace
- `vibeCoding.runnerCommandTemplate`
  - 用于 `Start Runner In Terminal`

## 7. 推荐配置示例
```json
{
  "vibeCoding.pythonPath": "python3",
  "vibeCoding.driverPath": "/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/scripts/run-vibecoding-loop.py",
  "vibeCoding.defaultProjectRoot": "/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project",
  "vibeCoding.runnerCommandTemplate": "python3 -c \"print('{next_session}|{next_prompt}')\""
}
```

## 8. 命令说明
- `VibeCoding: Open Dashboard`
  - 打开独立 Webview 控制台页面，集中展示 workflow 状态、下一步动作和常用命令按钮
- `VibeCoding: Refresh Workflow Status`
  - 调 Python `inspect --json`
- `VibeCoding: Open Memory`
  - 打开 workflow 根目录下的 `memory.md`
- `VibeCoding: Open Startup Prompt`
  - 打开 workflow 根目录下的 `startup-prompt.md`
- `VibeCoding: Open Next Session Prompt`
  - 只通过 Python inspect 结果拿 `next_session_prompt_path`
- `VibeCoding: Prepare Fresh Session`
  - 调 Python `prepare --json`
- `VibeCoding: Start Runner In Terminal`
  - 先做 `prepare` 校验，再把 `action=run` 命令发到 integrated terminal
- `VibeCoding: Open Loop Log`
  - 打开 `outputs/session-logs/vibecoding-loop.jsonl`
- `VibeCoding: Configure Python Driver Path`
  - 打开 VS Code 设置项

## 9. 推荐操作流程
1. 打开包含多套 workflow 的工程根目录。
2. 先执行 `Open Dashboard`。
3. 在 Dashboard 的 workflow tree 里选择一个 `startup-prompt.md` flow。
4. 再点击 `Refresh Workflow Status`。
5. 确认页面和状态栏显示当前选中 workflow 的 `ready` / `blocked` / `done` 等状态。
6. 状态为 `ready` 时，继续点击 `Prepare Fresh Session`。
7. 在 Dashboard 里按需打开该 workflow 下的 `memory.md`、`startup-prompt.md`、session prompt、loop log。
8. 最后点击 `Start Runner In Terminal`。

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
- `inspect`
- `prepare`
- `open files`
- `start runner in terminal`
- `loop log`

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
- 验证日期：2026-03-12
- 已执行：
  - `npm run compile`
  - `npm run smoke:session8`
  - `npm run regression:session9`
  - `npm run smoke:session11`
- 结果：全部通过
- 补充确认：
  - 三个集成脚本在打印 `passed` 并写出报告后会自行退出
  - 原因是测试宿主现已在 `finally` 中 dispose `context.subscriptions`，不会残留 workflow polling timer
- 对应证据：
  - `../artifacts/session8-smoke-report.json`
  - `../artifacts/session9-regression-report.json`
  - `../artifacts/session11-real-scenario-report.json`
  - `../artifacts/session10-closeout-report.md`

## 13. 常见问题
- 状态栏显示 `Vibe: invalid`
  - 优先看 output channel
  - 再看 loop log
  - 再检查 `driverPath`、`pythonPath`、workflow 文件是否齐全

- `Start Runner In Terminal` 不可用
  - 检查 `vibeCoding.runnerCommandTemplate`
  - 检查 `prepare` 是否返回 `ready`

- `Open Next Session Prompt` 打不开
  - 插件不会自己解析 `memory.md`
  - 需要先保证 Python inspect 返回有效 `next_session_prompt_path`

- 自定义 Node 集成脚本打印 `passed` 后仍不退出
  - 先检查是否只调用了 `activate()` 但没有 teardown
  - extension 会在激活阶段注册 polling / listener
  - 独立脚本结束前需要执行 `deactivate()` 并 dispose `context.subscriptions`

## 14. 当前限制
- 还未形成正式 VSIX 发布包
- 仍缺少真机 VS Code Extension Host 手工验证记录
