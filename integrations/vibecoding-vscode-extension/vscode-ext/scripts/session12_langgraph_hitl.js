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
const reportPath = path.join(artifactsDir, 'session12-langgraph-hitl-report.json');
const mockRunnerPath = path.join(repoRoot, 'scripts', 'mock_langgraph_runner.py');
const pythonPath = path.join(repoRoot, '.venv', 'bin', 'python');
const langGraphBaseUrl = process.env.LANGGRAPH_BASE_URL || 'http://127.0.0.1:2024';
const originalLoad = Module._load;

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });
  await assertLangGraphServerOnline();

  const approve = await runCase({
    name: 'approve',
    rejectionReason: null,
  });
  const reject = await runCase({
    name: 'reject',
    rejectionReason: 'need more tests',
  });

  const report = {
    langgraph_base_url: langGraphBaseUrl,
    generated_at: new Date().toISOString(),
    result: 'passed',
    cases: {
      approve,
      reject,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Session 12 LangGraph HITL smoke passed. Report written to ${reportPath}`);
}

async function runCase({ name, rejectionReason }) {
  const projectRoot = createFixtureCopy(name);
  const state = createScenarioState(projectRoot, rejectionReason ? [rejectionReason] : []);
  const context = { subscriptions: [] };
  let extensionModule;

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

    await invoke(state, 'vibeCoding.selectWorkflow', projectRoot);
    await invoke(state, 'vibeCoding.refreshWorkflowStatus');

    const readyOutputIndex = state.outputLines.length;
    await invoke(state, 'vibeCoding.activateWorkflowRunner', projectRoot);

    const threadId = buildThreadId(projectRoot, resolveTaskIdentifier(projectRoot));
    const interruptedState = await waitForThreadState(threadId, hasInterruptTask);

    await invoke(state, 'vibeCoding.refreshWorkflowStatus');
    const interruptRefreshOutput = state.outputLines.slice(readyOutputIndex);
    assert(interruptRefreshOutput.some((line) => String(line).includes('next_action=review_session: Approve or reject the interrupted LangGraph run.')), interruptRefreshOutput);

    if (name === 'approve') {
      await invoke(state, 'vibeCoding.approveSession', projectRoot);
    } else {
      await invoke(state, 'vibeCoding.rejectSession', projectRoot);
    }

    const finalState = await waitForThreadState(threadId, (payload) => !hasInterruptTask(payload));
    await invoke(state, 'vibeCoding.refreshWorkflowStatus');

    const memoryText = fs.readFileSync(path.join(projectRoot, 'memory.md'), 'utf8');
    const finalValues = finalState.values || {};
    const loopLogEntry = readLatestLoopLogEntry(projectRoot);

    if (name === 'approve') {
      assert(finalValues.session_gate === 'ready', finalValues);
      assert(finalValues.next_session === '6', finalValues);
      assert(finalValues.last_completed_session === '5', finalValues);
      assert(finalValues.approval_decision === 'approve', finalValues);
      assert(!Object.prototype.hasOwnProperty.call(finalValues, 'review_notes') || finalValues.review_notes == null, finalValues);
      assert(memoryText.includes('- last_completed_session: 5'), memoryText);
      assert(memoryText.includes('- next_session: 6'), memoryText);
      assert(memoryText.includes('- session_gate: ready'), memoryText);
      assert(!memoryText.includes('- review_notes:'), memoryText);
      assert(state.infoMessages.some((entry) => entry.message.includes('Session 批准请求已发送到 LangGraph')), state.infoMessages);
    } else {
      assert(finalValues.session_gate === 'blocked', finalValues);
      assert(finalValues.next_session === '5', finalValues);
      assert(finalValues.last_completed_session === '4', finalValues);
      assert(finalValues.approval_decision === 'reject', finalValues);
      assert(finalValues.rejection_reason === rejectionReason, finalValues);
      assert(finalValues.review_notes === rejectionReason, finalValues);
      assert(memoryText.includes('- last_completed_session: 4'), memoryText);
      assert(memoryText.includes('- next_session: 5'), memoryText);
      assert(memoryText.includes('- session_gate: blocked'), memoryText);
      assert(memoryText.includes(`- review_notes: ${rejectionReason}`), memoryText);
      assert(state.infoMessages.some((entry) => entry.message.includes('Session 驳回请求已发送到 LangGraph')), state.infoMessages);
    }

    assert.strictEqual(state.errorMessages.length, 0, JSON.stringify(state.errorMessages, null, 2));
    if (loopLogEntry) {
      assert.strictEqual(loopLogEntry.thread_id, threadId, loopLogEntry);
      assert.strictEqual(loopLogEntry.session_number, 5, loopLogEntry);
      assert.strictEqual(loopLogEntry.session_prompt, 'session-5-prompt.md', loopLogEntry);
      assert.ok(loopLogEntry.run_id, loopLogEntry);
    }

    return {
      project_root: projectRoot,
      thread_id: threadId,
      interrupted_next: interruptedState.next,
      final_next: finalState.next,
      final_values: {
        session_gate: finalValues.session_gate,
        next_session: finalValues.next_session,
        last_completed_session: finalValues.last_completed_session,
        approval_decision: finalValues.approval_decision,
        rejection_reason: finalValues.rejection_reason || null,
        review_notes: finalValues.review_notes || null,
      },
      latest_loop_log_entry: loopLogEntry,
      info_messages: state.infoMessages,
      warning_messages: state.warningMessages,
      output_tail: state.outputLines.slice(-40),
      memory_excerpt: memoryText.split(/\r?\n/).slice(0, 14),
    };
  } finally {
    await disposeExtensionHost(extensionModule, context);
    Module._load = originalLoad;
    cleanupFixtureCopy(projectRoot);
  }
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

function createFixtureCopy(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vibe-session12-${label}-`));
  const projectRoot = path.join(root, 'session8-smoke-project');
  fs.cpSync(baseFixtureRoot, projectRoot, { recursive: true });
  retargetFixturePaths(projectRoot);
  resetRuntimeArtifacts(projectRoot);
  return projectRoot;
}

