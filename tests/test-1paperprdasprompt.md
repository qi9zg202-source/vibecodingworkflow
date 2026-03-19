# 1paperprdasprompt.md 测试用例文档

> 版本：v1.1 | 对应规范：1paperprdasprompt.md v2.2
> 覆盖范围：入口协议、Session 0a、Session 0b、执行阶段、大模型行为规范
>
> **R1 测试结论（2026-03-18）：阻断，不可推进**
> - TC-E-01 ~ TC-E-05、TC-BEH-04：✅ 通过
> - TC-E-06：❌ FAIL — 规范缺口，入口协议未处理"项目已全部完成"终态分支
> - 当前 gate：`next_session: R1 / session_gate: blocked`
> - 解封条件：1paperprdasprompt.md 入口协议补充终态分支 → 重跑 TC-E-06b

---

## 路径约定

- `project_root` 固定包含 `CLAUDE.md`、`customer_context/`
- `task_root = project_root/tasks/<task-slug>/`
- 除 `CLAUDE.md` 外，`task.md`、`PRD.md`、`design.md`、`work-plan.md`、`memory.md`、`tasksubsessionN.md`、`artifacts/`、`outputs/` 均位于 `task_root`
- 下文若未显式写全路径，默认按以上目录 contract 解释

---

## TC-E：入口协议（SECTION 0）

### TC-E-01：全新项目，无任何文件
- 前置条件：`project_root` 为空，无 `project_root/CLAUDE.md`，也无任何 `task_root` 文档
- 输入：大模型读取 1paperprdasprompt.md
- 期望行为：触发 Session 0a，向用户发出 Q&A 问卷（项目基本信息 + 业务背景 + 领域约束）
- 不期望行为：直接生成代码；直接进入 Session 0b；询问用户"要做什么"而不给出结构化问卷

### TC-E-02：CLAUDE.md 存在，task.md / PRD.md 缺失
- 前置条件：仅 `project_root/CLAUDE.md` 存在，无 `task_root/memory.md`
- 期望行为：触发 Session 0a，在 `task_root` 补全缺失的 `task.md` 和 `PRD.md`
- 不期望行为：跳过 Q&A 直接进入 Session 0b

### TC-E-03：CLAUDE.md + task.md + PRD.md 均存在，work-plan.md 缺失，memory.md 缺失
- 前置条件：`project_root/CLAUDE.md`、`task_root/task.md`、`task_root/PRD.md` 齐全，无 `task_root/work-plan.md`，无 `task_root/memory.md`
- 期望行为：触发 Session 0b，读取三份文档后在 `task_root` 产出 `design.md`、`work-plan.md`、`tasksubsession1~N.md`、`memory.md`
- 不期望行为：重新询问需求；重新生成 `project_root/CLAUDE.md` / `task_root/task.md` / `task_root/PRD.md`

### TC-E-04：全部规划文档存在，memory.md 缺失（0b 中断恢复场景）
- 前置条件：`project_root/CLAUDE.md`、`task_root/task.md`、`task_root/PRD.md`、`task_root/work-plan.md` 均存在，`task_root/memory.md` 不存在
- 期望行为：告知用户"检测到规划文档已完成，但进度日志缺失"，创建 `task_root/memory.md` 并初始化为 Session 0 完成状态，停止等待确认
- 不期望行为：重新执行 Session 0b；覆盖已有 `task_root/work-plan.md`

### TC-E-05：memory.md 存在，Session 3 已完成
- 前置条件：`task_root/memory.md` 存在，记录 Session 0–3 已完成
- 期望行为：读取 `task_root/memory.md`，推断下一步为 `task_root/tasksubsession4.md`，主动告知用户当前进度和建议，等待用户确认
- 不期望行为：自动执行 tasksubsession4.md；不告知进度直接等待

