# work-plan

## Session 0
- 落 `PRD.md`
- 落 `design.md`
- 落 `work-plan.md`
- 落 Session 0 方案稿
- 明确 Python core + VS Code UI shell 架构
- 明确 `memory.md` 是唯一状态源
- 状态：completed

## Session 1
- 创建 VS Code extension skeleton
- 定义 `package.json` 基础命令与配置项
- 不接入复杂 UI
- 状态：completed

## Session 2
- 为 `run-vibecoding-loop.py` 增加稳定 JSON 输出模式
- 定义 driver result schema
- 定义错误码与异常输出策略
- 状态：completed

## Session 3
- 实现 workflow project detection
- 实现 `Refresh Workflow Status`
- 打通插件到 Python inspect mode 的调用链
- 状态：completed

## Session 4
- 实现 `Open Memory`
- 实现 `Open Startup Prompt`
- 实现 `Open Next Session Prompt`
- 规范文件缺失时的提示
- 状态：completed

## Session 5
- 实现 `Prepare Fresh Session`
- 实现 `Start Runner In Terminal`
- 支持 runner command template 配置
- 状态：completed

## Session 6
- 实现状态栏展示
- 实现 output channel 结果回显
- 补充 `ready` / `blocked` / `done` 视觉状态
- 状态：completed

## Session 7
- 补齐异常路径
- 处理 Python 不存在、脚本失败、JSON 不合法、workflow 文件缺失
- 确保插件不会在异常状态下误导推进
- 状态：completed

## Session 8
- 使用真实 vibecoding workflow 项目做联调
- 验证 fresh-session handoff 路径
- 验证 loop log 可追踪
- 状态：completed
- 证据：
- `fixtures/session8-smoke-project/`
- `artifacts/session8-smoke-report.json`

## Session 9
- 真实环境验证
- 覆盖不同 Python 路径、不同 runner 模板、不同 workflow 状态
- 补回归检查清单
- 状态：completed
- 证据：
- `vscode-ext/scripts/session9_regression.js`
- `artifacts/session9-regression-report.json`

## Session 10
- 完成 README 与使用说明
- 补发布前检查
- 收尾文档与后续演进建议
- 状态：completed
- 证据：
- `README.md`
- `vscode-ext/docs/vibecoding-workflow-vscode-操作手册.md`
- `vscode-ext/package.json`
- `npm run compile`
- `npm run smoke:session8`
- `npm run regression:session9`
- `artifacts/session10-closeout-report.md`

## Cross-Session Constraints
- 任何 Session 都不能把插件改造成新的状态机真相源
- 任何 Session 都不能允许绕过 `startup-prompt.md`
- 任何 Session 都不能把 next session 决策从 `memory.md` 挪到插件状态
- Python driver contract 在 Session 2 后应冻结到可消费版本

## Current Summary
- 当前已完成 MVP 主链路、smoke 联调与边界回归。
- 当前已完成 Session 10 文档收尾。
- 2026-03-12 已重新执行 `compile`、`smoke:session8`、`regression:session9`、`smoke:session11`，结果均为 passed。
- 已补齐 3 个集成脚本的测试宿主 teardown；当前不会再出现“报告已写出但 Node 进程未退出”的残留问题。
- 当前未完成 VSIX 打包发布与真机 Extension Host 手工验证记录。
