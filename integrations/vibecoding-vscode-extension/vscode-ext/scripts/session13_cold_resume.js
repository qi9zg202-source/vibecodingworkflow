/**
 * Session 13 smoke: cold-start resume path
 *
 * Validates that approve/reject work correctly when the extension "cold-starts"
 * into a thread that is already in an interrupted (review-wait) state, i.e.
 * the extension has never called activateWorkflowRunner in this session.
 *
 * Scenario:
 *  1. Start a LangGraph run normally so the thread reaches an interrupt.
 *  2. Simulate extension cold-start: purge cache, re-activate extension.
 *  3. Do NOT call activateWorkflowRunner.
 *  4. Call refreshWorkflowStatus → assert next_action=review_session.
 *  5. Call approveSession → assert final state is ready / next_session advanced.
 *
 * Also verifies the reject cold-start path in a second case.
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Module = require('module');

const extensionRoot = path.resolve(__dirname, '..');
const integrationRoot = path.resolve(extensionRoot, '..');
const repoRoot = path.resolve(integrationRoot, '..', '..');
const baseFixtureRoot = path.join(integrationRoot, 'fixtures', 'session8-smoke-project');
const artifactsDir = path.join(integrationRoot, 'artifacts');
const reportPath = path.join(artifactsDir, 'session13-cold-resume-report.json');
const mockRunnerPath = path.join(repoRoot, 'scripts', 'mock_langgraph_runner.py');
const pythonPath = path.join(repoRoot, '.venv', 'bin', 'python');
const langGraphBaseUrl = process.env.LANGGRAPH_BASE_URL || 'http://127.0.0.1:2024';
const originalLoad = Module._load;

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });
  await assertLangGraphServerOnline();

  const approveCase = await runColdResumeCase({ name: 'cold_approve', decision: 'approve', rejectionReason: null });
  const rejectCase = await runColdResumeCase({ name: 'cold_reject', decision: 'reject', rejectionReason: 'cold-start reject test' });
  const staleInvalidCacheCase = await runStaleInvalidCacheCase();

  const report = {
    langgraph_base_url: langGraphBaseUrl,
    generated_at: new Date().toISOString(),
    result: 'passed',
    cases: {
      cold_approve: approveCase,
      cold_reject: rejectCase,
      stale_invalid_cache: staleInvalidCacheCase,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Session 13 cold-start resume smoke passed. Report written to ${reportPath}`);
}

/**
 * Full cold-start resume scenario for one decision branch.
 */