### TC-E-06：memory.md 存在，所有 Session 均已完成 ❌ FAIL
- 前置条件：`task_root/memory.md` 记录全部 Session 完成，项目状态为"全部完成"
- 期望行为：告知用户项目已全部完成，询问是否需要迭代或新功能
- 不期望行为：建议执行不存在的 tasksubsessionN+1.md
- **实际结果：FAIL — 规范缺口**
  - 根因：入口协议（line 35–41）只定义了"读取 memory.md → 推断 tasksubsessionN+1.md"的通用路径，未处理"项目已全部完成"的终态分支
  - "项目状态: 全部完成"仅在 line 507 写回 memory.md，入口协议不读取该字段
  - 结论：规范需补丁，测试用例本身有效，保留
  - 当前 gate 状态：`next_session: R1 / session_gate: blocked`

### TC-E-06b：规范补丁验证（待规范修复后执行）
- 前置条件：1paperprdasprompt.md 入口协议已补充终态分支处理逻辑
- 期望行为：大模型读取 `task_root/memory.md` 后识别"项目状态: 全部完成"，输出项目完成提示，不建议执行下一个 tasksubsession
- 不期望行为：建议执行不存在的 tasksubsessionN+1.md
- 状态：⏸ 待规范修复后解封

---

## TC-0A：Session 0a — 需求阶段

### TC-0A-01：Q&A 问卷完整性
- 触发：Session 0a Step 1
- 期望行为：一次性列出"项目基本信息 + 业务背景 + 领域约束"三个区块，不分多轮提问
- 验证点：问卷包含项目名称、系统类型、主要服务对象、业务背景（1-3句）、核心业务场景、业务规则约束、技术/合规限制

### TC-0A-02：用户回复后摘要确认
- 触发：用户填写 Step 1 问卷后
- 期望行为：大模型复述摘要，确认准确，告知"项目背景已确认，接下来收集功能需求"
- 不期望行为：直接跳到 Step 2 问卷而不复述确认

### TC-0A-03：功能需求 Q&A 完整性
- 触发：Session 0a Step 2
- 期望行为：列出"功能基本信息 + 功能范围 + 验收标准"三个区块
- 验证点：包含功能名称、功能目标（一句话）、明确要做什么、明确不做什么、可验证的验收条件

### TC-0A-04：功能需求模糊时主动追问
- 触发：用户功能描述含糊（如"做一个报表"）
- 期望行为：大模型识别模糊点，主动追问具体细节，不直接生成文档
- 不期望行为：基于模糊描述直接生成 PRD.md

### TC-0A-05：CLAUDE.md 内容完整性
- 触发：Session 0a Step 3.1
- 期望行为：生成的 CLAUDE.md 包含 Project Background、Product Intent、Domain Guardrails、Tech Stack 四个区块
- 验证点：Tech Stack 固定包含 `task.html` 单文件交付、SAP Fiori 风格、横向禁止滚动条、元素 ID 命名规范、禁止外部运行时依赖

### TC-0A-06：task.md 内容完整性
- 触发：Session 0a Step 3.2
- 期望行为：生成的 task.md 包含 Title、Goal、In Scope、Out Of Scope、Constraints、Required Customer Context、Acceptance Criteria 七个区块
- 不期望行为：缺少任何区块；内容为占位符未填写

### TC-0A-06b：task.md 维护当前 Task 必读客户资料文件
- 触发：Session 0a Step 3.2，且用户在问卷中提供了客户资料文件
- 期望行为：`task.md` 的 `Required Customer Context` 区块只列出当前 Task 执行前必须读取的客户资料文件，包含文件路径、用途或必读原因
- 不期望行为：把 `customer_context/` 下所有文件不加筛选全部抄入；只写文件名不写用途

### TC-0A-07：PRD.md 内容完整性
- 触发：Session 0a Step 3.3
- 期望行为：生成的 PRD.md 包含 Problem、Goal、User Stories（表格）、Feature Specifications（含优先级）、Non-functional Requirements、成功指标、Acceptance Criteria
- 验证点：User Stories 使用表格格式；Feature Specifications 每个模块含优先级（P0/P1/P2）、功能描述、输入、输出、交互逻辑

### TC-0A-08：Session 0a 完成后停止等待
- 触发：三份文档生成完毕
- 期望行为：输出完成报告（列出 `project_root/CLAUDE.md`、`task_root/task.md`、`task_root/PRD.md`），明确告知用户"确认无误后回复：需求已确认，请继续规划"，然后停止
- 不期望行为：自动继续执行 Session 0b；不等待用户确认

