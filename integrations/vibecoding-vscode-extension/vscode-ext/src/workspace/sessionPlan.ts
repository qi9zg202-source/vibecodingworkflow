import * as fs from 'fs';
import * as path from 'path';
import { DriverResult } from '../driver/driverTypes';
import { DashboardSessionRow } from '../ui/dashboard';

interface SessionSection {
    sessionNumber: number;
    bullets: string[];
    declaredStatus?: string;
}

export function buildSessionRows(projectRoot: string | undefined, result?: DriverResult): DashboardSessionRow[] {
    if (!projectRoot) {
        return [];
    }

    const workPlanPath = path.join(projectRoot, 'work-plan.md');
    if (!fs.existsSync(workPlanPath)) {
        return [];
    }

    const content = fs.readFileSync(workPlanPath, 'utf8');
    const sections = parseSessionSections(content);
    return sections.map((section) => toSessionRow(section, result));
}

function parseSessionSections(content: string): SessionSection[] {
    const lines = content.split(/\r?\n/);
    const sections: SessionSection[] = [];
    let current: SessionSection | null = null;

    for (const line of lines) {
        const headingMatch = line.match(/^## Session (\d+)\s*$/);
        if (headingMatch) {
            if (current) {
                sections.push(current);
            }
            current = {
                sessionNumber: Number(headingMatch[1]),
                bullets: [],
            };
            continue;
        }

        if (!current) {
            continue;
        }

        const bulletMatch = line.match(/^- (.+)$/);
        if (!bulletMatch) {
            continue;
        }

        const bulletText = bulletMatch[1].trim();
        const statusMatch = bulletText.match(/^状态[:：]\s*(.+)$/);
        if (statusMatch) {
            current.declaredStatus = statusMatch[1].trim();
            continue;
        }

        current.bullets.push(bulletText);
    }

    if (current) {
        sections.push(current);
    }

    return sections;
}

function toSessionRow(section: SessionSection, result?: DriverResult): DashboardSessionRow {
    const title = section.bullets[0] ?? `Session ${section.sessionNumber}`;
    const lastCompleted = parseIntSafe(result?.last_completed_session);
    const nextSession = parseIntSafe(result?.next_session);
    const workflowStatus = result?.status;

    let progress = 'Pending';
    let status = section.declaredStatus ?? 'pending';
    let tone: DashboardSessionRow['tone'] = 'pending';

    if (workflowStatus === 'done') {
        if (lastCompleted !== null && section.sessionNumber <= lastCompleted) {
            progress = '100%';
            status = 'done';
            tone = 'done';
        }
        return { sessionNumber: section.sessionNumber, title, progress, status, tone };
    }

    if (lastCompleted !== null && section.sessionNumber <= lastCompleted) {
        progress = '100%';
        status = section.declaredStatus ?? 'completed';
        tone = 'completed';
        return { sessionNumber: section.sessionNumber, title, progress, status, tone };
    }

    if (nextSession !== null && section.sessionNumber === nextSession) {
        if (workflowStatus === 'blocked') {
            progress = 'Blocked';
            status = 'workflow blocked';
            tone = 'blocked';
        } else if (workflowStatus === 'ready') {
            progress = 'Ready';
            status = 'next session';
            tone = 'current';
        } else if (workflowStatus === 'invalid') {
            progress = 'Attention';
            status = 'invalid state';
            tone = 'blocked';
        } else {
            progress = 'Current';
            status = workflowStatus ?? 'current';
            tone = 'current';
        }
        return { sessionNumber: section.sessionNumber, title, progress, status, tone };
    }

    if (nextSession !== null && section.sessionNumber < nextSession) {
        progress = '100%';
        status = section.declaredStatus ?? 'completed';
        tone = 'completed';
    } else {
        progress = '0%';
        status = section.declaredStatus ?? 'pending';
        tone = 'pending';
    }

    return { sessionNumber: section.sessionNumber, title, progress, status, tone };
}

function parseIntSafe(value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}
