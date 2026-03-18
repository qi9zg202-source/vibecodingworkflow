const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Module = require('module');

const extensionRoot = path.resolve(__dirname, '..');
const skillRoot = path.resolve(extensionRoot, '..');
const baseFixtureRoot = path.join(skillRoot, 'fixtures', 'session8-smoke-project');
const driverPath = '/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/scripts/run-vibecoding-loop.py';
const artifactsDir = path.join(skillRoot, 'artifacts');
const reportPath = path.join(artifactsDir, 'session11-real-scenario-report.json');
const fixtureMarkerFileName = 'TEST_FIXTURE.md';
const langGraphBaseUrl = process.env.LANGGRAPH_BASE_URL || 'http://127.0.0.1:2024';

const originalLoad = Module._load;

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });
  await assertLangGraphServerOnline();

  const scenario = createRealScenarioFixture();
  const runnerCommandTemplate = [
    'python3 -c',
    `"from pathlib import Path; Path(r'outputs/session-logs/runner-smoke.txt').write_text('`,
    `{next_session}|{next_prompt}\\n`,
    `', encoding='utf-8')"`
  ].join(' ');

  const state = createScenarioState(scenario.root, runnerCommandTemplate);
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return state.mockVscode;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let extensionModule;
  const context = { subscriptions: [] };
  try {
    purgeExtensionCache();
    extensionModule = require(path.join(extensionRoot, 'out', 'extension.js'));
    extensionModule.activate(context);

    assert(state.registeredWebviewProviders.includes('vibeCodingDashboardView'), 'Dashboard sidebar view provider should register during activation.');

    await invoke(state, 'vibeCoding.selectWorkflow', scenario.customerRoot);
    await invoke(state, 'vibeCoding.refreshWorkflowStatus');
    await invoke(state, 'vibeCoding.openMemory');
    await invoke(state, 'vibeCoding.openStartupPrompt');
    await invoke(state, 'vibeCoding.openNextSessionPrompt');
    await invoke(state, 'vibeCoding.prepareFreshSession');
    await invoke(state, 'vibeCoding.activateWorkflowRunner', scenario.customerRoot);

    const customerThreadId = buildThreadId(scenario.customerRoot, resolveTaskIdentifier(scenario.customerRoot));
    const interruptedState = await waitForThreadState(customerThreadId, hasInterruptTask);
    await waitForFile(scenario.customerRunnerSmokePath);
    await invoke(state, 'vibeCoding.refreshWorkflowStatus');

    assert(fs.existsSync(scenario.customerRunnerSmokePath), 'Customer workflow runner smoke file should exist.');
    assert(fs.readFileSync(scenario.customerRunnerSmokePath, 'utf8').trim() === '3|session-3-prompt.md', 'Customer workflow runner smoke file should contain the expected handoff.');
    assert(state.terminalCommands.length === 0, 'LangGraph path should not spawn a runner terminal command.');
    assert(
      state.infoMessages.some((entry) => entry.message.includes('Current session triggered via LangGraph')),
      `Ready workflow should confirm LangGraph trigger. Messages:\n${JSON.stringify(state.infoMessages, null, 2)}`
    );
    assert(
      state.outputLines.some((line) => String(line).includes('next_action=review_session')),
      `Ready workflow should refresh into review wait. Output:\n${state.outputLines.slice(-30).join('\n')}`
    );

    await invoke(state, 'vibeCoding.selectWorkflow', scenario.fabRoot);
    await invoke(state, 'vibeCoding.refreshWorkflowStatus');
    await invoke(state, 'vibeCoding.openMemory');
    await invoke(state, 'vibeCoding.openStartupPrompt');
    await invoke(state, 'vibeCoding.openNextSessionPrompt');
    await invoke(state, 'vibeCoding.activateWorkflowRunner', scenario.fabRoot);

    assert(hasOpenedPath(state.openedDocuments, '/customer-service-workbench/memory.md'), 'Customer workflow memory should open from the selected workflow root.');
    assert(hasOpenedPath(state.openedDocuments, '/customer-service-workbench/startup-prompt.md'), 'Customer workflow startup prompt should open from the selected workflow root.');
    assert(hasOpenedPath(state.openedDocuments, '/customer-service-workbench/session-3-prompt.md'), 'Customer workflow next session prompt should resolve to session-3.');

    assert(hasOpenedPath(state.openedDocuments, '/fab-energy-insights/memory.md'), 'Fab workflow memory should open from the selected workflow root.');
    assert(hasOpenedPath(state.openedDocuments, '/fab-energy-insights/startup-prompt.md'), 'Fab workflow startup prompt should open from the selected workflow root.');
    assert(hasOpenedPath(state.openedDocuments, '/fab-energy-insights/session-5-prompt.md'), 'Fab workflow next session prompt should resolve to session-5.');

    assert(
      state.warningMessages.some((entry) => entry.message.includes('workflow is blocked') || entry.message.includes('Workflow blocked')),
      `Fab workflow should surface a blocked warning after refresh. Warnings:\n${JSON.stringify(state.warningMessages, null, 2)}`
    );
    assert(state.terminalCommands.length === 0, 'Blocked workflow must not add any runner terminal command.');
    assert(
      state.statusBarHistory.some((entry) => entry.text.includes('W ready')),
      `Ready workflow should update the status bar. History:\n${JSON.stringify(state.statusBarHistory.slice(-8), null, 2)}`
    );
    assert(
      state.statusBarHistory.some((entry) => entry.text.includes('W blocked')),
      `Blocked workflow should update the status bar. History:\n${JSON.stringify(state.statusBarHistory.slice(-8), null, 2)}`
    );
    assert.strictEqual(state.errorMessages.length, 0, `Unexpected errors:\n${JSON.stringify(state.errorMessages, null, 2)}`);
    const customerLoopLogEntry = readLatestLoopLogEntry(scenario.customerLoopLogPath);
    if (customerLoopLogEntry) {
      assert.strictEqual(customerLoopLogEntry.thread_id, customerThreadId, customerLoopLogEntry);
      assert.strictEqual(customerLoopLogEntry.session_number, 2, customerLoopLogEntry);
    }

    const report = {
      fixture_root: scenario.root,
      fixture_marker: fixtureMarkerFileName,
      cleanup_policy: 'Temporary fixture is deleted automatically after the script completes.',
      workflows: [
        {
          name: 'customer-service-workbench',
          project_root: scenario.customerRoot,
          expected_status: 'ready',
          expected_next_session: '3',
          expected_next_prompt: 'session-3-prompt.md',
          thread_id: customerThreadId,
          latest_loop_log_entry: customerLoopLogEntry,
          interrupted_next: interruptedState.next,
          runner_smoke_contents: fs.readFileSync(scenario.customerRunnerSmokePath, 'utf8').trim(),
        },
        {
          name: 'fab-energy-insights',
          project_root: scenario.fabRoot,
          expected_status: 'blocked',
          expected_next_session: '5',
          expected_next_prompt: 'session-5-prompt.md',
        },
      ],
      commands_executed: state.executedCommands,
      opened_documents: state.openedDocuments,
      terminal_commands: state.terminalCommands,
      info_messages: state.infoMessages,
      warning_messages: state.warningMessages,
      error_messages: state.errorMessages,
      status_bar_tail: state.statusBarHistory.slice(-8),
      output_tail: state.outputLines.slice(-30),
      cleanup_completed: false,
      result: 'passed',
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Session 11 real scenario smoke passed. Report written to ${reportPath}`);
  } finally {
    await disposeExtensionHost(extensionModule, context);
    Module._load = originalLoad;
    cleanupScenarioFixture(scenario.root);
    markCleanupComplete(reportPath);
  }
}

function createRealScenarioFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-real-scenario-'));
  const customerRoot = path.join(root, 'customer-service-workbench');
  const fabRoot = path.join(root, 'fab-energy-insights');

  fs.cpSync(baseFixtureRoot, customerRoot, { recursive: true });
  fs.cpSync(baseFixtureRoot, fabRoot, { recursive: true });

  retargetFixturePaths(customerRoot);
  retargetFixturePaths(fabRoot);
  writeFixtureMarker(customerRoot, 'customer-service-workbench');
  writeFixtureMarker(fabRoot, 'fab-energy-insights');

  customizeCustomerWorkflow(customerRoot);
  customizeFabWorkflow(fabRoot);
  resetRuntimeArtifacts(customerRoot);
  resetRuntimeArtifacts(fabRoot);

  return {
    root,
    customerRoot,
    fabRoot,
    customerRunnerSmokePath: path.join(customerRoot, 'outputs', 'session-logs', 'runner-smoke.txt'),
    customerLoopLogPath: path.join(customerRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl'),
    fabLoopLogPath: path.join(fabRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl'),
  };
}

function retargetFixturePaths(projectRoot) {
  const markdownFiles = listMarkdownFiles(projectRoot);
  for (const filePath of markdownFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const updated = content.replace(new RegExp(escapeRegExp(baseFixtureRoot), 'g'), projectRoot);
    fs.writeFileSync(filePath, updated);
  }
}

function writeFixtureMarker(projectRoot, workflowName) {
  const markerPath = path.join(projectRoot, fixtureMarkerFileName);
  const markerContent = [
    '# TEST FIXTURE',
    '',
    `workflow: ${workflowName}`,
    'purpose: Temporary business workflow fixture for VibeCoding plugin testing.',
    'cleanup: Delete automatically after smoke:session11 completes.',
  ].join('\n');
  fs.writeFileSync(markerPath, markerContent);
}

function customizeCustomerWorkflow(projectRoot) {
  replaceFileContent(path.join(projectRoot, 'PRD.md'), [
    '# PRD.md',
    '',
    '## Problem',
    '- 客服主管需要一个统一工单工作台，集中查看待处理会话、升级单和 SLA 风险。',
    '- 当前流程分散在多个表格和 IM 群里，交接成本高，容易漏掉高优先级工单。',
    '',
    '## Goal',
    '- 构建客服工单工作台，支持队列总览、优先级筛选和会话上下文查看。',
    '- 让一线客服能快速定位即将超时的工单并完成响应。',
    '',
    '## Acceptance Criteria',
    '- 能展示工单队列、状态筛选和 SLA 风险提示。',
    '- 能打开单个工单详情并查看最近会话摘要。',
    '- 能通过最小交互流完成“筛选高优先级工单 -> 打开详情 -> 生成回复草稿”。',
    '',
  ].join('\n'));

  replaceFileContent(path.join(projectRoot, 'work-plan.md'), [
    '# Work Plan',
    '',
    '## Session 0',
    '- 客服工单工作台范围定义与流程约束',
    '',
    '## Session 1',
    '- 工作台前端骨架与最小入口',
    '',
    '## Session 2',
    '- 工单队列页面地图、字段结构与接口契约',
    '',
    '## Session 3',
    '- 队列筛选、客服上下文与数据加载链路',
    '',
    '## Session 4',
    '- 工单列表、详情抽屉与 SLA 风险提示',
    '',
    '## Session 5',
    '- 回复草稿、标签操作与客服动作面板',
    '',
    '## Session 6',
    '- 工作台运行态集成与副作用层',
    '',
    '## Session 7',
    '- 异常工单、接口失败与降级路径',
    '',
    '## Session 8',
    '- 工作台集成联调',
    '',
    '## Session 9',
    '- 客服真实流程验证与边界样例',
    '',
    '## Session 10',
    '- 文档收尾与交付结束',
    '',
  ].join('\n'));

  replaceFileContent(path.join(projectRoot, 'memory.md'), [
    '# memory.md',
    '',
    '## Session Status',
    '- current_phase: development',
    '- last_completed_session: 2',
    '- last_completed_session_tests: passed',
    '- next_session: 3',
    '- next_session_prompt: `session-3-prompt.md`',
    '- session_gate: ready',
    '',
    '## Session Update Rule',
    '- 必须更新：',
    '  - `last_completed_session`',
    '  - `last_completed_session_tests`',
    '  - `next_session`',
    '  - `next_session_prompt`',
    '  - `session_gate`',
    '',
    '字段约定：',
    '- `last_completed_session_tests`: `passed` / `failed` / `blocked`',
    '- `session_gate`: `ready` / `blocked` / `in_progress` / `done`',
    '',
    '## Current Decisions',
    '- 记录跨 Session 的稳定结论',
    '- 不写未验证结论',
    '- 客服主管优先关注 4 小时内将超时的高优先级工单',
    '- 工单详情抽屉需要保留最近三轮客服-用户对话摘要',
    '',
    '## Known Risks',
    '- 记录会影响后续判断的风险',
    '- SLA 预警字段可能存在后端延迟',
    '- 回复草稿服务暂时只提供 mock 响应',
    '',
    '## Session Artifacts',
    '- session_0_outputs:',
    '- session_1_outputs:',
    '- session_2_outputs:',
    '- session_3_outputs:',
    '',
    '## Session Progress Record',
    '- 每次 Session 结束时，至少记录：',
    '  - 本 Session 完成了什么',
    '  - 执行了哪些测试',
    '  - 测试结果是 `passed` / `failed` / `blocked`',
    '  - 下一 Session 依赖哪些文件、字段或产物',
    '- 若本 Session 未完成：',
    '  - 不推进 `next_session`',
    '  - 保持当前 Session 作为下一轮入口',
    '- 若本 Session 已完成：',
    '  - 先更新本文件',
    '  - 再结束当前会话',
    '  - 再启动新的 Session / 新上下文',
    '  - 再从 `startup-prompt.md` 重新进入',
    '',
    '## Next Session Entry',
    '- 先读 `Session Status`',
    '- 再读 `design.md`',
    '- 再读 `work-plan.md`',
    '- 然后只做 `next_session` 指定内容',
    '',
  ].join('\n'));

  replaceInFile(path.join(projectRoot, 'session-3-prompt.md'), '- 实现配置、上下文、数据加载', '- 实现队列筛选、客服上下文与数据加载链路');
  replaceInFile(path.join(projectRoot, 'session-3-prompt.md'), '- 不做真实网络路径和质量统计', '- 不做回复草稿和复杂自动化动作');
  replaceInFile(path.join(projectRoot, 'session-3-prompt.md'), '- 语法检查\n- 最小输入运行\n- 结构校验', '- 队列筛选条件切换校验\n- mock 数据加载最小样例验证\n- 结构校验');
}

function customizeFabWorkflow(projectRoot) {
  replaceFileContent(path.join(projectRoot, 'PRD.md'), [
    '# PRD.md',
    '',
    '## Problem',
    '- Fab 能源团队需要一个能耗洞察台，集中查看冷站、空调和公辅系统的异常指标。',
    '- 当前数据分散在多个报表中，异常定位慢，无法快速决定是否需要人工干预。',
    '',
    '## Goal',
    '- 构建 Fab 能源洞察页面，支持多系统指标总览、异常告警和诊断入口。',
    '- 帮助值班工程师快速定位高能耗设备与异常工况。',
    '',
    '## Acceptance Criteria',
    '- 能展示关键能耗指标、告警状态和时间区间切换。',
    '- 能查看单台设备的趋势图和异常摘要。',
    '- 能从总览进入指定系统的诊断入口。',
    '',
  ].join('\n'));

  replaceFileContent(path.join(projectRoot, 'work-plan.md'), [
    '# Work Plan',
    '',
    '## Session 0',
    '- Fab 能源洞察台范围定义与流程约束',
    '',
    '## Session 1',
    '- 能源洞察页面骨架与最小入口',
    '',
    '## Session 2',
    '- 指标总览页面地图、数据结构与接口契约',
    '',
    '## Session 3',
    '- 时间区间筛选、设备上下文与数据加载链路',
    '',
    '## Session 4',
    '- 指标卡片、告警列表与趋势视图',
    '',
    '## Session 5',
    '- 诊断入口、系统联动与异常定位逻辑',
    '',
    '## Session 6',
    '- 运行态集成与指标订阅副作用层',
    '',
    '## Session 7',
    '- 采集缺失、异常数据与降级路径',
    '',
    '## Session 8',
    '- 能源洞察集成联调',
    '',
    '## Session 9',
    '- Fab 现场验证与边界样例',
    '',
    '## Session 10',
    '- 文档收尾与交付结束',
    '',
  ].join('\n'));

  replaceFileContent(path.join(projectRoot, 'memory.md'), [
    '# memory.md',
    '',
    '## Session Status',
    '- current_phase: development',
    '- last_completed_session: 4',
    '- last_completed_session_tests: blocked',
    '- next_session: 5',
    '- next_session_prompt: `session-5-prompt.md`',
    '- session_gate: blocked',
    '',
    '## Session Update Rule',
    '- 必须更新：',
    '  - `last_completed_session`',
    '  - `last_completed_session_tests`',
    '  - `next_session`',
    '  - `next_session_prompt`',
    '  - `session_gate`',
    '',
    '字段约定：',
    '- `last_completed_session_tests`: `passed` / `failed` / `blocked`',
    '- `session_gate`: `ready` / `blocked` / `in_progress` / `done`',
    '',
    '## Current Decisions',
    '- 记录跨 Session 的稳定结论',
    '- 不写未验证结论',
    '- 总览页先覆盖冷站、MAU 和 CDA 三类系统',
    '- 告警优先按单位产量能耗异常排序',
    '',
    '## Known Risks',
    '- 记录会影响后续判断的风险',
    '- 部分设备实时数据源仍未接入',
    '- 趋势图时间对齐逻辑尚未完成，Session 5 前不能推进 fresh session',
    '',
    '## Session Artifacts',
    '- session_0_outputs:',
    '- session_1_outputs:',
    '- session_2_outputs:',
    '- session_3_outputs:',
    '',
    '## Session Progress Record',
    '- 每次 Session 结束时，至少记录：',
    '  - 本 Session 完成了什么',
    '  - 执行了哪些测试',
    '  - 测试结果是 `passed` / `failed` / `blocked`',
    '  - 下一 Session 依赖哪些文件、字段或产物',
    '- 若本 Session 未完成：',
    '  - 不推进 `next_session`',
    '  - 保持当前 Session 作为下一轮入口',
    '- 若本 Session 已完成：',
    '  - 先更新本文件',
    '  - 再结束当前会话',
    '  - 再启动新的 Session / 新上下文',
    '  - 再从 `startup-prompt.md` 重新进入',
    '',
    '## Next Session Entry',
    '- 先读 `Session Status`',
    '- 再读 `design.md`',
    '- 再读 `work-plan.md`',
    '- 然后只做 `next_session` 指定内容',
    '',
  ].join('\n'));

  replaceInFile(path.join(projectRoot, 'session-5-prompt.md'), '- 实现核心 UI / API 逻辑 B', '- 完成诊断入口、系统联动与异常定位逻辑');
  replaceInFile(path.join(projectRoot, 'session-5-prompt.md'), '- 不做最终汇总和收尾', '- 不做最终交付文档和发布动作');
  replaceInFile(path.join(projectRoot, 'session-5-prompt.md'), '- 单元验证\n- A+B 最小联调验证', '- 诊断入口跳转校验\n- 系统联动与异常定位最小联调验证');
}

function listMarkdownFiles(projectRoot) {
  const filePaths = [];
  walkDirectory(projectRoot, (filePath) => {
    if (filePath.endsWith('.md')) {
      filePaths.push(filePath);
    }
  });
  return filePaths;
}

function walkDirectory(projectRoot, onFile) {
  const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(projectRoot, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(entryPath, onFile);
      continue;
    }
    onFile(entryPath);
  }
}

function replaceFileContent(filePath, content) {
  fs.writeFileSync(filePath, content);
}

function replaceInFile(filePath, before, after) {
  const content = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(filePath, content.replace(before, after));
}

function resetRuntimeArtifacts(projectRoot) {
  const logDir = path.join(projectRoot, 'outputs', 'session-logs');
  fs.mkdirSync(logDir, { recursive: true });

  for (const fileName of ['runner-smoke.txt', 'vibecoding-loop.jsonl']) {
    const filePath = path.join(logDir, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function cleanupScenarioFixture(root) {
  if (root && fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function markCleanupComplete(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  report.cleanup_completed = true;
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
}

function readLatestLoopLogEntry(loopLogPath) {
  if (!fs.existsSync(loopLogPath)) {
    return null;
  }

  const lines = fs.readFileSync(loopLogPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  return JSON.parse(lines[lines.length - 1]);
}

function createScenarioState(projectRoot, runnerCommandTemplate) {
  const outputLines = [];
  const infoMessages = [];
  const warningMessages = [];
  const errorMessages = [];
  const openedDocuments = [];
  const terminalCommands = [];
  const settingsRequests = [];
  const statusBarHistory = [];
  const registeredWebviewProviders = [];
  const commandRegistry = new Map();
  const executedCommands = [];

  const configState = {
    'vibeCoding.pythonPath': 'python3',
    'vibeCoding.driverPath': driverPath,
    'vibeCoding.defaultProjectRoot': projectRoot,
    'vibeCoding.runnerCommandTemplate': runnerCommandTemplate,
    'vibeCoding.langGraphServerUrl': langGraphBaseUrl,
  };

  const mockVscode = {
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    ThemeColor: class ThemeColor {
      constructor(id) {
        this.id = id;
      }
    },
    workspace: {
      workspaceFolders: [
        {
          uri: {
            fsPath: projectRoot,
          },
        },
      ],
      getConfiguration(section) {
        return {
          get(key) {
            return configState[`${section}.${key}`];
          },
        };
      },
      async openTextDocument(filePath) {
        if (!fs.existsSync(filePath)) {
          throw new Error(`Document not found: ${filePath}`);
        }
        return {
          fileName: filePath,
          uri: {
            fsPath: filePath,
          },
          getText() {
            return fs.readFileSync(filePath, 'utf8');
          },
        };
      },
    },
    window: {
      createOutputChannel(name) {
        return {
          name,
          append(value) {
            outputLines.push(String(value));
          },
          appendLine(value) {
            outputLines.push(String(value));
          },
          clear() {
            outputLines.length = 0;
          },
          show() {},
          dispose() {},
        };
      },
      createStatusBarItem() {
        const item = {
          text: '',
          tooltip: '',
          command: undefined,
          backgroundColor: undefined,
          name: '',
          show() {
            statusBarHistory.push({
              text: item.text,
              tooltip: String(item.tooltip),
              command: item.command,
              backgroundColor: item.backgroundColor && item.backgroundColor.id ? item.backgroundColor.id : null,
            });
          },
          dispose() {},
        };
        return item;
      },
    createTerminal(options) {
      return {
        name: options.name,
        show() {},
        sendText(text) {
          terminalCommands.push({
            name: options.name,
              cwd: options.cwd,
              text,
            });
          },
        };
      },
      async showTextDocument(document) {
        openedDocuments.push(document.uri.fsPath);
        return document;
      },
      async showInformationMessage(message, ...items) {
        infoMessages.push({ message, items });
        return undefined;
      },
      async showWarningMessage(message, ...items) {
        warningMessages.push({ message, items });
        return undefined;
      },
      async showErrorMessage(message, ...items) {
        errorMessages.push({ message, items });
        return undefined;
      },
      registerWebviewViewProvider(viewId) {
        registeredWebviewProviders.push(viewId);
        return {
          dispose() {},
        };
      },
    },
    commands: {
      registerCommand(id, callback) {
        commandRegistry.set(id, callback);
        return {
          dispose() {
            commandRegistry.delete(id);
          },
        };
      },
      async executeCommand(id, ...args) {
        settingsRequests.push({ id, args });
        return undefined;
      },
    },
    MarkdownString: class MarkdownString {
      constructor(value = '') {
        this.value = value;
        this.isTrusted = false;
      }
      appendMarkdown(value) {
        this.value += String(value);
      }
      toString() {
        return this.value;
      }
    },
  };

  return {
    mockVscode,
    outputLines,
    infoMessages,
    warningMessages,
    errorMessages,
    openedDocuments,
    terminalCommands,
    settingsRequests,
    statusBarHistory,
    registeredWebviewProviders,
    commandRegistry,
    executedCommands,
  };
}

async function invoke(state, commandId, ...args) {
  const command = state.commandRegistry.get(commandId);
  assert(command, `Command not registered: ${commandId}`);
  state.executedCommands.push({ id: commandId, args });
  await command(...args);
}

function buildThreadId(projectRoot, taskIdentifier) {
  const digest = crypto.createHash('sha1').update(`${projectRoot}:${taskIdentifier}`).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function resolveTaskIdentifier(projectRoot) {
  const taskPath = path.join(projectRoot, 'task.md');
  if (!fs.existsSync(taskPath)) {
    return path.basename(projectRoot);
  }

  const lines = fs.readFileSync(taskPath, 'utf8').split(/\r?\n/);
  let inTitle = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '## Title') {
      inTitle = true;
      continue;
    }
    if (inTitle && line.startsWith('## ')) {
      break;
    }
    if (inTitle && line) {
      return line.replace(/^-+\s*/, '').trim();
    }
  }

  return path.basename(projectRoot);
}

async function assertLangGraphServerOnline() {
  const payload = await requestJson('GET', '/ok');
  assert.deepStrictEqual(payload, { ok: true });
}

async function waitForThreadState(threadId, predicate, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastPayload = null;
  while (Date.now() - startedAt < timeoutMs) {
    const payload = await requestJson('GET', `/threads/${threadId}/state`);
    lastPayload = payload;
    if (predicate(payload)) {
      return payload;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for thread state. thread_id=${threadId} last_payload=${JSON.stringify(lastPayload)}`);
}

function hasInterruptTask(payload) {
  return Array.isArray(payload.tasks) && payload.tasks.some((task) => Array.isArray(task && task.interrupts) && task.interrupts.length > 0);
}

async function waitForFile(filePath, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}

function requestJson(method, targetPath, payload) {
  const url = new URL(targetPath, langGraphBaseUrl.endsWith('/') ? langGraphBaseUrl : `${langGraphBaseUrl}/`);
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const request = http.request(url, {
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      } : undefined,
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${responseBody}`));
          return;
        }
        try {
          resolve(responseBody ? JSON.parse(responseBody) : null);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function purgeExtensionCache() {
  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(path.join(extensionRoot, 'out'))) {
      delete require.cache[modulePath];
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasOpenedPath(openedDocuments, expectedSuffix) {
  return openedDocuments.some((filePath) => filePath.endsWith(expectedSuffix));
}

async function disposeExtensionHost(extensionModule, context) {
  await Promise.resolve(extensionModule?.deactivate?.());
  for (const disposable of [...context.subscriptions].reverse()) {
    if (disposable && typeof disposable.dispose === 'function') {
      await Promise.resolve(disposable.dispose());
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