### TC-0A-09：用户未确认需求文档时禁止进入 Session 0b
- 触发：Session 0a 完成后，用户未回复确认，直接发送其他指令
- 期望行为：提醒用户需先确认需求文档，不执行 Session 0b
- 不期望行为：忽略确认步骤直接进入规划阶段

---

## TC-0B：Session 0b — 规划阶段

### TC-0B-01：触发条件验证
- 前置条件：`project_root/CLAUDE.md`、`task_root/task.md`、`task_root/PRD.md` 均存在，`task_root/work-plan.md` 不存在
- 期望行为：大模型先读取三份文档，再产出规划文档
- 不期望行为：未读取文档直接生成；重新询问需求

### TC-0B-02：design.md 已存在时不重新生成
- 前置条件：`task_root/design.md` 已存在（0b 中途中断场景），`task_root/work-plan.md` 不存在
- 期望行为：读取已有 `task_root/design.md`，从 `task_root/work-plan.md` 开始继续产出，不覆盖 `task_root/design.md`
- 不期望行为：重新生成 `task_root/design.md` 覆盖已有内容

### TC-0B-03：design.md 内容完整性
- 期望行为：包含 Architecture（分层结构、模块边界、数据流）和 Key Technical Decisions 两个主区块
- 验证点：分层结构包含 UI Layer、Data Layer、Runtime Layer、Integration Layer

### TC-0B-04：work-plan.md Session 数量合理性
- 场景 A：PRD 有 1–2 个功能模块 → 期望 2–3 个 Session
- 场景 B：PRD 有 3–4 个功能模块 → 期望 3–5 个 Session
- 场景 C：PRD 有 5+ 个功能模块 → 期望 5–8 个 Session
- 验证点：最后一个 Session 固定为 HTML 交付

### TC-0B-05：work-plan.md 最终 Session 格式
- 期望行为：最后一个 Session 的 Deliverable 明确为 `task.html`，Test Gate 包含"浏览器直接打开无需服务器"、"目录中不存在额外运行时前端资源文件"、"模拟数据符合业务背景"等条件
- 不期望行为：最后一个 Session 仍承担新功能开发

### TC-0B-06：tasksubsession 文件具体文件名（无占位符）
- 期望行为：每个 tasksubsessionN.md 的"工作对象 → 目标文件"固定填写 `task.html`
- 不期望行为：目标文件名为 `[功能名].html`、`index.html` 或其他自定义名称

### TC-0B-07：Session 1 的 tasksubsession 格式
- 期望行为：操作方式为"从零新建"，执行前检查为"无需检查"，上下文读取不包含前序 summary
- 不期望行为：Session 1 要求读取不存在的 session-0-summary.md

### TC-0B-08：Session N>1 的 tasksubsession 格式
- 期望行为：操作方式为"读取已有文件，在此基础上继续开发"，执行前检查为"先读取 [文件名] 当前内容，再执行子任务"，上下文读取包含 `artifacts/session-[N-1]-summary.md`
- 不期望行为：Session 2+ 的操作方式仍为"从零新建"

### TC-0B-09：最终 Session tasksubsession 包含 HTML 交付规范
- 期望行为：最终 Session 文件包含"HTML 交付规范"区块，明确 `task.html` 单文件、SAP Fiori 风格、横向禁止滚动条、元素 ID 命名、CSS / JS / 模拟数据全内联、禁止外部依赖等约束
- 不期望行为：最终 Session 缺少 HTML 规范约束

### TC-0B-10：最终 Session tasksubsession 包含模拟数据要求
- 期望行为：包含"模拟数据要求"区块，明确数据来源于 CLAUDE.md、覆盖 PRD.md 核心场景、列表类不少于 5 条、跨模块数据一致性
- 不期望行为：模拟数据要求缺失或仅有一句话描述

### TC-0B-11：memory.md 初始内容
- 期望行为：`task_root/memory.md` 包含"当前进度"（已完成 Session 0）、"Session 完成记录"（Session 0 条目）、"跨 Session 稳定决策"、"已知风险"四个区块
- 不期望行为：`task_root/memory.md` 为空；缺少初始 Session 0 记录

