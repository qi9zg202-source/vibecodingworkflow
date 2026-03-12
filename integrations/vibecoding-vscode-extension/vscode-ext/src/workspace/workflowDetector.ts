import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const REQUIRED_WORKFLOW_FILES = ['startup-prompt.md', 'memory.md'] as const;
const SESSION_PROMPT_PATTERN = /^session-(\d+)-prompt\.md$/;
const EXCLUDED_DIRECTORY_NAMES = new Set([
    '.git',
    '.hg',
    '.svn',
    '.DS_Store',
    'node_modules',
    'dist',
    'build',
    'out',
    'coverage',
    'artifacts',
    'outputs',
]);

export interface WorkflowProject {
    workspaceRoot: string;
    projectRoot: string;
    relativePath: string;
    displayName: string;
    missingFiles: string[];
    startupPromptPath: string;
    memoryPath: string;
    workPlanPath: string | null;
    sessionPromptPaths: string[];
    sessionTimingBySession: Record<number, WorkflowSessionTiming>;
    progress: WorkflowProgressSummary;
}

export interface WorkflowDiscovery {
    workspaceRoot: string;
    workflows: WorkflowProject[];
}

export interface WorkflowProgressSummary {
    executionState: 'not_started' | 'in_progress' | 'done';
    completedSessionCount: number;
    totalSessionCount: number;
    lastCompletedSession: number | null;
    nextSession: number | null;
    sessionGate: string | null;
}

export interface WorkflowSessionTiming {
    sessionNumber: number;
    artifactPaths: string[];
    startedAt: Date | null;
    endedAt: Date | null;
    durationMs: number | null;
}

export function discoverWorkflowProjects(): WorkflowDiscovery | null {
    const workspaceRoot = resolveDiscoveryRoot();
    if (!workspaceRoot) {
        return null;
    }

    const workflowRoots = findWorkflowRoots(workspaceRoot);
    const workflows = workflowRoots.length > 0
        ? workflowRoots.map((projectRoot) => inspectProjectRoot(workspaceRoot, projectRoot))
        : [inspectProjectRoot(workspaceRoot, workspaceRoot)];

    return {
        workspaceRoot,
        workflows: workflows.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    };
}

export function detectWorkflowProject(preferredProjectRoot?: string): WorkflowProject | null {
    const discovery = discoverWorkflowProjects();
    if (!discovery) {
        return null;
    }

    const effectivePreferredRoot = preferredProjectRoot ?? getConfiguredProjectRoot();
    if (effectivePreferredRoot) {
        const matchedWorkflow = discovery.workflows.find((workflow) => workflow.projectRoot === effectivePreferredRoot);
        if (matchedWorkflow) {
            return matchedWorkflow;
        }
    }

    return discovery.workflows.find((workflow) => workflow.missingFiles.length === 0)
        ?? discovery.workflows[0]
        ?? null;
}

export function getConfiguredProjectRoot(): string | null {
    const configuredRoot = (vscode.workspace.getConfiguration('vibeCoding').get<string>('defaultProjectRoot') ?? '').trim();
    return configuredRoot || null;
}

function resolveDiscoveryRoot(): string | null {
    const folder = (vscode.workspace.workspaceFolders ?? [])[0];
    if (folder?.uri.fsPath) {
        return folder.uri.fsPath;
    }

    return getConfiguredProjectRoot();
}

function findWorkflowRoots(workspaceRoot: string): string[] {
    const roots = new Set<string>();
    walkDirectory(workspaceRoot, (directoryPath) => {
        if (fs.existsSync(path.join(directoryPath, 'startup-prompt.md'))) {
            roots.add(directoryPath);
        }
    });

    return Array.from(roots);
}

function walkDirectory(directoryPath: string, onDirectory: (directoryPath: string) => void) {
    onDirectory(directoryPath);

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
            continue;
        }

        walkDirectory(path.join(directoryPath, entry.name), onDirectory);
    }
}

function inspectProjectRoot(workspaceRoot: string, projectRoot: string): WorkflowProject {
    const missingFiles = REQUIRED_WORKFLOW_FILES
        .map((fileName) => path.join(projectRoot, fileName))
        .filter((filePath) => !fs.existsSync(filePath));

    const relativePath = normalizeRelativePath(path.relative(workspaceRoot, projectRoot));
    const displayName = relativePath === '.'
        ? path.basename(projectRoot)
        : relativePath.split('/').filter(Boolean).join(' / ');

    const sessionPromptPaths = readSessionPromptPaths(projectRoot);
    const workPlanPath = path.join(projectRoot, 'work-plan.md');
    const memoryPath = path.join(projectRoot, 'memory.md');

    return {
        workspaceRoot,
        projectRoot,
        relativePath,
        displayName,
        missingFiles,
        startupPromptPath: path.join(projectRoot, 'startup-prompt.md'),
        memoryPath,
        workPlanPath: fs.existsSync(workPlanPath) ? workPlanPath : null,
        sessionPromptPaths,
        sessionTimingBySession: readWorkflowSessionTimings(memoryPath, projectRoot),
        progress: readWorkflowProgress(memoryPath, sessionPromptPaths),
    };
}

function readSessionPromptPaths(projectRoot: string): string[] {
    let entries: string[];
    try {
        entries = fs.readdirSync(projectRoot);
    } catch {
        return [];
    }

    return entries
        .filter((fileName) => SESSION_PROMPT_PATTERN.test(fileName))
        .sort(compareSessionPromptNames)
        .map((fileName) => path.join(projectRoot, fileName));
}

