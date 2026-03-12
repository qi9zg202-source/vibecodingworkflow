# vibecoding-vscode-extension

将 `run-vibecoding-loop.py` 封装为 VS Code 插件的统一开发目录。

## 项目摘要
- 目标是把 vibecodingworkflow 的 fresh-session 调度入口从脚本使用方式收拢到 VS Code 内。
- 固定架构是 `Python core + VS Code UI shell`。
- 插件不是状态机真相源，`memory.md` 才是唯一状态源。
- 插件不能绕过 `startup-prompt.md` 和 `memory.md` 自己决定 next session。
- 插件当前按“工程内多 workflow”工作：进入 project 后会扫描所有 `startup-prompt.md`，由用户在 Dashboard 中选择某一套 flow 执行。

当前阶段：
- 已完成 Session 0 文档定义
- 已完成 Session 1 extension skeleton
- 已完成 Session 2 Python driver JSON contract
- 已完成 Session 3 workflow detection + inspect status refresh
- 已完成 Session 4 file opening commands
- 已完成 Session 5 prepare command + terminal runner
- 已完成 Session 6 status bar summary UI
- 已完成 Session 7 error-path and invalid-state UX hardening
- 已完成 Session 8 real workflow smoke integration
- 已完成 Session 9 boundary regression validation
- 已完成 Session 10 文档收尾与发布前检查说明

核心约束：
- 插件不是状态机真相源
- `memory.md` 才是唯一状态源
- 插件不能绕过 `startup-prompt.md` 和 `memory.md` 自己决定 next session
- Python 脚本继续作为核心 orchestration engine

当前文档：
- `PRD.md`
- `design.md`
- `work-plan.md`
- `session-0-definition.md`
- `interfaces/python-driver-contract.md`
- `vscode-ext/docs/vibecoding-workflow-vscode-操作手册.md`

联调资产：
- `fixtures/session8-smoke-project/`
- `fixtures/mock-html-alpha/`
- `fixtures/mock-html-beta/`
- `vscode-ext/scripts/session8_smoke.js`
- `vscode-ext/scripts/session9_regression.js`
- `vscode-ext/scripts/session11_real_scenario.js`
- `artifacts/session8-smoke-report.json`
- `artifacts/session9-regression-report.json`
- `artifacts/session11-real-scenario-report.json`
- `artifacts/session10-closeout-report.md`

最新验证（2026-03-12）：
- `npm run compile`：passed
- `npm run smoke:session8`：passed
- `npm run regression:session9`：passed
- `npm run smoke:session11`：passed
- 最新测试与收尾结果已同步写入 `artifacts/session8-smoke-report.json`、`artifacts/session9-regression-report.json`、`artifacts/session10-closeout-report.md`、`artifacts/session11-real-scenario-report.json`
- 三个 Node 集成脚本均已补齐 teardown，当前会在打印 `passed` 并写出报告后自行退出

当前已实现能力：
- `Open Dashboard`
- `Refresh Workflow Status`
- `Open Memory`
- `Open Startup Prompt`
- `Open Next Session Prompt`
- `Prepare Fresh Session`
- `Start Runner In Terminal`
- `Open Loop Log`
- `Configure Python Driver Path`
- 独立 Webview Dashboard 页面
- 状态栏状态汇总
- 统一错误态 UX
- 多业务 workflow 场景下的 startup 选择与 session 表切换
- `smoke:session11` 会动态创建带 `TEST_FIXTURE.md` 标记的临时业务 workflow 目录，并在测试结束后自动删除

当前未完成范围：
- VSIX 打包与发布流程
- 真机 VS Code Extension Host 手工验证记录

后续建议：
- 补充正式 VSIX 打包、签名与安装验证记录
- 增加 Extension Host 手工验证步骤与截图证据
