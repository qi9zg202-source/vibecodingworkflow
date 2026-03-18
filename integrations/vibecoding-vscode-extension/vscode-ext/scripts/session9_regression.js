const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { execFileSync, spawn } = require('child_process');

const extensionRoot = path.resolve(__dirname, '..');
const skillRoot = path.resolve(extensionRoot, '..');
const fixtureRoot = path.join(skillRoot, 'fixtures', 'session8-smoke-project');
const doneFixtureRoot = path.join(skillRoot, 'fixtures', 'mock-html-alpha');
const driverPath = '/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/scripts/run-vibecoding-loop.py';
const artifactsDir = path.join(skillRoot, 'artifacts');
const reportPath = path.join(artifactsDir, 'session9-regression-report.json');

const baseRunnerCommandTemplate = buildRunnerCommandTemplate(path.join(fixtureRoot, 'outputs', 'session-logs', 'runner-smoke.txt'));

const originalLoad = Module._load;

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });

  const doneStateProjectRoot = createFixtureCopyFrom(doneFixtureRoot, 'done-state');
  const doneStateRunnerSmokePath = path.join(doneStateProjectRoot, 'outputs', 'session-logs', 'done-runner-smoke.txt');

  const scenarios = [
    {
      name: 'blocked_state',
      projectRoot: createFixtureCopy('blocked-state', (root) => {
        const memoryPath = path.join(root, 'memory.md');
        const text = fs.readFileSync(memoryPath, 'utf8').replace('- session_gate: ready', '- session_gate: blocked');
        fs.writeFileSync(memoryPath, text);
      }),
      configOverrides: {},
      actions: ['vibeCoding.refreshWorkflowStatus', 'vibeCoding.prepareFreshSession', 'vibeCoding.startRunnerInTerminal'],
      verify(result) {
        assert(result.warningMessages.some((entry) => entry.message.includes('Workflow blocked') || entry.message.includes('Fresh session blocked')), 'Blocked scenario should show a blocked warning.');
        assert(result.errorMessages.every((entry) => !entry.message.includes('Start Runner In Terminal failed')), 'Blocked scenario should not surface a failed start error.');
        assert(result.terminalCommands.length === 0, 'Blocked scenario must not start a runner terminal command.');
        assert(result.statusBarTail.some((entry) => typeof entry.text === 'string' && entry.text.startsWith('Vibe: W blocked')), 'Blocked scenario should set the status bar to a blocked workflow state.');
        const blockedSection = extractSection(result.dashboardHtml, '<span class="panel-title">工作流列表</span>', '<span class="panel-title">Session 时间线</span>');
        assert(/data-command="vibeCoding\.activateWorkflowRunner"[^>]*disabled[^>]*title="当前 workflow 已 blocked，请先处理 review notes，再点击“重新开放当前 Session”。"/.test(blockedSection), 'Blocked workflow execute button should be disabled with a blocker hint.');
        assert(result.dashboardHtml.includes('data-command="vibeCoding.reopenSession"'), 'Blocked banner should expose a reopen action.');
      },
    },
    {
      name: 'reopen_blocked_session',
      projectRoot: createFixtureCopy('reopen-blocked-session', (root) => {
        const memoryPath = path.join(root, 'memory.md');
        const text = fs.readFileSync(memoryPath, 'utf8').replace('- session_gate: ready', '- session_gate: blocked');
        fs.writeFileSync(memoryPath, text);
      }),
      configOverrides: {},
      actions: [
        'vibeCoding.refreshWorkflowStatus',
        { id: 'vibeCoding.reopenSession', args: [(root) => root] },
      ],
      verify(result) {
        const memoryPath = path.join(result.project_root, 'memory.md');
        const memoryText = fs.readFileSync(memoryPath, 'utf8');
        assert(memoryText.includes('- session_gate: ready'), 'Reopen should move memory.md back to ready.');
        assert(result.infoMessages.some((entry) => entry.message.includes('当前 Session 已重新开放')), 'Reopen should surface a success message.');
        assert(result.dashboardHtml.includes('data-command="vibeCoding.activateWorkflowRunner"'), 'Dashboard should still render execute controls after reopen.');
        assert(!result.dashboardHtml.includes('Session 已驳回'), 'Blocked banner should disappear after reopen refresh.');
      },
    },
    {
      name: 'session_inspector_stale_ready_cache',
      projectRoot: createFixtureCopy('session-inspector-stale-ready-cache', () => {}),
      configOverrides: {},
      actions: [
        'vibeCoding.refreshWorkflowStatus',
        {
          label: 'rewrite_memory_blocked',
          run({ projectRoot }) {
            const memoryPath = path.join(projectRoot, 'memory.md');
            const memoryText = fs.readFileSync(memoryPath, 'utf8')
              .replace('- session_gate: ready', '- session_gate: blocked')
              .replace('- workflow_status: ready', '- workflow_status: blocked');
            fs.writeFileSync(memoryPath, memoryText);
          },
        },
        {
          id: 'vibeCoding.openSessionRuntimeInspector',
          args: [
            (root) => root,
            (root) => path.join(root, 'session-5-prompt.md'),
            'session-5-prompt.md',
          ],
        },
      ],
      verify(result) {
        assert(/data-command="vibeCoding\.activateWorkflowRunner"[^>]*disabled/.test(result.latestPanelHtml), 'Session Runtime Inspector rerun button should be disabled after memory.md becomes blocked.');
        assert(/data-command="vibeCoding\.reopenSession"/.test(result.latestPanelHtml), 'Session Runtime Inspector should expose a reopen action for blocked sessions.');
        assert(result.latestPanelHtml.includes('Workflow Gate') && result.latestPanelHtml.includes('blocked'), 'Session Runtime Inspector should render the effective blocked workflow gate.');
        assert(result.latestPanelHtml.includes('重新开放当前 Session'), 'Session Runtime Inspector should explain that blocked workflows must be reopened before rerun.');
      },
    },
    {
      name: 'multi_workflow_selection',
      projectRoot: createMultiWorkflowProject(),
      configOverrides: {},
      actions: [
        { id: 'vibeCoding.selectWorkflow', args: [(root) => path.join(root, 'inspection')] },
        'vibeCoding.openMemory',
        'vibeCoding.openStartupPrompt',
        'vibeCoding.refreshWorkflowStatus',
      ],
      verify(result) {
        assert(result.openedDocuments.some((filePath) => filePath.endsWith('/inspection/memory.md')), 'Selected workflow memory should come from the chosen workflow root.');
        assert(result.openedDocuments.some((filePath) => filePath.endsWith('/inspection/startup-prompt.md')), 'Selected workflow startup prompt should come from the chosen workflow root.');
        assert(result.warningMessages.some((entry) => entry.message.includes('Workflow blocked')), 'Inspection workflow should surface its own blocked status.');
        assert(result.outputLines.some((line) => line.includes('/inspection')), 'Selected workflow root should appear in output logging.');
      },
    },
    {
      name: 'process_table_decoupled_from_tree_selection',
      projectRoot: createMultiWorkflowProject(),
      configOverrides: {},
      actions: [
        { id: 'vibeCoding.selectWorkflow', args: [(root) => path.join(root, 'asset-ledger')] },
        'vibeCoding.startRunnerInTerminal',
        { id: 'vibeCoding.selectWorkflow', args: [(root) => path.join(root, 'inspection')] },
      ],
      verify(result) {
        const processSection = extractSection(result.dashboardHtml, '<span class="runner-card-title">LangGraph 运行时</span>', '<!-- ── Workflow + Session panels ── -->');
        assert(processSection.includes('执行中'), 'Process table should keep showing the active runner after switching tree selection.');
        assert(processSection.includes('/asset-ledger/.vibecoding/runner-state.sqlite'), 'Process table should remain bound to the actual runner workflow.');
        assert(!processSection.includes('Run: 空闲'), 'Process table should not flip to idle when selection changes.');
      },
    },
    {
      name: 'completed_workflow_runtime_overrides_runner_state',
      projectRoot: createFixtureCopyFrom(doneFixtureRoot, 'done-runtime'),
      configOverrides: {},
      setup(projectRoot) {
        writeRunnerStateRow(projectRoot, projectRoot, {
          runner_state: 'running',
          process_name: null,
          pid: null,
          started_at_epoch_ms: null,
        });
      },
      actions: ['vibeCoding.refreshWorkflowStatus'],
      verify(result) {
        const startupSection = extractSection(result.dashboardHtml, '<span class="panel-title">工作流列表</span>', '<span class="panel-title">Session 时间线</span>');
        assert(startupSection.includes('✓ 完成'), 'Completed workflow row should still show completed status.');
        assert(startupSection.includes('pill pill-done">✓ 完成</span>'), 'Runtime column should resolve to completed for done workflows.');
        assert(!startupSection.includes('pill pill-running'), 'Completed workflow runtime should not show running.');
      },
    },
    {
      name: 'python_not_found',
      projectRoot: fixtureRoot,
      configOverrides: {
        'vibeCoding.pythonPath': '/no/such/python3',
      },
      actions: ['vibeCoding.refreshWorkflowStatus'],
      verify(result) {
        assert(result.errorMessages.some((entry) => entry.message.includes('Python executable not found')), 'Bad python path should surface a Python executable error.');
        assert(!result.settingsRequests.some((entry) => entry.id === 'workbench.action.openSettings' || entry.id === 'vibeCoding.configurePythonDriverPath'), 'Bad python path should not silently rewrite settings.');
      },
    },
    {
      name: 'missing_runner_template',
      projectRoot: fixtureRoot,
      configOverrides: {
        'vibeCoding.runnerCommandTemplate': '',
      },
      actions: ['vibeCoding.startRunnerInTerminal'],
      verify(result) {
        assert(result.warningMessages.some((entry) => entry.message.includes('runnerCommandTemplate')), 'Missing runner template should show a warning.');
        assert(result.terminalCommands.length === 0, 'Missing runner template must not start a terminal command.');
      },
    },
    {
      name: 'done_state_runner_starts',
      projectRoot: doneStateProjectRoot,
      configOverrides: {
        'vibeCoding.runnerCommandTemplate': buildRunnerCommandTemplate(doneStateRunnerSmokePath),
      },
      actions: [
        { id: 'vibeCoding.selectWorkflow', args: [(root) => root] },
        { id: 'vibeCoding.activateWorkflowRunner', args: [(root) => root] },
      ],
      verify(result) {
        assert(result.warningMessages.every((entry) => !entry.message.includes('Runner not started because workflow status is done.')), 'Done workflow should no longer be blocked by the prepare result.');
        assert(result.infoMessages.some((entry) => entry.message.includes(`Active workflow switched to ${doneStateProjectRoot}`)), 'Done workflow should remain selectable from the dashboard tree.');
        assert(result.terminalCommands.length === 1, 'Done workflow should still start a runner terminal command.');
        assert(result.terminalCommands[0].text.includes('stdin_tty=no; stdout_tty=no; stderr_tty=no'), 'Runner logging wrapper should capture TTY diagnostics.');
        assert(result.terminalCommands[0].text.includes('if [ "$stdin_tty" = "yes" ] && [ "$stdout_tty" = "yes" ] && [ "$stderr_tty" = "yes" ]; then'), 'Runner logging wrapper should branch on stdin/stdout/stderr TTY availability.');
        assert(result.terminalCommands[0].text.includes('TERM="$runner_term" script -aqF "$RUNNER_LOG_PATH" /bin/bash -lc "$RUNNER_CMD" 2>>"$RUNNER_LOG_PATH"'), 'Runner logging wrapper should preserve a TTY for interactive runners.');
        assert(result.terminalCommands[0].text.includes('eval "$RUNNER_CMD" 2>&1 | tee -a "$RUNNER_LOG_PATH"'), 'Runner logging wrapper should keep a non-interactive fallback for automated execution.');
        execFileSync('/bin/bash', ['-lc', result.terminalCommands[0].text], {
          cwd: result.terminalCommands[0].cwd,
          stdio: 'pipe',
        });
        assert(fs.existsSync(doneStateRunnerSmokePath), 'Done workflow runner command should execute against the copied fixture.');
        assert(fs.readFileSync(doneStateRunnerSmokePath, 'utf8').trim() === 'none|none', 'Done workflow should pass through none-valued next session placeholders.');
        assert(result.outputLines.some((line) => line.includes('Preparing workflow via')), 'Done workflow should still call prepare before deciding whether to start.');
        assert(result.outputLines.some((line) => line.includes('prepare workflow_status=done')), 'Done workflow should log the driver prepare status.');
      },
    },
    {
      name: 'runner_state_persisted_to_sqlite',
      projectRoot: fixtureRoot,
      configOverrides: {},
      actions: ['vibeCoding.startRunnerInTerminal'],
      verify(result) {
        const dbPath = resolveFallbackRunnerDbPath(fixtureRoot);
        assert(fs.existsSync(dbPath), 'Runner state SQLite database should be created.');
        const row = readRunnerStateRow(dbPath, fixtureRoot, fixtureRoot);
        assert(row, 'Runner state row should exist in SQLite.');
        assert(row.runner_state === 'running', 'Runner state row should persist the running state.');
        assert(typeof row.process_name === 'string' && row.process_name.includes('VibeCoding Runner'), 'Runner state row should persist the terminal name.');
        assert(row.started_at_epoch_ms !== null, 'Runner state row should persist the runner start timestamp.');
      },
    },
    {
      name: 'runner_state_reconciles_idle_shell',
      projectRoot: createFixtureCopy('runner-idle-shell', (root) => {
        const dbPath = resolveFallbackRunnerDbPath(root);
        fs.rmSync(dbPath, { force: true });
        fs.rmSync(`${dbPath}-wal`, { force: true });
        fs.rmSync(`${dbPath}-shm`, { force: true });
      }),
      configOverrides: {
        __mockTerminalShellMode: 'idle_shell',
      },
      actions: ['vibeCoding.startRunnerInTerminal', 'vibeCoding.refreshWorkflowStatus'],
      verify(result) {
        const dbPath = resolveFallbackRunnerDbPath(result.project_root);
        const row = readRunnerStateRow(dbPath, result.project_root, result.project_root);
        assert(row, 'Runner state row should remain readable after reconciliation.');
        assert(row.runner_state === 'idle', 'Idle shell should reconcile the persisted runner state back to idle.');
        assert(row.process_name === null, 'Idle shell reconciliation should clear the persisted process metadata.');
        assert(result.outputLines.some((line) => line.includes('Runner state reconciled to idle')), 'Idle shell reconciliation should be logged.');
      },
    },
    {
      name: 'driver_invalid_json',
      projectRoot: fixtureRoot,
      configOverrides: {
        'vibeCoding.driverPath': createInvalidJsonDriver(),
      },
      actions: ['vibeCoding.refreshWorkflowStatus'],
      verify(result) {
        assert(result.errorMessages.some((entry) => entry.message.includes('Failed to parse driver JSON output')), 'Invalid JSON driver should surface a parse error.');
        assert(result.outputLines.some((line) => line.includes('driver_invalid_json')), 'Invalid JSON driver should log a structured driver error code.');
      },
    },
    {
      name: 'missing_workflow_file',
      projectRoot: createFixtureCopy('missing-startup', (root) => {
        fs.unlinkSync(path.join(root, 'startup-prompt.md'));
      }),
      configOverrides: {},
      actions: ['vibeCoding.refreshWorkflowStatus'],
      verify(result) {
        assert(result.warningMessages.some((entry) => entry.message.includes('Workflow files are incomplete')), 'Missing startup prompt should show a workflow file warning.');
        assert(result.statusBarTail.some((entry) => entry.text === 'Vibe: workflow invalid'), 'Missing startup prompt should push status bar to workflow invalid.');
      },
    },
  ];

  const scenarioFilter = process.env.SESSION9_SCENARIO;
  const selectedScenarios = scenarioFilter
    ? scenarios.filter((scenario) => scenario.name === scenarioFilter)
    : scenarios;
  assert(selectedScenarios.length > 0, `No Session 9 regression scenario matched filter: ${scenarioFilter}`);

  const reports = [];
  for (const scenario of selectedScenarios) {
    const result = await runScenario(scenario);
    scenario.verify(result);
    reports.push(result);
  }
  verifyGatePrecedenceInCompiledStateMachine();

  const report = {
    fixture_root: fixtureRoot,
    driver_path: driverPath,
    scenario_filter: scenarioFilter || null,
    scenarios: reports,
    result: 'passed',
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Session 9 regression passed. Report written to ${reportPath}`);
}

function verifyGatePrecedenceInCompiledStateMachine() {
  const stateMachine = require(path.join(extensionRoot, 'out', 'ui', 'sessionStateMachine.js'));
  const workflowDisplay = stateMachine.resolveWorkflowRowDisplay({
    workflow: {
      sessionGate: 'blocked',
    },
    result: {
      status: 'ready',
      session_gate: 'ready',
      inputs: {},
    },
    runnerState: 'idle',
  });
  assert.strictEqual(workflowDisplay.state, 'blocked', 'Blocked workflow summary must override stale ready inspect state.');

  const sessionDisplay = stateMachine.resolveSessionTimelineDisplay({
    file: {
      label: 'session-5-prompt.md',
      path: '/tmp/session-5-prompt.md',
    },
    workflow: {
      nextSession: 5,
      sessionGate: 'blocked',
    },
    result: {
      status: 'ready',
      session_gate: 'ready',
      next_session: '5',
      last_completed_session: '4',
      inputs: {},
    },
    runnerState: 'idle',
    isNextSession: true,
  });
  assert.strictEqual(sessionDisplay.state, 'blocked', 'Blocked workflow summary must override stale ready inspect state in the session timeline.');
}

async function runScenario(scenario) {
  cleanupFallbackRunnerDb(scenario.projectRoot);
  if (typeof scenario.setup === 'function') {
    scenario.setup(scenario.projectRoot);
  }
  const state = createScenarioState(scenario.projectRoot, scenario.configOverrides);
  let extensionModule;
  const context = { subscriptions: [] };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return state.mockVscode;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    purgeExtensionCache();
    extensionModule = require(path.join(extensionRoot, 'out', 'extension.js'));
    extensionModule.activate(context);
    assert(state.registeredWebviewProviders.includes('vibeCodingDashboardView'), 'Dashboard sidebar view provider should register during activation.');

    const executedActions = [];
    for (const action of scenario.actions) {
      if (typeof action === 'function') {
        executedActions.push(action.name || 'anonymous-action');
        await action({ projectRoot: scenario.projectRoot, state });
        continue;
      }

      if (action && typeof action === 'object' && typeof action.run === 'function') {
        executedActions.push(action.label || 'custom-action');
        await action.run({ projectRoot: scenario.projectRoot, state });
        continue;
      }

      const commandId = typeof action === 'string' ? action : action.id;
      const commandArgs = typeof action === 'string'
        ? []
        : (action.args || []).map((arg) => typeof arg === 'function' ? arg(scenario.projectRoot) : arg);
      const command = state.commandRegistry.get(commandId);
      assert(command, `Command not registered: ${commandId}`);
      executedActions.push(commandId);
      await command(...commandArgs);
    }

    const latestPanelHtml = state.getLatestPanelHtml();
    return {
      name: scenario.name,
      project_root: scenario.projectRoot,
      commands_executed: executedActions,
      infoMessages: state.infoMessages,
      warningMessages: state.warningMessages,
      errorMessages: state.errorMessages,
      terminalCommands: state.terminalCommands,
      openedDocuments: state.openedDocuments,
      settingsRequests: state.settingsRequests,
      registeredWebviewProviders: state.registeredWebviewProviders,
      statusBarTail: state.statusBarHistory.slice(-4),
      outputLines: state.outputLines.slice(-20),
      latestPanelHtml,
      dashboardHtml: renderDashboardHtml(state),
    };
  } finally {
    await disposeExtensionHost(extensionModule, context);
    Module._load = originalLoad;
    state.cleanup();
  }
}

function resolveFallbackRunnerDbPath(workspaceRoot) {
  return path.join(workspaceRoot, '.vibecoding', 'runner-state.sqlite');
}

async function disposeExtensionHost(extensionModule, context) {
  await Promise.resolve(extensionModule?.deactivate?.());
  for (const disposable of [...context.subscriptions].reverse()) {
    if (disposable && typeof disposable.dispose === 'function') {
      await Promise.resolve(disposable.dispose());
    }
  }
}

function cleanupFallbackRunnerDb(workspaceRoot) {
  const dbPath = resolveFallbackRunnerDbPath(workspaceRoot);
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(walPath, { force: true });
  fs.rmSync(shmPath, { force: true });
}

function readRunnerStateRow(dbPath, workspaceRoot, projectRoot) {
  const script = [
    'import json, sqlite3, sys',
    'conn = sqlite3.connect(sys.argv[1])',
    'row = conn.execute(',
    '    "SELECT runner_state, process_name, pid, started_at_epoch_ms FROM runner_process_state WHERE workspace_root = ? AND project_root = ?",',
    '    (sys.argv[2], sys.argv[3]),',
    ').fetchone()',
    'conn.close()',
    'print(json.dumps(None if row is None else {"runner_state": row[0], "process_name": row[1], "pid": row[2], "started_at_epoch_ms": row[3]}))',
  ].join('\n');

  return JSON.parse(execFileSync('python3', ['-c', script, dbPath, workspaceRoot, projectRoot], {
    encoding: 'utf8',
  }).trim());
}

function writeRunnerStateRow(workspaceRoot, projectRoot, record) {
  const dbPath = resolveFallbackRunnerDbPath(projectRoot);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const script = [
    'import sqlite3, sys',
    'conn = sqlite3.connect(sys.argv[1])',
    'conn.execute("""',
    'CREATE TABLE IF NOT EXISTS runner_process_state (',
    '    workspace_root TEXT NOT NULL,',
    '    project_root TEXT NOT NULL,',
    '    runner_state TEXT NOT NULL,',
    '    process_name TEXT,',
    '    pid INTEGER,',
    '    started_at_epoch_ms INTEGER,',
    '    updated_at_epoch_ms INTEGER NOT NULL,',
    '    PRIMARY KEY (workspace_root, project_root)',
    ')',
    '""")',
    'conn.execute(',
    '    "INSERT OR REPLACE INTO runner_process_state (workspace_root, project_root, runner_state, process_name, pid, started_at_epoch_ms, updated_at_epoch_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",',
    '    (sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] or None, int(sys.argv[6]) if sys.argv[6] else None, int(sys.argv[7]) if sys.argv[7] else None, int(sys.argv[8])),',
    ')',
    'conn.commit()',
    'conn.close()',
  ].join('\n');

  const updatedAt = Date.now();
  execFileSync('python3', [
    '-c',
    script,
    dbPath,
    workspaceRoot,
    projectRoot,
    record.runner_state,
    record.process_name ?? '',
    record.pid == null ? '' : String(record.pid),
    record.started_at_epoch_ms == null ? '' : String(record.started_at_epoch_ms),
    String(updatedAt),
  ], {
    stdio: 'pipe',
  });
}

function createScenarioState(projectRoot, configOverrides) {
  const outputLines = [];
  const infoMessages = [];
  const warningMessages = [];
  const errorMessages = [];
  const openedDocuments = [];
  const terminalCommands = [];
  const settingsRequests = [];
  const statusBarHistory = [];
  const registeredWebviewProviders = [];
  const webviewProviders = new Map();
  const commandRegistry = new Map();
  const spawnedTerminalProcesses = [];
  let latestPanelHtml = '';

  const configState = {
    'vibeCoding.pythonPath': 'python3',
    'vibeCoding.driverPath': driverPath,
    'vibeCoding.defaultProjectRoot': projectRoot,
    'vibeCoding.runnerCommandTemplate': baseRunnerCommandTemplate,
    ...configOverrides,
  };

  const mockVscode = {
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    ViewColumn: {
      One: 1,
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
      createWebviewPanel(_viewType, _title, _viewColumn, _options) {
        const disposeListeners = [];
        const panel = {
          webview: {
            html: '',
            options: undefined,
            onDidReceiveMessage() {
              return {
                dispose() {},
              };
            },
          },
          reveal() {},
          onDidDispose(listener) {
            disposeListeners.push(listener);
            return {
              dispose() {},
            };
          },
          dispose() {
            for (const listener of disposeListeners) {
              listener();
            }
          },
        };

        Object.defineProperty(panel.webview, 'html', {
          get() {
            return latestPanelHtml;
          },
          set(value) {
            latestPanelHtml = String(value);
          },
        });

        return panel;
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
        let processId;
        if (configOverrides.__mockTerminalShellMode === 'idle_shell') {
          const shellProcess = spawn('/bin/zsh', [], {
            cwd: options.cwd,
            stdio: ['pipe', 'ignore', 'ignore'],
          });
          spawnedTerminalProcesses.push(shellProcess);
          processId = Promise.resolve(shellProcess.pid);
        }
        return {
          name: options.name,
          processId,
          show() {},
          sendText(text) {
            terminalCommands.push({
              name: options.name,
              cwd: options.cwd,
              text,
            });
          },
          dispose() {
            if (processId && spawnedTerminalProcesses.length > 0) {
              const shellProcess = spawnedTerminalProcesses.shift();
              if (shellProcess && !shellProcess.killed) {
                shellProcess.kill('SIGTERM');
              }
            }
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
      registerWebviewViewProvider(viewId, provider) {
        registeredWebviewProviders.push(viewId);
        webviewProviders.set(viewId, provider);
        return {
          dispose() {
            webviewProviders.delete(viewId);
          },
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
    terminalCommands,
    openedDocuments,
    settingsRequests,
    statusBarHistory,
    registeredWebviewProviders,
    webviewProviders,
    commandRegistry,
    getLatestPanelHtml() {
      return latestPanelHtml;
    },
    cleanup() {
      for (const shellProcess of spawnedTerminalProcesses) {
        if (!shellProcess.killed) {
          shellProcess.kill('SIGTERM');
        }
      }
    },
  };
}

function renderDashboardHtml(state) {
  const provider = state.webviewProviders.get('vibeCodingDashboardView');
  assert(provider, 'Dashboard webview provider should be registered.');
  const webview = {
    options: undefined,
    html: '',
    onDidReceiveMessage() {
      return {
        dispose() {},
      };
    },
  };
  provider.resolveWebviewView({
    webview,
    visible: true,
    onDidChangeVisibility() {
      return {
        dispose() {},
      };
    },
  });
  return state.getLatestPanelHtml() || webview.html;
}

function extractSection(html, startMarker, endMarker) {
  const startIndex = html.indexOf(startMarker);
  assert(startIndex >= 0, `Missing section start marker: ${startMarker}`);
  const endIndex = html.indexOf(endMarker, startIndex);
  assert(endIndex >= 0, `Missing section end marker: ${endMarker}`);
  return html.slice(startIndex, endIndex);
}

function createMultiWorkflowProject() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-multi-workflow-'));
  const assetRoot = path.join(tempRoot, 'asset-ledger');
  const inspectionRoot = path.join(tempRoot, 'inspection');
  fs.cpSync(fixtureRoot, assetRoot, { recursive: true });
  fs.cpSync(fixtureRoot, inspectionRoot, { recursive: true });

  const inspectionMemoryPath = path.join(inspectionRoot, 'memory.md');
  const inspectionMemory = fs.readFileSync(inspectionMemoryPath, 'utf8')
    .replace('- session_gate: ready', '- session_gate: blocked')
    .replace('- workflow_status: ready', '- workflow_status: blocked');
  fs.writeFileSync(inspectionMemoryPath, inspectionMemory);

  return tempRoot;
}

function purgeExtensionCache() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(path.join(extensionRoot, 'out'))) {
      delete require.cache[cacheKey];
    }
  }
}

function createFixtureCopy(suffix, mutate) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vibe-session9-${suffix}-`));
  fs.cpSync(fixtureRoot, tempRoot, { recursive: true });
  mutate(tempRoot);
  return tempRoot;
}

function createFixtureCopyFrom(sourceRoot, suffix) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vibe-session9-${suffix}-`));
  fs.cpSync(sourceRoot, tempRoot, { recursive: true });
  return tempRoot;
}

function createInvalidJsonDriver() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-bad-driver-'));
  const driverFile = path.join(tempDir, 'bad-driver.py');
  fs.writeFileSync(
    driverFile,
    [
      '#!/usr/bin/env python3',
      'print("not-json")',
    ].join('\n')
  );
  fs.chmodSync(driverFile, 0o755);
  return driverFile;
}

function buildRunnerCommandTemplate(outputPath) {
  return [
    'python3 -c',
    `"from pathlib import Path; Path(r'${outputPath}').write_text('`,
    `{next_session}|{next_prompt}\\n`,
    `', encoding='utf-8')"`
  ].join(' ');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
