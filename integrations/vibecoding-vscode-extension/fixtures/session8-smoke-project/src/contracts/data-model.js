export const dataModel = {
  version: "session-2",
  entities: {
    projectContext: {
      primaryKey: "projectId",
      required: ["projectId", "projectName", "environment", "lastSyncedAt"],
      fields: {
        projectId: { type: "string" },
        projectName: { type: "string" },
        environment: { type: "string" },
        activeRunId: { type: "string", nullable: true },
        lastSyncedAt: { type: "string", format: "date-time" }
      }
    },
    runRecord: {
      primaryKey: "runId",
      required: ["runId", "title", "status", "startedAt", "reportIds", "qualityCheckIds"],
      fields: {
        runId: { type: "string" },
        title: { type: "string" },
        status: { type: "string" },
        startedAt: { type: "string", format: "date-time" },
        reportIds: { type: "string[]" },
        qualityCheckIds: { type: "string[]" }
      }
    },
    evidenceItem: {
      primaryKey: "evidenceId",
      required: ["evidenceId", "runId", "layer", "title", "sourcePath", "capturedAt"],
      fields: {
        evidenceId: { type: "string" },
        runId: { type: "string" },
        layer: { type: "string" },
        title: { type: "string" },
        sourcePath: { type: "string" },
        summary: { type: "string", nullable: true },
        capturedAt: { type: "string", format: "date-time" }
      }
    },
    qualityCheck: {
      primaryKey: "checkId",
      required: ["checkId", "label", "status", "severity", "ownerRouteId"],
      fields: {
        checkId: { type: "string" },
        label: { type: "string" },
        status: { type: "string" },
        severity: { type: "string" },
        ownerRouteId: { type: "string" }
      }
    },
    reportArtifact: {
      primaryKey: "reportId",
      required: ["reportId", "runId", "title", "status", "updatedAt", "outputPath"],
      fields: {
        reportId: { type: "string" },
        runId: { type: "string" },
        title: { type: "string" },
        status: { type: "string" },
        updatedAt: { type: "string", format: "date-time" },
        outputPath: { type: "string" }
      }
    },
    projectPreference: {
      primaryKey: "preferenceId",
      required: [
        "preferenceId",
        "projectId",
        "defaultView",
        "autoRefresh",
        "preferredReportFormat"
      ],
      fields: {
        preferenceId: { type: "string" },
        projectId: { type: "string" },
        defaultView: { type: "string" },
        autoRefresh: { type: "boolean" },
        preferredReportFormat: { type: "string" }
      }
    }
  },
  views: {
    dashboardSnapshot: {
      shape: {
        context: "projectContext",
        activeRuns: "runRecord[]",
        openChecks: "qualityCheck[]",
        latestReport: "reportArtifact"
      }
    },
    runDetail: {
      shape: {
        run: "runRecord",
        evidence: "evidenceItem[]",
        checks: "qualityCheck[]",
        relatedReports: "reportArtifact[]"
      }
    },
    reportLibrary: {
      shape: {
        context: "projectContext",
        reports: "reportArtifact[]"
      }
    },
    settingsSnapshot: {
      shape: {
        context: "projectContext",
        preferences: "projectPreference"
      }
    }
  }
};
