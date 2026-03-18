# memory.md

## Session Status
- current_phase: development
- last_completed_session: 4
- last_completed_session_tests: passed
- next_session: 5
- next_session_prompt: `session-5-prompt.md`
- session_gate: ready

## Session Update Rule
- 必须更新：
  - `last_completed_session`
  - `last_completed_session_tests`
  - `next_session`
  - `next_session_prompt`
  - `session_gate`

字段约定：
- `last_completed_session_tests`: `passed` / `failed` / `blocked`
- `session_gate`: `ready` / `blocked` / `in_progress` / `done`

## Current Decisions
- 记录跨 Session 的稳定结论
- 不写未验证结论
- Session 1 使用零依赖静态 Web 骨架，避免在当前仓库阶段引入额外安装成本。
- 本地运行入口固定为 `index.html` + `src/main.js`，通过 `scripts/dev-server.mjs` 提供最小启动路径。
- Session 2 将页面地图、数据结构和接口契约固定在 `src/contracts/`，并通过独立 Node 校验脚本作为后续 Session 的结构基线。
- Session 3 通过 `src/config/app-config.js`、`src/runtime/app-context.js`、`src/runtime/data-loader.js`、`src/runtime/session-runtime.js` 固定本地配置注入、路由上下文构建和嵌入式数据加载链路。
- Session 4 通过 `src/features/` 下的本地 API 适配层、workspace controller 和 view renderer 固定 dashboard / run detail / report filter 的核心 UI / API 逻辑 A。

## Known Risks
- 记录会影响后续判断的风险
- Session 5 需要在复用 `src/features/workspace-controller.js` 状态边界的前提下补核心逻辑 B，避免把设置流和最终集成副作用提前耦合进主入口。

## Session Artifacts
- session_0_outputs:
- session_1_outputs: `package.json`, `index.html`, `src/main.js`, `src/styles.css`, `scripts/dev-server.mjs`, `scripts/smoke-start.mjs`
- session_2_outputs: `src/contracts/page-map.js`, `src/contracts/data-model.js`, `src/contracts/interface-contracts.js`, `outputs/samples/session-2-contract-sample.json`, `scripts/validate-structure.mjs`, `scripts/validate-samples.mjs`
- session_3_outputs: `src/config/app-config.js`, `src/data/session-seed.js`, `src/runtime/app-context.js`, `src/runtime/data-loader.js`, `src/runtime/session-runtime.js`, `scripts/run-minimal-input.mjs`, `outputs/samples/session-3-runtime-sample.json`
- session_4_outputs: `src/features/workspace-api.js`, `src/features/workspace-controller.js`, `src/features/workspace-view.js`, `src/main.js`, `src/styles.css`, `src/data/session-seed.js`, `scripts/validate-session4-unit.mjs`, `scripts/validate-session4-flow.mjs`

## Session Progress Record
- 每次 Session 结束时，至少记录：
  - 本 Session 完成了什么
  - 执行了哪些测试
  - 测试结果是 `passed` / `failed` / `blocked`
  - 下一 Session 依赖哪些文件、字段或产物
- 若本 Session 未完成：
  - 不推进 `next_session`
  - 保持当前 Session 作为下一轮入口
- 若本 Session 已完成：
  - 先更新本文件
  - 再结束当前会话
  - 再启动新的 Session / 新上下文
  - 再从 `startup-prompt.md` 重新进入
- 2026-03-11 Session 1:
  - 完成内容：创建零依赖 Web 项目骨架、静态入口页、最小样式文件、本地 dev server 和自动化 smoke 启动脚本。
  - 执行测试：`npm run check`、`npm run smoke`
  - 测试结果：`passed`
  - 下一 Session 依赖：基于 `src/main.js` 入口继续补页面地图、数据结构、接口契约，并沿用 `package.json` 中的校验与 smoke 脚本。
- 2026-03-11 Session 2:
  - 完成内容：定义四个页面路由的页面地图、六类核心实体与四个视图的数据结构、四个本地接口契约，并补充最小样例 JSON 与静态展示页。
  - 执行测试：`npm run check`、`npm run validate:structure`、`npm run validate:samples`
  - 测试结果：`passed`
  - 下一 Session 依赖：基于 `src/contracts/` 的静态契约实现配置注入、上下文构建和数据加载，并保持 `outputs/samples/session-2-contract-sample.json` 可继续作为对照样例。
- 2026-03-11 Session 3:
  - 完成内容：实现本地应用配置、路由级运行上下文、嵌入式数据加载器与 Session runtime，并让 `src/main.js` 基于 runtime 加载 dashboard 数据和本地偏好设置。
  - 执行测试：`npm run check`、`npm run run:minimal`、`npm run validate:structure`
  - 测试结果：`passed`
  - 下一 Session 依赖：在 `src/runtime/session-runtime.js` 和 `src/main.js` 的现有加载链路上继续补核心 UI / API 逻辑 A，避免引入真实网络路径和质量统计。
- 2026-03-11 Session 4:
  - 完成内容：实现本地 workspace API 适配层、控制 dashboard / run detail / report filter 的状态控制器、对应 UI renderer，并让 `src/main.js` 切换到 Session 4 本地交互入口。
  - 执行测试：`npm run check`、`npm run validate:session4:unit`、`npm run validate:session4:flow`、`npm run validate:structure`、`npm run run:minimal`
  - 测试结果：`passed`
  - 下一 Session 依赖：在 `src/features/workspace-controller.js`、`src/features/workspace-view.js` 和 `src/main.js` 的现有本地交互链路上继续补核心 UI / API 逻辑 B，保持 `src/runtime/session-runtime.js` 无真实网络集成。

## Next Session Entry
- 先读 `Session Status`
- 再读 `design.md`
- 再读 `work-plan.md`
- 然后只做 `next_session` 指定内容
