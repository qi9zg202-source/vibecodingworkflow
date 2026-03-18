/**
 * Session 13 smoke: server-offline / Python fallback path
 *
 * Validates that all extension commands degrade gracefully when the LangGraph
 * server is unreachable (port configured to a dead port 19999).
 *
 * Verified paths:
 *  1. refreshWorkflowStatus  → probe offline → falls back to Python driver → returns valid DriverResult
 *  2. activateWorkflowRunner → offline        → falls back to startRunnerInTerminal (terminal command emitted)
 *  3. approveSession         → offline        → falls back to approveSessionViaMemoryFallback (memory.md updated)
 *  4. rejectSession          → offline        → falls back to rejectSessionViaMemoryFallback  (memory.md updated)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const extensionRoot = path.resolve(__dirname, '..');
const integrationRoot = path.resolve(extensionRoot, '..');
const repoRoot = path.resolve(integrationRoot, '..', '..');
const baseFixtureRoot = path.join(integrationRoot, 'fixtures', 'session8-smoke-project');
const artifactsDir = path.join(integrationRoot, 'artifacts');
const reportPath = path.join(artifactsDir, 'session13-offline-fallback-report.json');
const mockRunnerPath = path.join(repoRoot, 'scripts', 'mock_langgraph_runner.py');
const pythonPath = path.join(repoRoot, '.venv', 'bin', 'python');

// Point to a dead port so the probe always fails without blocking for long.
const DEAD_SERVER_URL = 'http://127.0.0.1:19999';

const originalLoad = Module._load;

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });

  const refreshCase   = await runOfflineCase('refresh',  runRefreshCase);
  const startCase     = await runOfflineCase('start',    runStartCase);
  const approveCase   = await runOfflineCase('approve',  runApproveCase);
  const rejectCase    = await runOfflineCase('reject',   runRejectCase);

  const report = {
    dead_server_url: DEAD_SERVER_URL,
    generated_at: new Date().toISOString(),
    result: 'passed',
    cases: { refresh: refreshCase, start: startCase, approve: approveCase, reject: rejectCase },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Session 13 offline-fallback smoke passed. Report written to ${reportPath}`);
}

// ---------------------------------------------------------------------------
// Individual case runners
// ---------------------------------------------------------------------------

async function runRefreshCase(state) {
  await invoke(state, 'vibeCoding.selectWorkflow', state.projectRoot);
  await invoke(state, 'vibeCoding.refreshWorkflowStatus');

  // Probe should report offline.
  assert(
    state.outputLines.some((l) => String(l).includes('offline')),
    `Expected "offline" in output. Got:\n${state.outputLines.slice(-10).join('\n')}`
  );
  // Python fallback should have been used.
  assert(
    state.outputLines.some((l) => String(l).includes('Falling back to Python driver')),
    'Expected "Falling back to Python driver" in output'
  );
  // Result should still be valid.
  assert(
    state.outputLines.some((l) => String(l).includes('workflow_status=')),
    'Expected workflow_status= in output'
  );
  assert.strictEqual(state.errorMessages.length, 0, JSON.stringify(state.errorMessages));

  return { output_tail: state.outputLines.slice(-15) };
}

async function runStartCase(state) {
  await invoke(state, 'vibeCoding.selectWorkflow', state.projectRoot);
  await invoke(state, 'vibeCoding.activateWorkflowRunner', state.projectRoot);

  // Offline + no LangGraph run → falls back to startRunnerInTerminal → terminal command emitted.
  assert(
    state.terminalCommands.length > 0,
    'Expected at least one terminal command for the offline start path'
  );
  assert.strictEqual(state.errorMessages.length, 0, JSON.stringify(state.errorMessages));

  return { terminal_commands: state.terminalCommands };
}

async function runApproveCase(state) {
  await invoke(state, 'vibeCoding.selectWorkflow', state.projectRoot);
  await invoke(state, 'vibeCoding.approveSession', state.projectRoot);

  // Fallback: memory.md should be updated to session_gate: ready.
  const memoryText = fs.readFileSync(path.join(state.projectRoot, 'memory.md'), 'utf8');
  assert(memoryText.includes('- session_gate: ready'), `Expected session_gate: ready in memory.md. Got:\n${memoryText.slice(0, 300)}`);

  // Info message for legacy fallback approve.
  assert(
    state.infoMessages.some((e) => e.message.includes('已批准') && e.message.includes('memory.md')),
    `Expected approve fallback info message. Got: ${JSON.stringify(state.infoMessages)}`
  );
  // Probe offline log.
  assert(
    state.outputLines.some((l) => String(l).includes('offline')),
    'Expected offline probe log'
  );
  assert.strictEqual(state.errorMessages.length, 0, JSON.stringify(state.errorMessages));

  return {
    memory_gate: memoryText.match(/- session_gate:\s*(\S+)/)?.[1] ?? null,
    info_messages: state.infoMessages,
  };
}

async function runRejectCase(state) {
  await invoke(state, 'vibeCoding.selectWorkflow', state.projectRoot);
  await invoke(state, 'vibeCoding.rejectSession', state.projectRoot);

  // Fallback: memory.md should be updated to session_gate: blocked + review_notes.
  const memoryText = fs.readFileSync(path.join(state.projectRoot, 'memory.md'), 'utf8');
  assert(memoryText.includes('- session_gate: blocked'), `Expected session_gate: blocked in memory.md`);
  assert(memoryText.includes('offline reject test'), `Expected rejection reason in memory.md`);

  // Warning message for legacy fallback reject.
  assert(
    state.warningMessages.some((e) => e.message.includes('已驳回') && e.message.includes('memory.md')),
    `Expected reject fallback warning message. Got: ${JSON.stringify(state.warningMessages)}`
  );
  assert.strictEqual(state.errorMessages.length, 0, JSON.stringify(state.errorMessages));

  return {
    memory_gate: memoryText.match(/- session_gate:\s*(\S+)/)?.[1] ?? null,
    memory_review_notes: memoryText.match(/- review_notes:\s*(.+)/)?.[1]?.trim() ?? null,
    warning_messages: state.warningMessages,
  };
}

// ---------------------------------------------------------------------------
// Orchestration helpers
// ---------------------------------------------------------------------------

async function runOfflineCase(label, runner) {
  const projectRoot = createFixtureCopy(label);
  // Use 'offline reject test' as the pre-loaded input response for rejectSession's showInputBox.
  const inputResponses = label === 'reject' ? ['offline reject test'] : [];
  const state = createScenarioState(projectRoot, inputResponses);
  let extensionModule;

  Module._load = patchVscode(state);
  try {
    purgeExtensionCache();
    extensionModule = require(path.join(extensionRoot, 'out', 'extension.js'));
    extensionModule.activate({ subscriptions: [] });
    const result = await runner(state);
    return { project_root: projectRoot, ...result };
  } finally {
    await disposeExtensionHost(extensionModule, { subscriptions: [] });
    Module._load = originalLoad;
    cleanupFixtureCopy(projectRoot);
  }
}

function patchVscode(state) {
  return function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') return state.mockVscode;
    return originalLoad.call(this, request, parent, isMain);
  };
}

function createFixtureCopy(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vibe-session13-offline-${label}-`));
  const projectRoot = path.join(root, 'session8-smoke-project');
  fs.cpSync(baseFixtureRoot, projectRoot, { recursive: true });
  retargetFixturePaths(projectRoot);
  return projectRoot;
}

function retargetFixturePaths(projectRoot) {
  for (const filePath of listMarkdownFiles(projectRoot)) {
    const content = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(filePath, content.replace(new RegExp(escapeRegExp(baseFixtureRoot), 'g'), projectRoot));
  }
}

function listMarkdownFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...listMarkdownFiles(full));
    else if (entry.name.endsWith('.md')) result.push(full);
  }
  return result;
}

function cleanupFixtureCopy(projectRoot) {
  const root = path.dirname(projectRoot);
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
}

function createScenarioState(projectRoot, inputResponses) {
  const outputLines = [];
  const infoMessages = [];
  const warningMessages = [];
  const errorMessages = [];
  const terminalCommands = [];
  const commandRegistry = new Map();
  const pendingInputResponses = [...inputResponses];

  const runnerCommandTemplate = [
    shellQuote(pythonPath),
    shellQuote(mockRunnerPath),
    '--project-root', '{project_root}',
    '--next-session', '{next_session}',
    '--next-prompt', '{next_prompt}',
    '--final-session', '6',
  ].join(' ');

  const configState = {
    'vibeCoding.pythonPath': pythonPath,
    'vibeCoding.driverPath': path.join(repoRoot, 'scripts', 'run-vibecoding-loop.py'),
    'vibeCoding.defaultProjectRoot': projectRoot,
    'vibeCoding.runnerCommandTemplate': runnerCommandTemplate,
    // Dead port — probe will always fail.
    'vibeCoding.langGraphServerUrl': DEAD_SERVER_URL,
  };

  const mockVscode = {
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: projectRoot } }],
      getConfiguration(section) {
        return { get(key) { return configState[`${section}.${key}`]; } };
      },
      async openTextDocument(filePath) {
        return {
          fileName: filePath,
          uri: { fsPath: filePath },
          getText() { return fs.readFileSync(filePath, 'utf8'); },
        };
      },
    },
    window: {
      createOutputChannel() {
        return {
          append(v) { outputLines.push(String(v)); },
          appendLine(v) { outputLines.push(String(v)); },
          show() {},
          clear() { outputLines.length = 0; },
          dispose() {},
        };
      },
      createStatusBarItem() {
        const item = { text: '', tooltip: '', command: undefined, backgroundColor: undefined, name: '', show() {}, dispose() {} };
        return item;
      },
      createTerminal(options) {
        return {
          name: options.name,
          show() {},
          sendText(text) { terminalCommands.push({ name: options.name, cwd: options.cwd, text }); },
          dispose() {},
        };
      },
      async showTextDocument(doc) { return doc; },
      async showInformationMessage(message, ...items) { infoMessages.push({ message, items }); return undefined; },
      async showWarningMessage(message, ...items) { warningMessages.push({ message, items }); return undefined; },
      async showErrorMessage(message, ...items) { errorMessages.push({ message, items }); return undefined; },
      async showInputBox() { return pendingInputResponses.length > 0 ? pendingInputResponses.shift() : undefined; },
      registerWebviewViewProvider(viewId) { return { dispose() {} }; },
    },
    commands: {
      registerCommand(id, callback) {
        commandRegistry.set(id, callback);
        return { dispose() { commandRegistry.delete(id); } };
      },
      async executeCommand() { return undefined; },
    },
    MarkdownString: class MarkdownString {
      constructor(value = '') { this.value = value; this.isTrusted = false; }
      appendMarkdown(v) { this.value += String(v); }
      toString() { return this.value; }
    },
  };

  return {
    projectRoot,
    mockVscode,
    outputLines,
    infoMessages,
    warningMessages,
    errorMessages,
    terminalCommands,
    commandRegistry,
  };
}

async function invoke(state, commandId, ...args) {
  const command = state.commandRegistry.get(commandId);
  assert(command, `Command not registered: ${commandId}`);
  await command(...args);
}

function purgeExtensionCache() {
  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(path.join(extensionRoot, 'out'))) {
      delete require.cache[modulePath];
    }
  }
}

async function disposeExtensionHost(extensionModule, context) {
  await Promise.resolve(extensionModule?.deactivate?.());
  const subs = Array.isArray(context.subscriptions) ? context.subscriptions : [];
  for (const disposable of [...subs].reverse()) {
    if (disposable && typeof disposable.dispose === 'function') {
      await Promise.resolve(disposable.dispose());
    }
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Swallow unhandled rejections that arise from dispose-after-activate async
// tasks (e.g. activation probe → Python fallback) — these are benign in the
// offline smoke context where all cases have already been asserted.
process.on('unhandledRejection', (reason) => {
  // Only suppress DriverIntegrationError from background activation paths.
  // Any other unexpected rejection is re-thrown to avoid hiding real failures.
  if (reason && typeof reason === 'object' && reason.constructor?.name === 'DriverIntegrationError') {
    return;
  }
  console.error('Unexpected unhandled rejection:', reason);
  process.exitCode = 1;
});

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
