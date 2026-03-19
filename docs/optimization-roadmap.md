# VibeCoding Workflow — 优化实施路线图

> 基于项目评估报告（docs/project-evaluation.md）
> 制定日期：2026-03-14
> 预计完成：2026-05-09（8 周）
> **已完成里程碑（2026-03-15，已在 2026-03-17 回写现状）：** VS Code Dashboard UI 专业重设计 — topbar phase/gate/runner pills、stats 统计行、run status details、runner 控制卡、Session 时间线双面板布局，TypeScript 零错误编译。`pending_review` 专属持久态未进入当前基线契约。
> **2026-03-19 当前基线说明：** 本路线图中所有 `run-vibecoding-loop.py` 相关任务属于历史规划。当前执行层使用 Roo Code `/run-session`；旧脚本已归档到 `scripts/archived/run-vibecoding-loop.py`，仅作历史参考。

---

## 一、优化项总览

| 优先级 | 数量 | 总工作量 | 核心目标 |
|--------|------|---------|---------|
| P0 | 3 项 | 10 天 | 生产稳定性 + 质量保障 |
| P1 | 4 项 | 8 天 | 稳定性 + 安全 |
| P2 | 3 项 | 9 天 | 可扩展性 + 开发者体验 |
| P3 | 3 项 | 9 天 | 生态完善 + 性能 |
| **合计** | **13 项** | **36 天** | **MVP → 企业级** |

---

## 二、Phase 1：生产就绪（第 1-2 周）

**目标：** 修复关键缺陷，建立质量保障体系

### Week 1

#### Day 1-2：P0-1 并发安全修复

**任务清单：**
- [ ] 实现 `atomic_write_memory()` 函数（使用 `fcntl` 文件锁）
- [ ] 重构 `run-vibecoding-loop.py` 中所有 `memory.md` 写入操作
- [ ] 添加并发写入单元测试（模拟多进程场景）
- [ ] 验证 macOS/Linux 兼容性

**交付物：**
- `scripts/utils/file_lock.py`（新增）
- `tests/unit/test_file_lock.py`（新增）
- `run-vibecoding-loop.py`（修改）

**验收标准：**
- 10 个并发进程同时写入 `memory.md`，无状态损坏
- 单元测试覆盖正常/异常/超时场景

---

#### Day 3-7：P0-2 单元测试覆盖

**任务清单：**
- [ ] 搭建测试框架（pytest + pytest-cov）
- [ ] 编写状态机测试（`test_state_machine.py`）
  - 测试所有合法状态转换（design → development → done）
  - 测试非法转换拒绝（development → design）
  - 测试会话门控逻辑（测试未通过不推进）
- [ ] 编写 `memory.md` 解析测试（`test_memory_parser.py`）
  - 测试合法格式解析
  - 测试格式错误检测（缺少必需字段、类型错误）
- [ ] 编写 JSON Schema 验证测试（`test_manifest_validator.py`）
- [ ] 编写错误处理测试（`test_error_handling.py`）
  - 测试 `WorkflowError` 错误码体系
  - 测试异常传播和日志记录

**交付物：**
- `tests/unit/` 目录（4 个测试文件）
- `tests/fixtures/` 目录（测试数据）
- `pytest.ini` 配置文件

**验收标准：**
- 核心状态机逻辑覆盖率 ≥ 95%
- 整体代码覆盖率 ≥ 80%
- 所有测试通过，无 flaky tests

---

### Week 2

#### Day 8-10：P0-3 CI/CD 流水线

**任务清单：**
- [ ] 创建 `.github/workflows/ci.yml`
  - 配置 Python 3.11 环境
  - 运行单元测试 + 覆盖率报告
  - 运行 ruff + mypy 静态检查
- [ ] 配置 VS Code 扩展构建
  - 运行 `npm ci && npm run compile`
  - 运行扩展单元测试
- [ ] 配置发布流水线（`release.yml`）
  - 触发条件：git tag `v*`
  - 打包 VS Code 扩展（`vsce package`）
  - 发布到 VS Code Marketplace（需配置 PAT）
- [ ] 添加 GitHub Actions 徽章到 README

**交付物：**
- `.github/workflows/ci.yml`（新增）
- `.github/workflows/release.yml`（新增）
- `README.md`（更新徽章）

**验收标准：**
- 每次 push/PR 自动触发 CI
- 测试失败时 PR 无法合并
- 打 tag 后自动发布扩展

---

**Phase 1 里程碑：**
- ✅ 并发安全问题修复
- ✅ 测试覆盖率达到企业标准
- ✅ 自动化质量保障体系建立
- **评分提升：** 3.5 → 4.0 星

---

## 三、Phase 2：稳定性增强（第 3-4 周）

**目标：** 增强错误恢复能力，加固安全防护

