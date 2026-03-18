const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Module = require('module');

const extensionRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.resolve(extensionRoot, '..', 'fixtures', 'session8-smoke-project');

async function main() {
  await runScenario({ label: 'existing-thread', threadExists: true });
  await runScenario({ label: 'missing-thread', threadExists: false });
  console.log('Studio link smoke passed.');
}

async function runScenario({ label, threadExists }) {
  const projectRoot = createFixtureCopy(label);
  const expectedThreadId = computeThreadId(projectRoot);
  const historicalLocator = {
    source: 'loop_log',
    sessionNumber: 5,
    sessionPrompt: 'session-5-prompt.md',
    threadId: expectedThreadId,
    runId: `run-${label}`,
    checkpointId: `checkpoint-${label}`,
    parentCheckpointId: `parent-${label}`,
  };
  const server = await startMockLangGraphServer(expectedThreadId, threadExists);
  const serverUrl = `http://localhost:${server.address().port}`;
  const normalizedStudioBaseUrl = normalizeStudioBaseUrl(serverUrl);
  const state = createScenarioState(projectRoot, serverUrl);
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return state.mockVscode;
    }
    if (request === './driver/langgraphDriver' && parent && parent.filename.endsWith(path.join('out', 'extension.js'))) {
      const langgraphDriver = originalLoad.apply(this, arguments);
      return {
        ...langgraphDriver,
        getLangGraphDaemonInfo() {
          return {
            manager: 'unknown',
            lifecycle: 'offline',
            serverUrl,
            port: null,
            pid: null,
            pidSource: null,
            launchdPid: null,
            workdir: null,
            scriptPath: null,
            pidFilePath: null,
            stdoutLogPath: null,
            stderrLogPath: null,
            launchdStdoutLogPath: null,
            launchdStderrLogPath: null,
            launchdLabel: null,
            launchdPlistPath: null,
            launchdLoaded: false,
            autostartInstalled: false,
            startedAtEpochMs: null,
            summary: 'stubbed daemon info',
            source: 'fallback',
            errorMessage: null,
          };
        },
      };
    }
    if (request === 'child_process') {
      const childProcess = originalLoad.apply(this, arguments);
      return {
        ...childProcess,
        execFileSync(file, args, options) {
          if (file === 'bash' && Array.isArray(args) && args.includes('status-json')) {
            throw new Error('LangGraph daemon status probing disabled in studio smoke');
          }
          return childProcess.execFileSync(file, args, options);
        },
      };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    purgeExtensionCache();
    const extensionModule = require(path.join(extensionRoot, 'out', 'extension.js'));
    const context = { subscriptions: [] };
    await extensionModule.activate(context);

    await invoke(state, 'vibeCoding.openSessionStudio', projectRoot, 5, historicalLocator);

    assert.strictEqual(state.errorMessages.length, 0, JSON.stringify(state.errorMessages, null, 2));
    assert.strictEqual(state.openedExternalUrls.length, 1, JSON.stringify(state.openedExternalUrls, null, 2));

    const studioUrl = state.openedExternalUrls[0];
    assert(studioUrl.startsWith('https://smith.langchain.com/studio/thread?'), studioUrl);
    assert(studioUrl.includes(`baseUrl=${encodeURIComponent(normalizedStudioBaseUrl)}`), studioUrl);

    if (threadExists) {
      assert(studioUrl.includes(`threadId=${encodeURIComponent(expectedThreadId)}`), studioUrl);
      assert(
        !state.outputLines.some((line) => line.includes('Opening Studio without thread context')),
        `Did not expect no-thread-context log line. Got:\n${state.outputLines.join('\n')}`
      );
    } else {
      assert(!studioUrl.includes('threadId='), studioUrl);
      assert(
        state.outputLines.some((line) => line.includes(`Opening Studio without thread context because LangGraph thread was not found: ${expectedThreadId}`)),
        `Expected no-thread-context log line. Got:\n${state.outputLines.join('\n')}`
      );
    }

    assert(
      state.outputLines.some((line) => line.includes(`Historical studio locator: source=loop_log thread_id=${expectedThreadId} run_id=run-${label} checkpoint_id=checkpoint-${label}`)),
      `Expected historical locator log line. Got:\n${state.outputLines.join('\n')}`
    );
    assert(
      state.outputLines.some((line) => line.includes(`Studio target preserved in extension metadata: run_id=run-${label} checkpoint_id=checkpoint-${label} parent_checkpoint_id=parent-${label}`)),
      `Expected preserved metadata log line. Got:\n${state.outputLines.join('\n')}`
    );

    await disposeExtensionHost(extensionModule, context);
  } finally {
    Module._load = originalLoad;
    await stopServer(server);
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function createFixtureCopy(label) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vibecoding-studio-${label}-`));
  fs.cpSync(fixtureRoot, tempRoot, { recursive: true });
  return tempRoot;
}

function createScenarioState(projectRoot, serverUrl) {
  const configState = {
    'vibeCoding.defaultProjectRoot': projectRoot,
    'vibeCoding.langGraphServerUrl': serverUrl,
    'vibeCoding.langGraphStartScript': '',
    'vibeCoding.runnerCommandTemplate': 'codex --dangerously-skip-permissions',
  };

  const outputLines = [];
  const errorMessages = [];
  const openedExternalUrls = [];
  const commandRegistry = new Map();

  const mockVscode = {
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class ThemeColor {
      constructor(id) {
        this.id = id;
      }
    },
    Uri: {
      parse(value) {
        return {
          toString() {
            return String(value);
          },
        };
      },
    },
    env: {
      async openExternal(uri) {
        openedExternalUrls.push(String(uri.toString()));
        return true;
      },
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: projectRoot } }],
      getConfiguration(section) {
        return {
          get(key) {
            return configState[`${section}.${key}`];
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
          clear() {
            outputLines.length = 0;
          },
          show() {},
          dispose() {},
        };
      },
      createStatusBarItem() {
        return {
          text: '',
          tooltip: '',
          command: undefined,
          backgroundColor: undefined,
          name: '',
          show() {},
          dispose() {},
        };
      },
      registerWebviewViewProvider() {
        return {
          dispose() {},
        };
      },
      async showErrorMessage(message) {
        errorMessages.push({ message });
        return undefined;
      },
      async showInformationMessage() {
        return undefined;
      },
      async showWarningMessage() {
        return undefined;
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
      async executeCommand() {
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
    errorMessages,
    openedExternalUrls,
    commandRegistry,
  };
}

function startMockLangGraphServer(expectedThreadId, threadExists) {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method === 'GET' && requestUrl.pathname === '/ok') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === `/threads/${expectedThreadId}/state`) {
      if (threadExists) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ values: {}, metadata: { thread_id: expectedThreadId } }));
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ detail: `Thread with ID ${expectedThreadId} not found` }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ detail: 'not found' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function stopServer(server) {
  return new Promise((resolve, reject) => {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
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
  for (const disposable of [...context.subscriptions].reverse()) {
    if (disposable && typeof disposable.dispose === 'function') {
      await Promise.resolve(disposable.dispose());
    }
  }
}

function normalizeStudioBaseUrl(serverUrl) {
  const parsed = new URL(serverUrl);
  if (parsed.hostname === 'localhost') {
    parsed.hostname = '127.0.0.1';
  }
  return parsed.toString().replace(/\/$/, '');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function computeThreadId(projectRoot) {
  const taskPath = path.join(projectRoot, 'task.md');
  const taskIdentifier = resolveTaskIdentifier(taskPath, projectRoot);
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

function resolveTaskIdentifier(taskPath, projectRoot) {
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
