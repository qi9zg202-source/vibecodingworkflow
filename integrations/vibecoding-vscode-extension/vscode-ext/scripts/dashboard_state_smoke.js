const assert = require('assert');
const path = require('path');

const extensionRoot = path.resolve(__dirname, '..');
const {
  resolveSessionTimelineDisplay,
  resolveWorkflowRowDisplay,
} = require(path.join(extensionRoot, 'out', 'ui', 'sessionStateMachine.js'));

function main() {
  const workflow = {
    statusLabel: '未执行',
    lastCompletedSession: 4,
    nextSession: 5,
    sessionGate: 'ready',
  };

  const readyDisplay = resolveSessionTimelineDisplay({
    file: { label: 'session-5-prompt.md', path: '/tmp/session-5-prompt.md' },
    workflow,
    result: buildResult({ status: 'ready', session_gate: 'ready', next_session: '5' }),
    runnerState: 'idle',
    isNextSession: true,
  });
  assert.equal(readyDisplay.label, '待启动');
  assert(readyDisplay.detail.includes('显式触发'), readyDisplay.detail);

  const reviewDisplay = resolveSessionTimelineDisplay({
    file: { label: 'session-5-prompt.md', path: '/tmp/session-5-prompt.md' },
    workflow,
    result: buildResult({ status: 'ready', session_gate: 'ready', next_session: '5', run_status: 'interrupted' }),
    runnerState: 'idle',
    isNextSession: true,
  });
  assert.equal(reviewDisplay.label, '待验收');

  const failedDisplay = resolveSessionTimelineDisplay({
    file: { label: 'session-5-prompt.md', path: '/tmp/session-5-prompt.md' },
    workflow,
    result: buildResult({ status: 'ready', session_gate: 'ready', next_session: '5', run_status: 'error' }),
    runnerState: 'idle',
    isNextSession: true,
  });
  assert.equal(failedDisplay.label, '失败待重试');

  const blockedDisplay = resolveSessionTimelineDisplay({
    file: { label: 'session-5-prompt.md', path: '/tmp/session-5-prompt.md' },
    workflow: { ...workflow, sessionGate: 'blocked' },
    result: buildResult({ status: 'blocked', session_gate: 'blocked', next_session: '5' }),
    runnerState: 'idle',
    isNextSession: true,
  });
  assert.equal(blockedDisplay.label, '已阻塞');

  const futureDisplay = resolveSessionTimelineDisplay({
    file: { label: 'session-6-prompt.md', path: '/tmp/session-6-prompt.md' },
    workflow,
    result: buildResult({ status: 'ready', session_gate: 'ready', next_session: '5' }),
    runnerState: 'idle',
    isNextSession: false,
  });
  assert.equal(futureDisplay.label, '等待前序');
  assert(futureDisplay.detail.includes('session-5-prompt.md'), futureDisplay.detail);

  const workflowReady = resolveWorkflowRowDisplay({
    workflow,
    result: buildResult({ status: 'ready', session_gate: 'ready', next_session: '5' }),
    runnerState: 'idle',
  });
  assert.equal(workflowReady.label, '未执行');
  assert(workflowReady.detail.includes('点击“执行”'), workflowReady.detail);

  const workflowReview = resolveWorkflowRowDisplay({
    workflow,
    result: buildResult({ status: 'ready', session_gate: 'ready', next_session: '5', run_status: 'interrupted' }),
    runnerState: 'idle',
  });
  assert.equal(workflowReview.label, '待验收');

  console.log('Dashboard state smoke passed.');
}

function buildResult(overrides) {
  return {
    schema_version: 'test',
    status: 'ready',
    message: 'test',
    exit_code: 0,
    requested_action: 'inspect',
    effective_action: 'inspect',
    project_root: '/tmp/project',
    session_gate: 'ready',
    next_session: '5',
    next_session_prompt: 'session-5-prompt.md',
    last_completed_session: '4',
    last_completed_session_tests: 'passed',
    inputs: {},
    artifacts: {
      startup_prompt_path: null,
      memory_path: null,
      loop_log_path: null,
      next_session_prompt_path: null,
      runner_command: null,
      startup_prompt_contents: null,
    },
    checks: {},
    risks: [],
    next_action: {
      type: 'start_session',
      message: 'test',
    },
    error: null,
    ...overrides,
    inputs: {
      ...(overrides && Object.prototype.hasOwnProperty.call(overrides, 'run_status')
        ? { run_status: overrides.run_status }
        : {}),
    },
  };
}

main();
