export const sessionSeed = {
  entities: {
    projectContext: {
      projectId: "proj-smoke",
      projectName: "Session 8 Smoke Project",
      environment: "local",
      activeRunId: "run-002",
      lastSyncedAt: "2026-03-11T10:40:00Z"
    },
    runRecord: [
      {
        runId: "run-001",
        title: "Smoke validation baseline",
        status: "ready",
        startedAt: "2026-03-11T09:00:00Z",
        reportIds: ["report-001"],
        qualityCheckIds: ["check-001", "check-002"]
      },
      {
        runId: "run-002",
        title: "Workspace UI rehearsal",
        status: "in_review",
        startedAt: "2026-03-11T10:00:00Z",
        reportIds: ["report-002"],
        qualityCheckIds: ["check-003", "check-004"]
      }
    ],
    evidenceItem: [
      {
        evidenceId: "evidence-001",
        runId: "run-001",
        layer: "business_context",
        title: "Baseline objective",
        sourcePath: "references/evidence-model.md",
        summary: "Defines the fixed evidence layers used by the UI.",
        capturedAt: "2026-03-11T09:05:00Z"
      },
      {
        evidenceId: "evidence-002",
        runId: "run-002",
        layer: "ui_logic",
        title: "Workspace shell markup",
        sourcePath: "src/features/workspace-view.js",
        summary: "Captures the local dashboard, run detail, and report sections.",
        capturedAt: "2026-03-11T10:15:00Z"
      },
      {
        evidenceId: "evidence-003",
        runId: "run-002",
        layer: "api_logic",
        title: "Local API adapter",
        sourcePath: "src/features/workspace-api.js",
        summary: "Wraps runtime route loading and report filtering without network transport.",
        capturedAt: "2026-03-11T10:18:00Z"
      }
    ],
    qualityCheck: [
      {
        checkId: "check-001",
        label: "Page map linked",
        status: "pass",
        severity: "medium",
        ownerRouteId: "dashboard"
      },
      {
        checkId: "check-002",
        label: "Contract sample complete",
        status: "pass",
        severity: "low",
        ownerRouteId: "reports"
      },
      {
        checkId: "check-003",
        label: "Workspace controller connected",
        status: "warning",
        severity: "medium",
        ownerRouteId: "dashboard"
      },
      {
        checkId: "check-004",
        label: "Final integration deferred",
        status: "blocked",
        severity: "high",
        ownerRouteId: "run-detail"
      }
    ],
    reportArtifact: [
      {
        reportId: "report-001",
        runId: "run-001",
        title: "Session 2 contract map",
        status: "draft",
        updatedAt: "2026-03-11T09:20:00Z",
        outputPath: "outputs/reports/session-2-contract-map.md"
      },
      {
        reportId: "report-002",
        runId: "run-002",
        title: "Session 4 workspace walkthrough",
        status: "published",
        updatedAt: "2026-03-11T10:25:00Z",
        outputPath: "outputs/reports/session-4-workspace-walkthrough.md"
      }
    ],
    projectPreference: {
      preferenceId: "pref-001",
      projectId: "proj-smoke",
      defaultView: "dashboard",
      autoRefresh: false,
      preferredReportFormat: "markdown"
    }
  }
};