### Week 3

#### Day 11-13：P1-1 错误恢复机制

**任务清单：**
- [ ] 实现 `StateTransaction` 上下文管理器
  - 进入时自动备份 `memory.md`
  - 异常时自动回滚
  - 正���退出时清理备份
- [ ] 重构会话循环，包裹事务
  ```python
  with StateTransaction(memory_path):
      update_memory(...)
      write_manifest(...)
  ```
- [ ] 添加手动回滚工具 `scripts/rollback-session.py`
  - 支持回滚到指定会话
  - 清理后续会话的 artifacts
- [ ] 编写事务测试（模拟崩溃场景）

**交付物：**
- `scripts/utils/transaction.py`（新增）
- `scripts/rollback-session.py`（新增）
- `tests/unit/test_transaction.py`（新增）

**验收标准：**
- 会话执行中断后，`memory.md` 自动回滚到上一个一致状态
- 手动回滚工具可恢复任意历史会话

---

#### Day 14-15：P1-2 代码质量工具

**任务清单：**
- [ ] 配置 `pyproject.toml`
  - ruff 规则（E, F, I, N, W, UP）
  - mypy 严格模式
  - pytest 配置
- [ ] 修复现有代码的 lint 问题
- [ ] 添加 pre-commit hook
  ```bash
  #!/bin/bash
  ruff check scripts/ || exit 1
  mypy scripts/ || exit 1
  pytest tests/unit -q || exit 1
  ```
- [ ] 更新 CI 流水线，集成 lint 检查

**交付物：**
- `pyproject.toml`（新增）
- `.git/hooks/pre-commit`（新增）
- `.github/workflows/ci.yml`（更新）

**验收标准：**
- 所有 Python 代码通过 ruff + mypy 检查
- 提交前自动运行 lint + 单元测试

---

### Week 4

#### Day 16-17：P1-3 输入验证

**任务清单：**
- [ ] 实现 `validate_project_path()` 函数
  - 检查路径遍历（`..` 检测）
  - 验证必需文件存在（`.project/memory.md`）
  - 返回规范化绝对路径
- [ ] 在 `run-vibecoding-loop.py` 入口处调用验证
- [ ] 添加输入验证测试
  - 测试合法路径通过
  - 测试路径遍历被拒绝
  - 测试非法项目被拒绝

**交付物：**
- `scripts/utils/validation.py`（新增）
- `tests/unit/test_validation.py`（新增）
- `run-vibecoding-loop.py`（更新）

**验收标准：**
- 路径遍历攻击被阻止（如 `../../etc/passwd`）
- 非 VibeCoding 项目目录被拒绝

---

#### Day 18：P1-4 敏感信息保护

**任务清单：**
- [ ] 实现 `sanitize_log()` 函数
  - 脱敏 password、api_key、token、email
  - 使用正则表达式匹配
- [ ] 在所有日志输出前调用脱敏
- [ ] 添加脱敏测试（验证各类敏感信息被替换）

**交付物：**
- `scripts/utils/sanitize.py`（新增）
- `tests/unit/test_sanitize.py`（新增）
- `run-vibecoding-loop.py`（更新日志调用）

**验收标准：**
- 日志中不包含明文密码、API 密钥、邮箱

---

**Phase 2 里程碑：**
- ✅ 会话中断自动恢复
- ✅ 代码质量工具链完整
- ✅ 安全防护加固
- **评分提升：** 4.0 → 4.2 星

---

## 四、Phase 3：可扩展性（第 5-6 周）

**目标：** 优化架构，提升开发者体验

### Week 5

#### Day 19-23：P2-1 状态存储优化

**任务清单：**
- [ ] 设计新状态存储结构（方案 A）
  ```
  .project/state/
  ├── current.json       # 当前状态（快速读取）
  ├── history.jsonl      # 状态变更历史
  └── memory.md          # 人类可读视图（自动生成）
  ```
- [ ] 实现状态读写 API
  - `read_current_state() -> dict`
  - `write_state_update(update: dict)`
  - `generate_memory_md(state: dict) -> str`
- [ ] 实现迁移工具 `scripts/migrate-state-storage.py`
  - 从旧格式（单文件 `memory.md`）迁移到新格式
  - 保留向后兼容性（可读取旧格式）
- [ ] 更新驱动器逻辑，使用新 API
- [ ] 添加状态存储测试

**交付物：**
- `scripts/utils/state_storage.py`（新增）
- `scripts/migrate-state-storage.py`（新增）
- `tests/unit/test_state_storage.py`（新增）
- `run-vibecoding-loop.py`（更新）

**验收标准：**
- 新格式支持 100+ 会话（无性能瓶颈）
- 旧项目可无缝迁移到新格式
- 状态历史可查询（`history.jsonl`）