async function runColdResumeCase({ name, decision, rejectionReason }) {
  const projectRoot = createFixtureCopy(name);
  const threadId = buildThreadId(projectRoot, resolveTaskIdentifier(projectRoot));

  // --- Phase 1: Warm-start — only used to put the thread into interrupted state ---
  const warmState = createScenarioState(projectRoot, []);
  let warmExtension;
  Module._load = patchVscode(warmState);
  try {
    purgeExtensionCache();
    warmExtension = require(path.join(extensionRoot, 'out', 'extension.js'));
    warmExtension.activate({ subscriptions: [] });

    await invoke(warmState, 'vibeCoding.selectWorkflow', projectRoot);
    // Start a run and wait for interrupt — this is NOT the cold-start path under test.
    await invoke(warmState, 'vibeCoding.activateWorkflowRunner', projectRoot);
    await waitForThreadState(threadId, hasInterruptTask);
  } finally {
    await disposeExtensionHost(warmExtension, { subscriptions: warmState.commandRegistry });
    Module._load = originalLoad;
  }

  // --- Phase 2: Cold-start — fresh extension host, latestInspectResult is undefined ---
  const coldState = createScenarioState(projectRoot, rejectionReason ? [rejectionReason] : []);
  let coldExtension;
  Module._load = patchVscode(coldState);
  try {
    purgeExtensionCache();
    coldExtension = require(path.join(extensionRoot, 'out', 'extension.js'));
    coldExtension.activate({ subscriptions: [] });

    // First action after cold-start: refresh (no activateWorkflowRunner).
    await invoke(coldState, 'vibeCoding.selectWorkflow', projectRoot);
    await invoke(coldState, 'vibeCoding.refreshWorkflowStatus');

    // Assert that refresh correctly detects the interrupted state.
    assert(
      coldState.outputLines.some((line) => String(line).includes('next_action=review_session')),
      `Expected next_action=review_session in output after cold-start refresh. Got:\n${coldState.outputLines.slice(-20).join('\n')}`
    );

    // Approve or reject without having called activateWorkflowRunner.
    if (decision === 'approve') {
      await invoke(coldState, 'vibeCoding.approveSession', projectRoot);
    } else {
      await invoke(coldState, 'vibeCoding.rejectSession', projectRoot);
    }

    // Wait for the thread to leave the interrupted state.
    const finalState = await waitForThreadState(threadId, (payload) => !hasInterruptTask(payload));
    await invoke(coldState, 'vibeCoding.refreshWorkflowStatus');

    const finalValues = finalState.values || {};
    const memoryText = fs.readFileSync(path.join(projectRoot, 'memory.md'), 'utf8');
    const loopLogEntry = readLatestLoopLogEntry(projectRoot);

    if (decision === 'approve') {
      assert.strictEqual(finalValues.session_gate, 'ready', `approve: expected session_gate=ready, got ${finalValues.session_gate}`);
      assert.strictEqual(finalValues.next_session, '6', `approve: expected next_session=6, got ${finalValues.next_session}`);
      assert.strictEqual(finalValues.last_completed_session, '5', `approve: expected last_completed_session=5, got ${finalValues.last_completed_session}`);
      assert(memoryText.includes('- session_gate: ready'), 'approve: memory should contain session_gate: ready');
      assert(coldState.infoMessages.some((e) => e.message.includes('批准请求已发送到 LangGraph')), 'approve: expected info message');
    } else {
      assert.strictEqual(finalValues.session_gate, 'blocked', `reject: expected session_gate=blocked, got ${finalValues.session_gate}`);
      assert.strictEqual(finalValues.next_session, '5', `reject: expected next_session=5, got ${finalValues.next_session}`);
      assert.strictEqual(finalValues.last_completed_session, '4', `reject: expected last_completed_session=4, got ${finalValues.last_completed_session}`);
      assert(memoryText.includes('- session_gate: blocked'), 'reject: memory should contain session_gate: blocked');
      assert(coldState.infoMessages.some((e) => e.message.includes('驳回请求已发送到 LangGraph')), 'reject: expected info message');
    }

    assert.strictEqual(coldState.errorMessages.length, 0, `Unexpected errors:\n${JSON.stringify(coldState.errorMessages, null, 2)}`);
    if (loopLogEntry) {
      assert.strictEqual(loopLogEntry.thread_id, threadId, loopLogEntry);
      assert.strictEqual(loopLogEntry.session_number, 5, loopLogEntry);
      assert.strictEqual(loopLogEntry.session_prompt, 'session-5-prompt.md', loopLogEntry);
      assert.ok(loopLogEntry.run_id, loopLogEntry);
    }

    return {
      project_root: projectRoot,
      thread_id: threadId,
      decision,
      final_values: {
        session_gate: finalValues.session_gate,
        next_session: finalValues.next_session,
        last_completed_session: finalValues.last_completed_session,
        approval_decision: finalValues.approval_decision,
        rejection_reason: finalValues.rejection_reason || null,
      },
      latest_loop_log_entry: loopLogEntry,
      output_tail: coldState.outputLines.slice(-30),
      info_messages: coldState.infoMessages,
    };
  } finally {
    await disposeExtensionHost(coldExtension, { subscriptions: coldState.commandRegistry });
    Module._load = originalLoad;
    cleanupFixtureCopy(projectRoot);
  }
}

async function runStaleInvalidCacheCase() {
  const projectRoot = createFixtureCopy('stale-invalid-cache');
  const threadId = buildThreadId(projectRoot, resolveTaskIdentifier(projectRoot));
  const state = createScenarioState(projectRoot, []);
  let extensionModule;

  Module._load = patchVscode(state);
  try {
    purgeExtensionCache();
    extensionModule = require(path.join(extensionRoot, 'out', 'extension.js'));
    extensionModule.activate({ subscriptions: [] });

    await invoke(state, 'vibeCoding.selectWorkflow', projectRoot);
    rewriteSessionGate(projectRoot, 'invalid_gate');
    await invoke(state, 'vibeCoding.refreshWorkflowStatus');

    const invalidErrorCount = state.errorMessages.length;
    rewriteSessionGate(projectRoot, 'ready');

    await invoke(state, 'vibeCoding.activateWorkflowRunner', projectRoot);
    const interruptedState = await waitForThreadState(threadId, hasInterruptTask);
    await invoke(state, 'vibeCoding.refreshWorkflowStatus');

    assert.strictEqual(
      state.errorMessages.length,
      invalidErrorCount,
      `Expected no new errors after starting from refreshed ready state. Errors:\n${JSON.stringify(state.errorMessages, null, 2)}`
    );
    assert(
      state.outputLines.some((line) => String(line).includes('next_action=review_session')),
      `Expected interrupted review action after start. Got:\n${state.outputLines.slice(-20).join('\n')}`
    );

    return {
      project_root: projectRoot,
      thread_id: threadId,
      invalid_error_count: invalidErrorCount,
      final_values: interruptedState.values || {},
      output_tail: state.outputLines.slice(-30),
      error_messages: state.errorMessages,
    };
  } finally {
    await disposeExtensionHost(extensionModule, { subscriptions: state.commandRegistry });
    Module._load = originalLoad;
    cleanupFixtureCopy(projectRoot);
  }
}

// ---------------------------------------------------------------------------
// Helpers (shared with session12 script, kept local to avoid cross-file dep)
// ---------------------------------------------------------------------------