### TC-0B-12：Session 0b 完成后停止等待
- 期望行为：输出完成报告（列出所有生成文件），告知用户"确认无误后，开启新会话，发送：请读取 tasksubsession1.md 并按其中步骤执行"，然后停止
- 不期望行为：自动开始执行 Session 1

---

## TC-EX：执行阶段（Session 1–N）

### TC-EX-01：执行前必读上下文文件
- 触发：用户发送"请读取 tasksubsession1.md 并执行"
- 期望行为：大模型先读取 tasksubsession 中列出的所有上下文文件（至少包括 `project_root/CLAUDE.md`、`task_root/task.md`、`task_root/design.md` 等），再执行子任务
- 不期望行为：未读取上下文直接执行

### TC-EX-02：严格只执行本 Session 子任务
- 触发：执行 tasksubsession2.md
- 期望行为：只完成 Session 2 指定的子任务，不提前实现 Session 3 的内容
- 不期望行为：顺带实现后续 Session 的功能

### TC-EX-03：测试 Gate 未通过时禁止写 summary
- 触发：子任务执行完毕，但测试 Gate 有条件未满足
- 期望行为：告知失败原因和建议，不写 `task_root/artifacts/session-N-summary.md`，不更新 `task_root/memory.md`，等待用户决定
- 不期望行为：测试未通过仍写 summary；将 Session 标记为完成

### TC-EX-04：测试通过后等待用户验收
- 触发：测试 Gate 全部通过
- 期望行为：输出"Session N 测试通过 / Tests: passed / [交付物简述] / 请确认结果是否符合预期"，等待用户回复
- 不期望行为：测试通过后自动写 summary 和更新 memory.md

### TC-EX-05：用户验收通过后写 summary 和更新 memory.md
- 触发：用户回复"通过"/"继续"/"OK"
- 期望行为：写 `task_root/artifacts/session-N-summary.md`（含完成了什么、关键决策、下一 Session 注意事项），追加更新 `task_root/memory.md`，输出完成确认和下一步提示
- 不期望行为：summary 内容为空；`task_root/memory.md` 未追加新记录

### TC-EX-06：用户要求修改时在同一窗口继续
- 触发：用户回复"再改一下 X"
- 期望行为：在同一窗口继续修改，修改完成后重新执行测试 Gate，再次等待用户验收
- 不期望行为：要求用户开新窗口；直接标记完成

### TC-EX-07：用户拒绝时的处理
- 触发：用户回复"重来"/"这个方向不对"
- 期望行为：建议用户修改 tasksubsessionN.md 后开新窗口重新执行，不在当前窗口强行修改
- 不期望行为：在当前窗口无限重试

### TC-EX-08：session-N-summary.md 内容完整性
- 期望行为：包含"完成了什么"（一句话）、"关键决策"（含理由）、"下一 Session 注意事项"三个区块
- 不期望行为：summary 仅有一行描述；缺少下一 Session 注意事项

### TC-EX-09：memory.md 追加格式
- 期望行为：追加格式为 `- Session [N]: [交付物一句话描述] | tests: passed | [日期]`
- 不期望行为：覆盖已有记录；格式不一致

### TC-EX-10：最终 Session 完成后的输出
- 触发：最终 HTML Session 用户验收通过
- 期望行为：`task_root/memory.md` 追加"项目状态: 全部完成"，输出"✅ 核心交付物已完成：`task_root/PRD.md` + `task_root/task.html`"
- 不期望行为：缺少项目完成状态标记

---

## TC-CTX：上下文缺失处理

### TC-CTX-01：Session 1 无前序 summary（正常情况）
- 前置条件：执行 tasksubsession1.md，artifacts/ 目录为空
- 期望行为：正常执行，不报错，不检查前序 summary
- 不期望行为：报告"session-0-summary.md 不存在"并停止

### TC-CTX-02：Session N>1，前序 summary 不存在
- 前置条件：执行 `task_root/tasksubsession3.md`，但 `task_root/artifacts/session-2-summary.md` 不存在
- 期望行为：立即停止，读取 `task_root/memory.md`，根据 `task_root/memory.md` 状态给出明确提示（summary 丢失 or Session 未完成），等待用户决定
- 不期望行为：跳过检查直接执行；假设上下文并继续

