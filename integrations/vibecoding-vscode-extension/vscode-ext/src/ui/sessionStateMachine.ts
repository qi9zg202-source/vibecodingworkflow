import { DriverResult } from '../driver/driverTypes';

export type SessionRunnerState = 'idle' | 'starting' | 'running' | 'paused';

export type SessionTimelineState =
    | 'completed'
    | 'starting'
    | 'running'
    | 'paused'
    | 'review'
    | 'failed'
    | 'blocked'
    | 'ready'
    | 'pending';

export type WorkflowRowState =
    | 'done'
    | 'starting'
    | 'running'
    | 'paused'
    | 'review'
    | 'failed'
    | 'blocked'
    | 'ready'
    | 'pending';

export interface SessionStateFileLike {
    label: string;
    path: string;
}

export interface SessionStateWorkflowLike {
    statusLabel?: string;
    lastCompletedSession?: number | null;
    nextSession?: number | null;
    sessionGate?: string | null;
}

export interface StateDisplay {
    state: SessionTimelineState | WorkflowRowState;
    label: string;
    detail: string;
    pillClass: string;
}

interface SessionDisplayInput {
    file: SessionStateFileLike;
    workflow?: SessionStateWorkflowLike;
    result?: DriverResult;
    runnerState: SessionRunnerState;
    isNextSession: boolean;
}

interface WorkflowDisplayInput {
    workflow: SessionStateWorkflowLike;
    result?: DriverResult;
    runnerState: SessionRunnerState;
}

const SESSION_GATE_PRIORITY = ['blocked', 'done', 'in_progress', 'ready'] as const;

export function resolveDominantSessionGate(...candidates: Array<string | null | undefined>): string | null {
    const normalizedCandidates = candidates
        .map((candidate) => normalizeSessionGate(candidate))
        .filter((candidate): candidate is string => candidate !== null);

    for (const prioritizedGate of SESSION_GATE_PRIORITY) {
        if (normalizedCandidates.includes(prioritizedGate)) {
            return prioritizedGate;
        }
    }

    return normalizedCandidates[0] ?? null;
}

export function resolveSessionTimelineDisplay(input: SessionDisplayInput): StateDisplay {
    const sessionNumber = parseSessionPromptNumber(input.file.label) ?? parseSessionPromptNumber(input.file.path);
    const lastCompletedSession = parseNumericValue(input.result?.last_completed_session) ?? input.workflow?.lastCompletedSession ?? null;
    const nextSession = parseNumericValue(input.result?.next_session) ?? input.workflow?.nextSession ?? null;
    const sessionGate = resolveDominantSessionGate(input.result?.session_gate, input.workflow?.sessionGate);
    const runtimeRunStatus = getRuntimeRunStatus(input.result);
    const isCurrentSession = input.isNextSession || (sessionNumber !== null && nextSession !== null && sessionNumber === nextSession);

    if (sessionNumber !== null && lastCompletedSession !== null && sessionNumber <= lastCompletedSession) {
        return {
            state: 'completed',
            label: '已完成',
            detail: '该 session 已通过验收，并已写入 workflow 进度。',
            pillClass: 'pill-completed',
        };
    }

    if (!isCurrentSession) {
        const gateDetail = nextSession !== null
            ? `当前 next_session 是 session-${nextSession}-prompt.md，前序未完成前不会开始这里。`
            : '当前没有可执行的 next_session，后续 session 暂不会启动。';
        return {
            state: 'pending',
            label: '等待前序',
            detail: gateDetail,
            pillClass: 'pill-pending',
        };
    }

    if (input.runnerState === 'starting') {
        return {
            state: 'starting',
            label: '启动中',
            detail: '已发送启动请求，等待 runner 接管当前 session。',
            pillClass: 'pill-starting',
        };
    }

    if (input.runnerState === 'running') {
        return {
            state: 'running',
            label: '执行中',
            detail: 'runner 正在执行当前 session。',
            pillClass: 'pill-running',
        };
    }

    if (input.runnerState === 'paused') {
        return {
            state: 'paused',
            label: '已暂停',
            detail: 'runner 已暂停，等待恢复或人工处理。',
            pillClass: 'pill-paused',
        };
    }

    if (runtimeRunStatus === 'pending') {
        return {
            state: 'starting',
            label: '排队中',
            detail: 'LangGraph run 已创建，等待真正开始执行。',
            pillClass: 'pill-starting',
        };
    }

    if (runtimeRunStatus === 'running' || input.result?.status === 'in_progress' || sessionGate === 'in_progress') {
        return {
            state: 'running',
            label: '执行中',
            detail: 'LangGraph 标记当前 session 正在运行。',
            pillClass: 'pill-running',
        };
    }

    if (runtimeRunStatus === 'interrupted') {
        return {
            state: 'review',
            label: '待验收',
            detail: '当前 session 已产出候选结果，等待客户 Approve / Reject。',
            pillClass: 'pill-pending-review',
        };
    }

    if (runtimeRunStatus === 'error' || input.result?.status === 'runner_failed') {
        return {
            state: 'failed',
            label: '失败待重试',
            detail: '上一轮 run 失败，当前 session 尚未重新触发。',
            pillClass: 'pill-blocked',
        };
    }

    if (input.result?.status === 'blocked' || sessionGate === 'blocked') {
        return {
            state: 'blocked',
            label: '已阻塞',
            detail: '当前 session 被驳回或阻塞，需先处理 review notes。',
            pillClass: 'pill-blocked',
        };
    }

    if (input.result?.status === 'ready' || sessionGate === 'ready') {
        return {
            state: 'ready',
            label: '待启动',
            detail: '当前 session 已就绪，等待在 Dashboard 中显式触发。',
            pillClass: 'pill-next',
        };
    }

    return {
        state: 'pending',
        label: '待同步',
        detail: '尚未拿到可解释的运行时状态，建议刷新后重试。',
        pillClass: 'pill-pending',
    };
}