function resetRuntimeArtifacts(projectRoot) {
  const loopLog = path.join(projectRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl');
  if (fs.existsSync(loopLog)) {
    fs.unlinkSync(loopLog);
  }

  for (const sessionNum of ['5', '6']) {
    for (const suffix of ['summary.md', 'manifest.json']) {
      const artifactPath = path.join(projectRoot, 'artifacts', `session-${sessionNum}-${suffix}`);
      if (fs.existsSync(artifactPath)) {
        fs.unlinkSync(artifactPath);
      }
    }
  }
}

function retargetFixturePaths(projectRoot) {
  for (const filePath of listMarkdownFiles(projectRoot)) {
    const content = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(filePath, content.replace(new RegExp(escapeRegExp(baseFixtureRoot), 'g'), projectRoot));
  }
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

function cleanupFixtureCopy(projectRoot) {
  const root = path.dirname(projectRoot);
  if (fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
    '--project-root',
    '{project_root}',
    '--next-session',
    '{next_session}',
    '--next-prompt',
    '{next_prompt}',
    '--final-session',
    '6',
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
    ThemeColor: class ThemeColor {
      constructor(id) {
        this.id = id;
      }
    },
    workspace: {
      workspaceFolders: [
        {
          uri: { fsPath: projectRoot },
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
        return {
          fileName: filePath,
          uri: { fsPath: filePath },
          getText() {
            return fs.readFileSync(filePath, 'utf8');
          },
        };
      },
    },
    window: {
      createOutputChannel() {
        return {
          append(value) {
            outputLines.push(String(value));
          },
          appendLine(value) {
            outputLines.push(String(value));
          },
          show() {},
          clear() {
            outputLines.length = 0;
          },
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
          dispose() {},
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
      async showInputBox() {
        return pendingInputResponses.length > 0 ? pendingInputResponses.shift() : undefined;
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
        resolve(responseBody ? JSON.parse(responseBody) : {});
      });
    });
    request.on('error', reject);
    if (body) {
      request.write(body);
    }
    request.end();
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
  for (const disposable of [...context.subscriptions].reverse()) {
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