---

### Week 6

#### Day 24-26：P2-2 API 文档

**任务清单：**
- [ ] 为所有公共函数添加 docstring（Google 风格）
  - 包含 Args、Returns、Raises、Example
- [ ] 配置 Sphinx
  - 安装 `sphinx` + `sphinx-rtd-theme`
  - 创建 `docs/api/` 目录
  - 配置 `conf.py`（autodoc 扩展）
- [ ] 生成 HTML 文档
  ```bash
  cd docs/api
  sphinx-apidoc -o . ../../scripts
  make html
  ```
- [ ] 发布到 GitHub Pages
  - 配置 `.github/workflows/docs.yml`
  - 自动构建并推送到 `gh-pages` 分支

**交付物：**
- `scripts/` 所有文件（添加 docstring）
- `docs/api/conf.py`（新增）
- `.github/workflows/docs.yml`（新增）
- API 文档网站（https://username.github.io/vibecodingworkflow/api/）

**验收标准：**
- 所有公共 API 有完整 docstring
- API 文档网站可访问，内容完整

---

#### Day 27：P2-3 依赖管理规范化

**任务清单：**
- [ ] 创建 `requirements-dev.txt`
  ```
  pytest==8.0.0
  pytest-cov==4.1.0
  mypy==1.8.0
  ruff==0.2.0
  sphinx==7.2.0
  sphinx-rtd-theme==2.0.0
  ```
- [ ] 锁定 VS Code 扩展依赖版本（`package.json`）
- [ ] 更新 README，添加开发环境搭建步骤
  ```bash
  # Python 环境
  pip install -r requirements-dev.txt

  # VS Code 扩展
  cd integrations/vibecoding-vscode-extension
  npm ci
  ```

**交付物：**
- `requirements-dev.txt`（新增）
- `integrations/vibecoding-vscode-extension/package.json`（更新）
- `README.md`（更新）

**验收标准：**
- 新贡献者可按 README 一键搭建开发环境
- 依赖版本锁定，构建可复现

---

**Phase 3 里程碑：**
- ✅ 状态存储支持大型项目
- ✅ API 文档完整可查
- ✅ 开发环境标准化
- **评分提升：** 4.2 → 4.4 星

---

## 五、Phase 4：生态完善（第 7-8 周）

**目标：** 完善插件系统，优化性能和用户体验

### Week 7

#### Day 28-31：P3-1 插件系统标准化

**任务清单：**
- [ ] 设计插件接口 `VibeCodingPlugin`（ABC）
  ```python
  class VibeCodingPlugin(ABC):
      @abstractmethod
      def name(self) -> str: ...
      @abstractmethod
      def execute(self, context: dict) -> dict: ...
  ```
- [ ] 实现插件注册表 `PLUGIN_REGISTRY`
- [ ] 迁移 `/nss` 命令到插件（`NextSessionSwitchPlugin`）
- [ ] 实现插件加载器
  - 从 `plugins/` 目录自动发现插件
  - 支持配置文件启用/禁用插件
- [ ] 编写插件开发指南（`docs/plugin-development.md`）
- [ ] 添加插件测试

**交付物：**
- `plugins/plugin_interface.py`（新增）
- `plugins/nss_plugin.py`（新增，迁移现有逻辑）
- `scripts/plugin_loader.py`（新增）
- `docs/plugin-development.md`（新增）
- `tests/unit/test_plugins.py`（新增）

**验收标准：**
- `/nss` 命令通过插件系统运行，功能不变
- 第三方可按指南开发新插件

---

### Week 8

#### Day 32-33：P3-2 故障排查指南

**任务清单：**
- [ ] 创建 `docs/troubleshooting.md`
- [ ] 编写常见问题解决方案
  - `memory.md` 状态不一致（回滚步骤）
  - VS Code 扩展无法加载（诊断命令）
  - JSON Schema 验证失败（字段规范）
  - 阶段门控未通过（测试要求）
  - 会话卡住不推进（日志分析）
- [ ] 添加诊断工具 `scripts/diagnose.py`
  - 检查项目结构完整性
  - 验证 `memory.md` 格式
  - 检查 manifest 文件一致性
  - 输出诊断报告

**交付物：**
- `docs/troubleshooting.md`（新增）
- `scripts/diagnose.py`（新增）

**验收标准：**
- 覆盖 80% 常见错误场景
- 诊断工具可自动发现问题

---

#### Day 34-36：P3-3 性能优化

**任务清单：**
- [ ] 实现 `memory.md` 解析缓存
  ```python
  @lru_cache(maxsize=1)
  def load_memory_state(path: str, mtime: float) -> dict:
      ...
  ```
