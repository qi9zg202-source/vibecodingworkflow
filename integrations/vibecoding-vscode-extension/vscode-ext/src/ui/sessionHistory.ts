export interface SessionHistoryLocation {
    source: 'loop_log' | 'workflow_thread_fallback';
    sessionNumber: number | null;
    sessionPrompt: string | null;
    threadId: string | null;
    runId: string | null;
    checkpointId: string | null;
    parentCheckpointId: string | null;
    workflowGate: string | null;
    approvalRequired: boolean | null;
    approvalDecision: string | null;
    runnerExitCode: string | null;
    summaryExists: boolean | null;
    manifestPath: string | null;
    startedAt: string | null;
    endedAt: string | null;
    recordedAt: string | null;
}

export interface SessionStudioTarget {
    source?: SessionHistoryLocation['source'] | null;
    sessionNumber?: number | null;
    sessionPrompt?: string | null;
    threadId?: string | null;
    runId?: string | null;
    checkpointId?: string | null;
    parentCheckpointId?: string | null;
}

export function buildSessionStudioCommandArgs(
    workflowRoot: string,
    sessionNumber: number | null | undefined,
    location?: SessionStudioTarget | null,
): unknown[] {
    const normalizedSessionNumber = typeof sessionNumber === 'number' && Number.isFinite(sessionNumber)
        ? sessionNumber
        : null;
    if (!location) {
        return [workflowRoot, normalizedSessionNumber];
    }

    return [workflowRoot, normalizedSessionNumber, {
        source: location.source ?? null,
        sessionNumber: normalizedSessionNumber ?? location.sessionNumber ?? null,
        sessionPrompt: location.sessionPrompt ?? null,
        threadId: location.threadId ?? null,
        runId: location.runId ?? null,
        checkpointId: location.checkpointId ?? null,
        parentCheckpointId: location.parentCheckpointId ?? null,
    }];
}