### TC-CTX-03：memory.md 记录 Session 2 完成但 summary 文件丢失
- 期望行为：提示"Session 2 已记录完成，但 summary 文件丢失。建议：重新执行 tasksubsession2.md 补写 summary，再执行本 Session"
- 不期望行为：自行重建 summary 内容并继续

### TC-CTX-04：memory.md 无 Session 2 记录（Session 2 未执行）
- 期望行为：提示"Session 2 未完成或未执行。建议：先执行 tasksubsession2.md，完成后再执行本 Session"
- 不期望行为：跳过 Session 2 直接执行 Session 3

---

## TC-HTML：HTML 交付规范

### TC-HTML-01：单文件可独立运行
- 期望行为：生成的 `task.html` 中 CSS、JS 和模拟数据全部内联，无外部依赖文件，浏览器直接打开即可运行
- 验证方法：断网环境下打开 HTML 文件，所有功能正常

### TC-HTML-02：横向无滚动条
- 期望行为：在标准视口宽度（1280px、1440px）下，页面不出现横向滚动条
- 不期望行为：任何模块宽度超出视口导致横向滚动

### TC-HTML-03：元素 ID 唯一性和命名规范
- 期望行为：页面内每个 HTML 元素有唯一 id，命名格式为 `[模块]-[功能]-[类型]`（如 `dashboard-eer-chart`）
- 验证方法：检查页面内无重复 id；id 格式符合规范

### TC-HTML-04：SAP Fiori 色系
- 期望行为：主色使用 #0070F2，深色使用 #354A5E，背景使用 #F5F6F7
- 不期望行为：使用 Material Design 或 Bootstrap 默认色系

### TC-HTML-05：模拟数据数量充足
- 期望行为：列表类数据不少于 5 条
- 不期望行为：列表仅有 1–2 条示例数据

### TC-HTML-06：模拟数据贴合业务背景
- 期望行为：数据内容（公司名、产品名、数值单位等）与 CLAUDE.md 中描述的客户行业和业务场景一致
- 不期望行为：使用通用占位数据（如 "Company A"、"Product 1"、"123"）

### TC-HTML-07：跨模块数据一致性
- 期望行为：同一实体（如同一设备、同一订单）在不同页面/模块中显示的数据一致
- 不期望行为：同一设备在列表页和详情页显示不同的参数值

### TC-HTML-08：核心交互可操作
- 期望行为：点击、表单提交、状态切换、数据展示等核心交互均可正常操作
- 不期望行为：按钮无响应；表单提交无反应；图表不渲染

---

## TC-BEH：大模型行为规范

### TC-BEH-01：禁止在 Session 0a/0b 写业务实现代码
- 触发：Session 0a 或 0b 执行期间
- 期望行为：只产出文档文件（.md），不生成任何 HTML/JS/CSS 业务代码
- 不期望行为：在 Session 0b 中顺带生成 HTML 原型

### TC-BEH-02：禁止一次性执行多个 tasksubsession
- 触发：用户发送"请执行 tasksubsession1.md 和 tasksubsession2.md"
- 期望行为：告知用户每次只执行一个 Session，建议先执行 Session 1
- 不期望行为：同时执行两个 Session

### TC-BEH-03：禁止未读 CLAUDE.md 和 task.md 就开始执行
- 触发：执行任意 tasksubsession
- 期望行为：执行前必须读取 `project_root/CLAUDE.md` 和 `task_root/task.md`（以及 tasksubsession 中列出的其他上下文文件）
- 不期望行为：跳过上下文读取直接执行子任务

### TC-BEH-04：需求文档未确认时禁止进入 Session 0b
- 触发：Session 0a 完成后，用户未明确确认需求文档
- 期望行为：等待用户确认，不自动进入 Session 0b
- 不期望行为：Session 0a 完成后自动继续执行 Session 0b

### TC-BEH-05：测试通过后输出格式正确
- 期望行为：输出包含"Session N 测试通过"、"Tests: passed"、交付物简述、验收提示四个部分
- 不期望行为：输出格式随意；缺少验收提示

