const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const Module = require('module');

const extensionRoot = path.resolve(__dirname, '..');
const skillRoot = path.resolve(extensionRoot, '..');
const fixtureRoot = path.join(skillRoot, 'fixtures', 'session8-smoke-project');
const driverPath = '/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/scripts/run-vibecoding-loop.py';
const artifactsDir = path.join(skillRoot, 'artifacts');
const reportPath = path.join(artifactsDir, 'session8-smoke-report.json');
const runnerSmokePath = path.join(fixtureRoot, 'outputs', 'session-logs', 'runner-smoke.txt');
const loopLogPath = path.join(fixtureRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl');
const runnerLogPath = path.join(fixtureRoot, '.vibecoding', 'runner.log');

const runnerCommandTemplate = [
  'python3 -c',
  `"from pathlib import Path; Path(r'${fixtureRoot}/outputs/session-logs/runner-smoke.txt').write_text('`,
  `{next_session}|{next_prompt}\\n`,
  `', encoding='utf-8')"`
].join(' ');

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

const configState = {
  'vibeCoding.pythonPath': 'python3',
  'vibeCoding.driverPath': driverPath,
  'vibeCoding.defaultProjectRoot': fixtureRoot,
  'vibeCoding.runnerCommandTemplate': runnerCommandTemplate,
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
          fsPath: fixtureRoot,
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

async function main() {
  const expectedHandoff = inspectExpectedHandoff();
  fs.mkdirSync(artifactsDir, { recursive: true });
  cleanupFallbackRunnerDb(fixtureRoot);
  if (fs.existsSync(runnerSmokePath)) {
    fs.unlinkSync(runnerSmokePath);
  }
  if (fs.existsSync(loopLogPath)) {
    fs.unlinkSync(loopLogPath);
  }
  if (fs.existsSync(runnerLogPath)) {
    fs.unlinkSync(runnerLogPath);
  }

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return mockVscode;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let extensionModule;
  const context = { subscriptions: [] };
  try {
    extensionModule = require(path.join(extensionRoot, 'out', 'extension.js'));
    extensionModule.activate(context);

    assert(registeredWebviewProviders.includes('vibeCodingDashboardView'), 'Dashboard sidebar view provider should register during activation.');

    await invoke('vibeCoding.refreshWorkflowStatus');
    await invoke('vibeCoding.prepareFreshSession');
    await invoke('vibeCoding.openMemory');
    await invoke('vibeCoding.openStartupPrompt');
    await invoke('vibeCoding.openNextSessionPrompt');
    await invoke('vibeCoding.openLoopLog');
    await invoke('vibeCoding.startRunnerInTerminal');

    assert(fs.existsSync(loopLogPath), 'Loop log should exist after inspect/prepare.');
    assert(openedDocuments.includes(path.join(fixtureRoot, 'memory.md')), 'Open Memory should open memory.md');
    assert(openedDocuments.includes(path.join(fixtureRoot, 'startup-prompt.md')), 'Open Startup Prompt should open startup-prompt.md');
    assert(openedDocuments.includes(expectedHandoff.nextSessionPromptPath), 'Open Next Session Prompt should open the driver-selected next session prompt.');
    assert(openedDocuments.includes(loopLogPath), 'Open Loop Log should open vibecoding-loop.jsonl');
    assert(terminalCommands.length === 1, 'Start Runner In Terminal should send exactly one command to the terminal');
    assert(terminalCommands[0].text.includes('stdin_tty=no; stdout_tty=no; stderr_tty=no'), 'Runner terminal command should capture TTY diagnostics before deciding the logging mode.');
    assert(terminalCommands[0].text.includes('if [ "$stdin_tty" = "yes" ] && [ "$stdout_tty" = "yes" ] && [ "$stderr_tty" = "yes" ]; then'), 'Runner terminal command should require stdin/stdout/stderr TTY availability for interactive runners.');
    assert(terminalCommands[0].text.includes('TERM="$runner_term" script -aqF "$RUNNER_LOG_PATH" /bin/bash -lc "$RUNNER_CMD" 2>>"$RUNNER_LOG_PATH"'), 'Runner terminal command should preserve a TTY via script when logging interactive runners.');
    assert(terminalCommands[0].text.includes('eval "$RUNNER_CMD" 2>&1 | tee -a "$RUNNER_LOG_PATH"'), 'Runner terminal command should keep a non-interactive tee fallback for smoke and regression execution.');

    execSync(terminalCommands[0].text, {
      cwd: fixtureRoot,
      stdio: 'pipe',
      shell: '/bin/bash',
    });

    assert(fs.existsSync(runnerLogPath), 'Runner log should exist after executing the terminal command.');
    assert(fs.existsSync(runnerSmokePath), 'Runner smoke file should exist after executing the terminal command.');
    const runnerSmokeContents = fs.readFileSync(runnerSmokePath, 'utf8').trim();
    assert(
      runnerSmokeContents === `${expectedHandoff.nextSession}|${expectedHandoff.nextSessionPrompt}`,
      'Runner smoke file should contain the expected next session handoff.'
    );
    const runnerLogContents = fs.readFileSync(runnerLogPath, 'utf8');
    assert(runnerLogContents.includes('Runner start'), 'Runner log should contain the standard start marker.');

    const loopLogLines = fs.readFileSync(loopLogPath, 'utf8').trim().split('\n').filter(Boolean);
    assert(loopLogLines.length >= 2, 'Loop log should contain at least inspect and prepare entries.');

    const report = {
      fixture_root: fixtureRoot,
      driver_path: driverPath,
      commands_executed: [
        'vibeCoding.refreshWorkflowStatus',
        'vibeCoding.prepareFreshSession',
        'vibeCoding.openMemory',
        'vibeCoding.openStartupPrompt',
        'vibeCoding.openNextSessionPrompt',
        'vibeCoding.openLoopLog',
        'vibeCoding.startRunnerInTerminal',
      ],
      opened_documents: openedDocuments,
      terminal_commands: terminalCommands,
      info_messages: infoMessages,
      warning_messages: warningMessages,
      error_messages: errorMessages,
      settings_requests: settingsRequests,
      registered_webview_providers: registeredWebviewProviders,
      status_bar_samples: statusBarHistory.slice(-6),
      runner_log_path: runnerLogPath,
      expected_next_session: expectedHandoff.nextSession,
      expected_next_prompt: expectedHandoff.nextSessionPrompt,
      runner_smoke_contents: runnerSmokeContents,
      loop_log_line_count: loopLogLines.length,
      loop_log_tail: loopLogLines.slice(-3).map((line) => JSON.parse(line)),
      result: 'passed',
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Session 8 smoke passed. Report written to ${reportPath}`);
  } finally {
    await disposeExtensionHost(extensionModule, context);
    Module._load = originalLoad;
  }
}

function inspectExpectedHandoff() {
  const output = execFileSync('python3', [driverPath, fixtureRoot, '--action', 'inspect', '--json'], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
  const payload = JSON.parse(output);
  assert(payload.status === 'ready', 'Fixture should be ready before smoke runs.');
  assert(payload.artifacts && payload.artifacts.next_session_prompt_path, 'Driver should return next_session_prompt_path.');
  return {
    nextSession: payload.next_session,
    nextSessionPrompt: payload.next_session_prompt,
    nextSessionPromptPath: payload.artifacts.next_session_prompt_path,
  };
}

function cleanupFallbackRunnerDb(workspaceRoot) {
  const dbPath = path.join(workspaceRoot, '.vibecoding', 'runner-state.sqlite');
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });
}

async function invoke(commandId) {
  const command = commandRegistry.get(commandId);
  assert(command, `Command not registered: ${commandId}`);
  await command();
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