export function resolveWorkflowRowDisplay(input: WorkflowDisplayInput): StateDisplay {
    const sessionGate = resolveDominantSessionGate(input.result?.session_gate, input.workflow.sessionGate);
    const runtimeRunStatus = getRuntimeRunStatus(input.result);

    if (input.workflow.statusLabel === '完成' || input.result?.status === 'done' || sessionGate === 'done') {
        return {
            state: 'done',
            label: '完成',
            detail: '所有 session 已通过验收。',
            pillClass: 'pill-done',
        };
    }

    if (input.runnerState === 'starting') {
        return {
            state: 'starting',
            label: '执行中',
            detail: '执行请求已提交到 LangGraph，正在等待 run 接管。',
            pillClass: 'pill-starting',
        };
    }

    if (input.runnerState === 'running') {
        return {
            state: 'running',
            label: '执行中',
            detail: 'runner 正在处理当前 session。',
            pillClass: 'pill-running',
        };
    }

    if (input.runnerState === 'paused') {
        return {
            state: 'paused',
            label: '已暂停',
            detail: 'runner 暂停中，等待恢复。',
            pillClass: 'pill-paused',
        };
    }

    if (runtimeRunStatus === 'interrupted') {
        return {
            state: 'review',
            label: '待验收',
            detail: '当前 attempt 已结束，等待客户验收。',
            pillClass: 'pill-pending-review',
        };
    }

    if (runtimeRunStatus === 'error' || input.result?.status === 'runner_failed') {
        return {
            state: 'failed',
            label: '失败待重试',
            detail: '最近一次 run 失败，尚未重新启动。',
            pillClass: 'pill-blocked',
        };
    }

    if (input.result?.status === 'blocked' || sessionGate === 'blocked') {
        return {
            state: 'blocked',
            label: '已阻塞',
            detail: '工作流等待处理驳回意见后再继续。',
            pillClass: 'pill-blocked',
        };
    }

    if (input.result?.status === 'ready' || sessionGate === 'ready') {
        return {
            state: 'ready',
            label: '未执行',
            detail: '当前 session 已就绪，等待点击“执行”提交到 LangGraph。',
            pillClass: 'pill-next',
        };
    }

    return {
        state: 'pending',
        label: '未执行',
        detail: '尚未检测到活动 run。',
        pillClass: 'pill-pending',
    };
}

export function parseSessionPromptNumber(value: string): number | null {
    const match = value.match(/session-(\d+)-prompt\.md$/);
    if (!match) {
        return null;
    }

    return Number.parseInt(match[1], 10);
}

function getRuntimeRunStatus(result: DriverResult | undefined): string | null {
    const value = result?.inputs?.run_status;
    return typeof value === 'string' && value.trim() ? value : null;
}

function parseNumericValue(value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function normalizeSessionGate(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
}
