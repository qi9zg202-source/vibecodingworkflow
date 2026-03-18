const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const extensionRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.resolve(extensionRoot, '..', 'fixtures', 'session8-smoke-project');
const originalLoad = Module._load;

async function main() {
  const projectRoot = createFixtureCopy();
  const state = createScenarioState(projectRoot);
  let capturedStartArgs = null;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return state.mockVscode;
    }
    if (request === './driver/langgraphDriver' && parent && parent.filename.endsWith(path.join('out', 'extension.js'))) {
      const langgraphDriver = originalLoad.apply(this, arguments);
      return {
        ...langgraphDriver,
        async probeLangGraphServer() {
          return { ok: true, serverUrl: 'http://127.0.0.1:2024', statusCode: 200 };
        },
        getLangGraphDaemonInfo() {
          return {
            manager: 'manual',
            lifecycle: 'online',
            serverUrl: 'http://127.0.0.1:2024',
            port: 2024,
            pid: null,
            pidSource: null,
            launchdPid: null,
            workdir: projectRoot,
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
        async inspectWorkflowViaLangGraph(currentProjectRoot) {
          return buildDriverResult(currentProjectRoot);
        },
        async startWorkflowRunViaLangGraph(currentProjectRoot, runnerCommandTemplate, preferredRunner) {
          capturedStartArgs = {
            projectRoot: currentProjectRoot,
            runnerCommandTemplate,
            preferredRunner,
          };
          return {
            threadId: 'thread-preferred-runner',
            runId: 'run-preferred-runner',
            status: 'pending',
          };
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

    await invoke(state, 'vibeCoding.selectWorkflow', projectRoot);
    await invoke(state, 'vibeCoding.activateWorkflowRunner', projectRoot);

    assert.deepStrictEqual(capturedStartArgs, {
      projectRoot,
      runnerCommandTemplate: null,
      preferredRunner: 'codex',
    });
    assert(
      state.outputLines.some((line) => String(line).includes('Runner selection: preferred_runner=codex')),
      state.outputLines.join('\n'),
    );
    assert.strictEqual(state.errorMessages.length, 0, JSON.stringify(state.errorMessages, null, 2));
    console.log('Preferred runner smoke passed.');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function createFixtureCopy() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-preferred-runner-'));
  fs.cpSync(fixtureRoot, tempRoot, { recursive: true });
  return tempRoot;
}

function createScenarioState(projectRoot) {
  const outputLines = [];
  const errorMessages = [];
  const commandRegistry = new Map();

  const configState = {
    'vibeCoding.defaultProjectRoot': projectRoot,
    'vibeCoding.langGraphServerUrl': 'http://127.0.0.1:2024',
    'vibeCoding.langGraphStartScript': '',
    'vibeCoding.runnerCommandTemplate': '',
    'vibeCoding.preferredRunner': 'codex',
  };

  const mockVscode = {
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class ThemeColor {
      constructor(id) {
        this.id = id;
      }
    },
    MarkdownString: class MarkdownString {
      constructor(value = '') {
        this.value = value;
        this.isTrusted = false;
      }
      appendMarkdown(value) {
        this.value += String(value);
        return this;
      }
      appendText(value) {
        this.value += String(value);
        return this;
      }
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
          hide() {},
          dispose() {},
        };
      },
      registerWebviewViewProvider() {
        return {
          dispose() {},
        };
      },
      createWebviewPanel() {
        return {
          title: '',
          webview: {
            html: '',
            onDidReceiveMessage() {
              return { dispose() {} };
            },
          },
          onDidDispose() {
            return { dispose() {} };
          },
          reveal() {},
          dispose() {},
        };
      },
      async showInformationMessage() {
        return undefined;
      },
      async showWarningMessage() {
        return undefined;
      },
      async showErrorMessage(message) {
        errorMessages.push({ message });
        return undefined;
      },
      showTextDocument() {
        return Promise.resolve();
      },
      createTerminal() {
        return {
          show() {},
          sendText() {},
          dispose() {},
          processId: Promise.resolve(undefined),
        };
      },
      onDidCloseTerminal() {
        return { dispose() {} };
      },
      onDidOpenTerminal() {
        return { dispose() {} };
      },
      onDidChangeActiveTextEditor() {
        return { dispose() {} };
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
      async executeCommand(command, ...args) {
        if (commandRegistry.has(command)) {
          return commandRegistry.get(command)(...args);
        }
        return undefined;
      },
    },
    env: {
      openExternal() {
        return Promise.resolve(true);
      },
    },
    ViewColumn: { One: 1 },
    Disposable: class Disposable {
      dispose() {}
    },
    Uri: {
      file(filePath) {
        return { fsPath: filePath };
      },
      parse(value) {
        return {
          toString() {
            return String(value);
          },
        };
      },
    },
  };

  return { mockVscode, outputLines, errorMessages, commandRegistry };
}

function buildDriverResult(projectRoot) {
  return {
    schema_version: 'test',
    status: 'ready',
    message: 'ready',
    exit_code: 0,
    requested_action: 'inspect',
    effective_action: 'inspect',
    project_root: projectRoot,
    session_gate: 'ready',
    next_session: '5',
    next_session_prompt: 'session-5-prompt.md',
    last_completed_session: '4',
    last_completed_session_tests: 'passed',
    inputs: {},
    artifacts: {
      startup_prompt_path: null,
      memory_path: path.join(projectRoot, 'memory.md'),
      loop_log_path: path.join(projectRoot, 'outputs', 'session-logs', 'vibecoding-loop.jsonl'),
      next_session_prompt_path: path.join(projectRoot, 'session-5-prompt.md'),
      runner_command: null,
      startup_prompt_contents: null,
    },
    checks: {},
    risks: [],
    next_action: {
      type: 'start_session',
      message: 'Current session can be triggered via LangGraph.',
    },
    error: null,
  };
}

async function invoke(state, command, ...args) {
  const callback = state.commandRegistry.get(command);
  assert(callback, `Command not registered: ${command}`);
  return callback(...args);
}

function purgeExtensionCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}vscode-ext${path.sep}out${path.sep}`)) {
      delete require.cache[key];
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
