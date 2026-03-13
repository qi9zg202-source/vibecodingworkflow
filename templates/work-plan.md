# Work Plan

> 每个 Session = 一个可测试的具体交付物。Session 0 只产文档，不写业务代码。

## Session 0 — 规划与控制文档
- **Deliverable**: `CLAUDE.md`, `task.md`, `PRD.md`, `design.md`, `work-plan.md`, `memory.md`
- **Test Gate**: 关键文档存在且内容完整，`memory.md` 状态有效

## Session 1 — Web 项目骨架与最小入口
- **Deliverable**: 项目目录结构、路由骨架、最小可运行入口
- **Test Gate**: 项目可启动，骨架结构可验证

## Session 2 — 页面地图、数据结构、接口契约
- **Deliverable**: 页面路由定义、核心数据模型、接口类型定义
- **Test Gate**: 类型定义无错误，数据结构与 PRD 对齐

## Session 3 — 配置、上下文、数据加载
- **Deliverable**: 全局配置、状态上下文、数据加载层
- **Test Gate**: 数据加载可调用，上下文可访问

## Session 4 — 核心 UI / API 逻辑 A
- **Deliverable**: 第一个核心功能模块的 UI 和 API
- **Test Gate**: 功能可交互，核心字段完整

## Session 5 — 核心 UI / API 逻辑 B
- **Deliverable**: 第二个核心功能模块的 UI 和 API
- **Test Gate**: 功能可交互，与 Session 4 模块可联动

## Session 6 — 运行态集成与副作用层
- **Deliverable**: 外部接口对接、权限、日志、操作记录
- **Test Gate**: 集成接口可调用，副作用有记录

## Session 7 — 错误处理与降级路径
- **Deliverable**: 异常工况处理、缺数容错、回退路径
- **Test Gate**: 异常场景可复现并有降级处理

## Session 8 — 集成与联调
- **Deliverable**: 端到端功能完整可用
- **Test Gate**: 主流程端到端测试通过

## Session 9 — 真实环境验证与边界样例
- **Deliverable**: 真实业务数据验证，边界样例覆盖
- **Test Gate**: 业务边界样例通过，无遗漏风险

## Session 10 — 文档收尾与流程结束
- **Deliverable**: 最终文档更新，`session_gate: done`
- **Test Gate**: 所有文档完整，`memory.md` 标记为 `done`

---

## 填写指南

在 Session 0 生成此文件时，将上述每个 Session 的 Deliverable 和 Test Gate 替换为本 Task 的具体内容：

**Deliverable 填写规则**：
- 必须是可以独立验证的具体产出（组件名、文件名、API 端点名）
- 不能是过程描述（❌"实现登录功能" → ✅"LoginForm 组件 + /api/auth/login 接口"）

**Test Gate 填写规则**：
- 必须是可执行的具体验证动作
- 不能写模糊的描述（❌"验证可用" → ✅"运行 `npm run dev` 无报错，访问 /login 页面正常渲染"）

**Session 范围规则**：
- 每行对应一个 Session，不允许跨 Session 的 Deliverable
- 单个 Session 的 Deliverable 应在 1 个工作日内完成
- 若 Deliverable 太大，拆分为两个 Session