### TC-BEH-06：用户验收通过后输出格式正确
- 期望行为：输出包含"Session N 完成"、summary 文件路径、"`task_root/memory.md` 已更新"、下一步提示四个部分
- 不期望行为：缺少下一步提示；未告知 summary 文件路径

---

## TC-MOD：需求变更与修订

### TC-MOD-01：修改 task.md / design.md 不影响已完成 Session
- 场景：Session 2 执行中发现 task.md 需要调整
- 期望行为：修改 `task_root/task.md` / `task_root/design.md` 后，从当前 Session 重新执行，已完成的 Session 1 不受影响
- 不期望行为：要求重新执行 Session 1

### TC-MOD-02：修改 work-plan.md 需更新受影响的 tasksubsession
- 场景：work-plan.md 中 Session 3 的范围发生变化
- 期望行为：更新 `task_root/tasksubsession3.md`（及后续受影响的文件），再执行
- 不期望行为：直接执行旧的 tasksubsession3.md

### TC-MOD-03：CLAUDE.md 基本不变
- 场景：执行过程中用户提出修改 CLAUDE.md
- 期望行为：提醒用户 `project_root/CLAUDE.md` 仅在项目级约束发生根本变化时才更新，确认是否真的需要修改
- 不期望行为：随意修改 CLAUDE.md

### TC-MOD-04：中改 — 单模块范围变化，不触发全量重规划
- 场景：Session 3 执行中，用户修改了 PRD.md 中某一个模块的功能描述，整体 In Scope 不变
- 期望行为：局部修订 work-plan.md 和受影响的 tasksubsession 文件，不重新生成全量 tasksubsession，从当前 Session 重新执行
- 不期望行为：触发大改流程，要求重新执行 Session 0b

### TC-MOD-05：大改 — In Scope 有模块增减，触发全量重规划
- 场景：Session 3 验收未通过，用户与 Codex 修正后 PRD.md 新增了一个功能模块
- 期望行为：停止当前 Session（不写 summary、不更新 `task_root/memory.md`），开新窗口重新执行 Session 0b，重新产出 `task_root/design.md`（模块边界变化时）、`task_root/work-plan.md`、`tasksubsession1~N.md`，`task_root/memory.md` 追加变更记录
- 不期望行为：继续执行当前 Session；只修改受影响的 tasksubsession 而不重新规划

### TC-MOD-06：大改后输出复用评估表
- 场景：大改 Session 0b 完成后
- 期望行为：输出包含已完成 Session 列表的复用评估表，每行含交付物描述、兼容性评估（✅/⚠️/❌）、建议、用户决定列，停止等待用户逐条确认
- 不期望行为：自行决定哪些 Session 复用；跳过评估表直接从 Session 1 重新执行

### TC-MOD-07：大改后按用户复用决策执行
- 场景：用户确认 Session 1 复用、Session 2 复用、Session 3 重做
- 期望行为：`task_root/memory.md` 追加复用决策记录，从 Session 3 开始重新执行，不重跑 Session 1 和 2
- 不期望行为：忽略用户决策从 Session 1 重新执行；自行跳过用户标记为"重做"的 Session

### TC-MOD-08：大改时 design.md 处理
- 场景 A：大改导致模块边界变化 → 期望行为：重新生成 design.md
- 场景 B：大改但模块边界不变，只是功能细节调整 → 期望行为：只更新 design.md 变化部分，不整体推倒重写
- 不期望行为：无论变化大小一律重新生成 design.md

---

## 测试优先级说明

| 优先级 | 测试用例 | 说明 |
|--------|----------|------|
| P0（必测） | TC-E-01~06、TC-0A-08、TC-0A-09、TC-0B-12、TC-EX-03、TC-EX-04、TC-CTX-02、TC-MOD-05、TC-MOD-06 | 核心流程控制，错误会导致工作流失效 |
| P1（重要） | TC-0A-01~07、TC-0B-01~12、TC-EX-01~10、TC-HTML-01~08、TC-MOD-04、TC-MOD-07、TC-MOD-08 | 文档完整性和交付物质量 |
| P2（一般） | TC-BEH-01~06、TC-MOD-01~03、TC-CTX-01、TC-CTX-03~04 | 边界行为和修订场景 |