function patchVscode(state) {
  return function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return state.mockVscode;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}

function createFixtureCopy(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vibe-session13-${label}-`));
  const projectRoot = path.join(root, 'session8-smoke-project');
  fs.cpSync(baseFixtureRoot, projectRoot, { recursive: true });
  retargetFixturePaths(projectRoot);
  resetRuntimeArtifacts(projectRoot);
  return projectRoot;
}

function resetRuntimeArtifacts(projectRoot) {
  const loopLog = path.join(projectRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl');
  if (fs.existsSync(loopLog)) fs.unlinkSync(loopLog);

  for (const sessionNum of ['5', '6']) {
    for (const suffix of ['summary.md', 'manifest.json']) {
      const artifactPath = path.join(projectRoot, 'artifacts', `session-${sessionNum}-${suffix}`);
      if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);
    }
  }
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

function readLatestLoopLogEntry(projectRoot) {
  const loopLogPath = path.join(projectRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl');
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

function rewriteSessionGate(projectRoot, gate) {
  const memoryPath = path.join(projectRoot, 'memory.md');
  const content = fs.readFileSync(memoryPath, 'utf8');
  fs.writeFileSync(memoryPath, content.replace(/^(- session_gate:\s*).*$/m, `$1${gate}`));
}

function createScenarioState(projectRoot, inputResponses) {
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
    'vibeCoding.pythonPath': 'python3',
    'vibeCoding.driverPath': path.join(repoRoot, 'scripts', 'run-vibecoding-loop.py'),
    'vibeCoding.defaultProjectRoot': projectRoot,
    'vibeCoding.runnerCommandTemplate': runnerCommandTemplate,
    'vibeCoding.langGraphServerUrl': langGraphBaseUrl,
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
        const item = {
          text: '', tooltip: '', command: undefined, backgroundColor: undefined, name: '',
          show() {
            statusBarHistory.push({
              text: item.text,
              tooltip: String(item.tooltip),
              command: item.command,
              backgroundColor: item.backgroundColor?.id ?? null,
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
          sendText(text) { terminalCommands.push({ name: options.name, cwd: options.cwd, text }); },
          dispose() {},
        };
      },
      async showTextDocument(doc) { openedDocuments.push(doc.uri.fsPath); return doc; },
      async showInformationMessage(message, ...items) { infoMessages.push({ message, items }); return undefined; },
      async showWarningMessage(message, ...items) { warningMessages.push({ message, items }); return undefined; },
      async showErrorMessage(message, ...items) { errorMessages.push({ message, items }); return undefined; },
      async showInputBox() { return pendingInputResponses.length > 0 ? pendingInputResponses.shift() : undefined; },
      registerWebviewViewProvider(viewId) {
        registeredWebviewProviders.push(viewId);
        return { dispose() {} };
      },
    },
    commands: {
      registerCommand(id, callback) {
        commandRegistry.set(id, callback);
        return { dispose() { commandRegistry.delete(id); } };
      },
      async executeCommand(id, ...args) { settingsRequests.push({ id, args }); return undefined; },
    },
    MarkdownString: class MarkdownString {
      constructor(value = '') { this.value = value; this.isTrusted = false; }
      appendMarkdown(v) { this.value += String(v); }
      toString() { return this.value; }
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

function buildThreadId(projectRoot, taskIdentifier) {
  const digest = crypto.createHash('sha1').update(`${projectRoot}:${taskIdentifier}`).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function resolveTaskIdentifier(projectRoot) {
  const taskPath = path.join(projectRoot, 'task.md');
  if (!fs.existsSync(taskPath)) return path.basename(projectRoot);
  const lines = fs.readFileSync(taskPath, 'utf8').split(/\r?\n/);
  let inTitle = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '## Title') { inTitle = true; continue; }
    if (inTitle && line.startsWith('## ')) break;
    if (inTitle && line) return line.replace(/^-+\s*/, '').trim();
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
    if (predicate(payload)) return payload;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for thread state. thread_id=${threadId} last=${JSON.stringify(lastPayload)}`);
}

function hasInterruptTask(payload) {
  return Array.isArray(payload.tasks) && payload.tasks.some((t) => Array.isArray(t?.interrupts) && t.interrupts.length > 0);
}

function requestJson(method, targetPath, payload) {
  const url = new URL(targetPath, langGraphBaseUrl.endsWith('/') ? langGraphBaseUrl : `${langGraphBaseUrl}/`);
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const req = http.request(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : undefined,
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if ((res.statusCode || 500) >= 400) { reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`)); return; }
        resolve(responseBody ? JSON.parse(responseBody) : {});
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function invoke(state, commandId, ...args) {
  const command = state.commandRegistry.get(commandId);
  assert(command, `Command not registered: ${commandId}`);
  state.executedCommands.push({ id: commandId, args });
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
  const subs = Array.isArray(context.subscriptions)
    ? context.subscriptions
    : [...(context.subscriptions?.values?.() ?? [])];
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