function compareSessionPromptNames(left: string, right: string): number {
    const leftMatch = left.match(SESSION_PROMPT_PATTERN);
    const rightMatch = right.match(SESSION_PROMPT_PATTERN);
    const leftIndex = leftMatch ? Number.parseInt(leftMatch[1], 10) : Number.MAX_SAFE_INTEGER;
    const rightIndex = rightMatch ? Number.parseInt(rightMatch[1], 10) : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.localeCompare(right);
}

function normalizeRelativePath(relativePath: string): string {
    const normalized = relativePath.split(path.sep).join('/');
    return normalized.length > 0 ? normalized : '.';
}

function readWorkflowProgress(memoryPath: string, sessionPromptPaths: string[]): WorkflowProgressSummary {
    const executableSessionNumbers = sessionPromptPaths
        .map((sessionPath) => basenameWithoutPath(sessionPath))
        .map((fileName) => fileName.match(SESSION_PROMPT_PATTERN))
        .map((match) => match ? Number.parseInt(match[1], 10) : null)
        .filter((sessionNumber): sessionNumber is number => sessionNumber !== null && sessionNumber > 0);

    const totalSessionCount = executableSessionNumbers.length;
    if (!fs.existsSync(memoryPath)) {
        return {
            executionState: 'not_started',
            completedSessionCount: 0,
            totalSessionCount,
            lastCompletedSession: null,
            nextSession: null,
            sessionGate: null,
        };
    }

    const content = fs.readFileSync(memoryPath, 'utf8');
    const lastCompletedSession = readNumericField(content, 'last_completed_session');
    const nextSession = readNumericField(content, 'next_session');
    const sessionGate = readStringField(content, 'session_gate');
    const nextSessionRaw = readStringField(content, 'next_session');
    const completedSessionCount = executableSessionNumbers.filter((sessionNumber) => {
        if (lastCompletedSession === null) {
            return false;
        }
        return sessionNumber <= lastCompletedSession;
    }).length;

    const executionState = resolveExecutionState({
        completedSessionCount,
        totalSessionCount,
        lastCompletedSession,
        nextSession,
        nextSessionRaw,
        sessionGate,
    });

    return {
        executionState,
        completedSessionCount,
        totalSessionCount,
        lastCompletedSession,
        nextSession,
        sessionGate,
    };
}

function readWorkflowSessionTimings(memoryPath: string, projectRoot: string): Record<number, WorkflowSessionTiming> {
    if (!fs.existsSync(memoryPath)) {
        return {};
    }

    const content = fs.readFileSync(memoryPath, 'utf8');
    const timingBySession: Record<number, WorkflowSessionTiming> = {};

    for (const match of content.matchAll(/^- session_(\d+)_outputs:\s*(.*)$/gm)) {
        const sessionNumber = Number.parseInt(match[1], 10);
        if (Number.isNaN(sessionNumber)) {
            continue;
        }

        const artifactPaths = parseArtifactPaths(match[2] ?? '')
            .map((artifactPath) => path.join(projectRoot, artifactPath))
            .filter((artifactPath) => fs.existsSync(artifactPath));

        if (artifactPaths.length === 0) {
            timingBySession[sessionNumber] = {
                sessionNumber,
                artifactPaths: [],
                startedAt: null,
                endedAt: null,
                durationMs: null,
            };
            continue;
        }

        const stats = artifactPaths.map((artifactPath) => fs.statSync(artifactPath));
        const startedAtMs = Math.min(...stats.map((stat) => stat.birthtimeMs > 0 ? stat.birthtimeMs : (stat.ctimeMs > 0 ? stat.ctimeMs : stat.mtimeMs)));
        const endedAtMs = Math.max(...stats.map((stat) => stat.mtimeMs));

        timingBySession[sessionNumber] = {
            sessionNumber,
            artifactPaths,
            startedAt: Number.isFinite(startedAtMs) ? new Date(startedAtMs) : null,
            endedAt: Number.isFinite(endedAtMs) ? new Date(endedAtMs) : null,
            durationMs: Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) ? Math.max(0, endedAtMs - startedAtMs) : null,
        };
    }

    return timingBySession;
}

function parseArtifactPaths(rawValue: string): string[] {
    const trimmed = rawValue.trim();
    if (!trimmed) {
        return [];
    }

    const backtickMatches = Array.from(trimmed.matchAll(/`([^`]+)`/g)).map((match) => match[1].trim()).filter(Boolean);
    if (backtickMatches.length > 0) {
        return backtickMatches;
    }

    return trimmed
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function resolveExecutionState(input: {
    completedSessionCount: number;
    totalSessionCount: number;
    lastCompletedSession: number | null;
    nextSession: number | null;
    nextSessionRaw: string | null;
    sessionGate: string | null;
}): WorkflowProgressSummary['executionState'] {
    if (
        input.sessionGate === 'done'
        || input.nextSessionRaw?.toLowerCase() === 'none'
        || (input.totalSessionCount > 0 && input.completedSessionCount >= input.totalSessionCount)
    ) {
        return 'done';
    }

    if (
        input.completedSessionCount === 0
        && (input.lastCompletedSession === null || input.lastCompletedSession <= 0)
        && (input.nextSession === null || input.nextSession <= 1)
    ) {
        return 'not_started';
    }

    return 'in_progress';
}

function readNumericField(content: string, fieldName: string): number | null {
    const rawValue = readStringField(content, fieldName);
    if (!rawValue) {
        return null;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function readStringField(content: string, fieldName: string): string | null {
    const pattern = new RegExp(`^- ${escapeRegExp(fieldName)}:\\s*(.+)$`, 'm');
    const match = content.match(pattern);
    if (!match) {
        return null;
    }

    return match[1].trim().replace(/^`|`$/g, '');
}

function basenameWithoutPath(filePath: string): string {
    return path.basename(filePath);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
