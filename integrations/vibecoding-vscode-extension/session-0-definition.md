# Session 0 Definition

> 历史说明：本文件记录最初的 Session 0 定义。当前实现进度已推进到 Session 10，最新状态以 `README.md`、`work-plan.md`、`artifacts/session10-closeout-report.md`、`vscode-ext/docs/vibecoding-workflow-vscode-操作手册.md` 为准。

## Scope
- 本 Session 只做业务需求、方案定义、工作拆分
- 不写 VS Code extension 完整实现代码
- 不进入聊天产品自动化
- 不修改现有业务 workflow 文件规范

## Session 0 Output
- [PRD.md](/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/PRD.md)
- [design.md](/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/design.md)
- [work-plan.md](/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/work-plan.md)
- [README.md](/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/README.md)
- [操作手册](/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/vscode-ext/docs/vibecoding-workflow-vscode-操作手册.md)
- 本文档

## Business Summary Prompt
```md
把现有 vibecoding workflow 的外部 session driver 封装为 VS Code 插件，但保持 Python 脚本继续作为核心 orchestration engine。插件只负责命令入口、状态展示、文件打开、调用脚本、展示结果，不替代调度逻辑。必须保证 memory.md 是唯一状态源，startup-prompt.md 是唯一标准入口，插件不能自己决定 next session，也不能绕过 startup-prompt.md 和 memory.md 推进流程。
```

## Plugin Business Goal
- 让用户在 VS Code 内完成 workflow 状态查看、fresh-session 准备和关键文件跳转
- 降低脚本化流程的操作成本
- 降低因跳过标准入口导致的 Session 失控风险

## Plugin Positioning
- 插件是 IDE UI shell
- Python 脚本是 orchestration core
- `memory.md` 是唯一 workflow truth
- `startup-prompt.md` 是 fresh session mandatory entry

## Core Boundary

### Extension
- 触发命令
- 展示状态
- 打开文件
- 调用终端和 Python

### Python
- 读取状态
- 判断是否可推进
- 生成 next session handoff
- 记录日志

## MVP
- workflow 项目探测
- workflow 状态刷新
- 打开 `memory.md`
- 打开 `startup-prompt.md`
- 打开 `next_session_prompt`
- 准备 fresh session
- 在 terminal 启动 runner
- 状态栏显示 `ready` / `blocked` / `done`

## Non-Goals
- 不自动写回 `memory.md`
- 不自动驱动聊天产品
- 不接管完整 session 生命周期
- 不做多项目调度控制台

## Interface Recommendation
- `run-vibecoding-loop.py` 应补一个 JSON 输出模式，供插件消费
- 输出至少包含状态字段、关键路径、下一步建议和错误信息
- 文本输出继续保留给 CLI 人类阅读

## Risks
- 若插件直接解析 markdown，容易与 Python 逻辑漂移
- 若继续只输出自然语言文本，插件集成成本和歧义都会偏高
- 若用户把插件误用为状态真相源，会破坏 workflow 基本假设

## Completion Standard
- 四份文档齐备
- 边界清楚
- MVP 范围清楚
- 后续 Session 可按文档直接推进

## Latest Verification Note
- 2026-03-12 已重新执行插件编译、Session 8 smoke、Session 9 regression、Session 11 real scenario smoke。
- 已补齐独立 Node 集成脚本的 teardown，当前不会再出现 `passed` 后因 polling timer 未释放而挂起的旧问题。
- 当前文档定义已由后续实现与验证结果覆盖，收尾状态见 `artifacts/session10-closeout-report.md`。