- [ ] 实现 JSON Schema 缓存（避免重复加载）
- [ ] 优化大文件写入（增量更新）
- [ ] 添加性能基准测试
  - 测试 1000 次状态读取耗时
  - 测试 100 次状态更新耗时
- [ ] 生成性能报告

**交付物：**
- `scripts/utils/cache.py`（新增）
- `tests/benchmark/test_performance.py`（新增）
- `docs/performance-report.md`（新增）

**验收标准：**
- 状态读取性能提升 10 倍（缓存命中时）
- 大文件写入性能提升 5 倍（增量更新）

---

**Phase 4 里程碑：**
- ✅ 插件系统可扩展
- ✅ 故障排查体验优化
- ✅ 性能达到企业级标准
- **最终评分：** 4.4 → 4.5 星

---

## 六、交付物清单

### 新增文件（26 个）

**核心代码：**
- `scripts/utils/file_lock.py`
- `scripts/utils/transaction.py`
- `scripts/utils/validation.py`
- `scripts/utils/sanitize.py`
- `scripts/utils/state_storage.py`
- `scripts/utils/cache.py`
- `scripts/rollback-session.py`
- `scripts/migrate-state-storage.py`
- `scripts/diagnose.py`
- `scripts/plugin_loader.py`
- `plugins/plugin_interface.py`
- `plugins/nss_plugin.py`

**测试：**
- `tests/unit/test_file_lock.py`
- `tests/unit/test_state_machine.py`
- `tests/unit/test_memory_parser.py`
- `tests/unit/test_manifest_validator.py`
- `tests/unit/test_error_handling.py`
- `tests/unit/test_transaction.py`
- `tests/unit/test_validation.py`
- `tests/unit/test_sanitize.py`
- `tests/unit/test_state_storage.py`
- `tests/unit/test_plugins.py`
- `tests/benchmark/test_performance.py`

**配置：**
- `pyproject.toml`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/workflows/docs.yml`
- `requirements-dev.txt`
- `pytest.ini`
- `.git/hooks/pre-commit`

**文档：**
- `docs/project-evaluation.md`（本报告）
- `docs/optimization-roadmap.md`（本文档）
- `docs/plugin-development.md`
- `docs/troubleshooting.md`
- `docs/performance-report.md`
- `docs/api/conf.py`

### 修改文件（4 个）

- `scripts/run-vibecoding-loop.py`（集成所有优化）
- `integrations/vibecoding-vscode-extension/package.json`（锁定依赖）
- `README.md`（添加徽章和开发指南）
- `docs/workflow-standard.md`（更新状态存储规范）

---

## 七、风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 单元测试编写耗时超预期 | 延期 1-2 周 | 中 | 优先覆盖核心状态机，非关键路径可后补 |
| 状态存储迁移破坏兼容性 | 用户项目无法升级 | 低 | 保留旧格式读取能力，提供迁移工具 |
| CI/CD 配置复杂度高 | 延期 3-5 天 | 低 | 使用 GitHub Actions 模板，参考成熟项目 |
| 插件系统设计不当 | 重构成本高 | 中 | 先实现最小接口，预留扩展点 |

---

## 八、成功指标

| 指标 | 当前 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|------|---------|---------|---------|---------|
| 单元测试覆盖率 | 0% | 80% | 85% | 90% | 90% |
| CI 通过率 | N/A | 95% | 98% | 98% | 99% |
| 并发安全 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 错误恢复 | ❌ | ❌ | ✅ | ✅ | ✅ |
| 安全加固 | ❌ | ❌ | ✅ | ✅ | ✅ |
| API 文档 | ❌ | ❌ | ❌ | ✅ | ✅ |
| 插件系统 | 硬编码 | 硬编码 | 硬编码 | 硬编码 | ✅ 标准化 |
| VS Code Dashboard | UI shell | UI shell | UI shell | UI shell | HITL+pills |
| 性能优化 | 基线 | 基线 | 基线 | 基线 | +10x 读取 |
| **综合评分** | **3.5** | **4.0** | **4.2** | **4.4** | **4.5** |

---

## 九、资源需求

**人力：**
- 1 名全职工程师（Python + TypeScript）
- 或 2 名兼职工程师（各 50% 时间）

**时间：**
- 8 周（36 个工作日）

**工具：**
- GitHub Actions（免费额度足够）
- VS Code Marketplace 发布账号（一次性申请）
- GitHub Pages（免费）

---

## 十、下一步行动

1. **立即开始：** P0-1 并发安全修复（2 天）
2. **本周完成：** P0-2 单元测试框架搭建（5 天）
3. **下周完成：** P0-3 CI/CD 流水线（3 天）
4. **两周后评审：** Phase 1 完成度和质量

**联系人：** [项目负责人]
**进度跟踪：** [GitHub Project Board / Jira]
