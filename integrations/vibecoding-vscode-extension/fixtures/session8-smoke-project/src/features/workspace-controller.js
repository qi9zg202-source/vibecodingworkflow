import { createWorkspaceApi } from "./workspace-api.js";

export function normalizeReportStatus(status) {
  return status && status !== "all" ? status : "all";
}

export function deriveReportStatusOptions(reports = []) {
  return ["all", ...new Set(reports.map((report) => report.status))].map((status) => ({
    value: status,
    label: status === "all" ? "All statuses" : status
  }));
}

export function deriveWorkspaceSummary({ dashboard, runDetail, reports, selectedRunId }) {
  const activeRuns = dashboard?.data?.activeRuns ?? [];
  const selectedRun =
    runDetail?.run ??
    activeRuns.find((run) => run.runId === selectedRunId) ??
    activeRuns[0] ??
    null;

  return {
    runCount: activeRuns.length,
    openCheckCount: dashboard?.data?.openChecks?.length ?? 0,
    reportCount: reports?.reports?.length ?? 0,
    evidenceCount: runDetail?.evidence?.length ?? 0,
    selectedRunId: selectedRun?.runId ?? null,
    selectedRunStatus: selectedRun?.status ?? "unknown",
    latestReportTitle: dashboard?.data?.latestReport?.title ?? "No report available"
  };
}

function createBaseState(config) {
  return {
    projectId: config.defaultProjectId,
    reportStatus: "all",
    selectedRunId: null,
    dashboard: null,
    runDetail: null,
    reports: null
  };
}

export function createWorkspaceController({ runtime }) {
  if (!runtime) {
    throw new Error("Workspace controller requires a runtime instance.");
  }

  const api = createWorkspaceApi({ runtime });
  const state = createBaseState(runtime.config);

  function getSnapshot() {
    return {
      ...state,
      navigation: state.dashboard?.context?.navigation ?? [],
      summary: deriveWorkspaceSummary(state),
      reportStatusOptions: deriveReportStatusOptions(state.reports?.reports ?? [])
    };
  }

  async function loadRunDetail(runId) {
    if (!runId) {
      return null;
    }

    return api.loadRunDetail({
      projectId: state.projectId,
      runId
    });
  }

  async function refreshWorkspace() {
    state.dashboard = await api.loadWorkspace({ projectId: state.projectId });
    state.selectedRunId =
      state.selectedRunId ??
      state.dashboard.data.context.activeRunId ??
      state.dashboard.data.activeRuns[0]?.runId ??
      null;

    const [runDetail, reports] = await Promise.all([
      loadRunDetail(state.selectedRunId),
      api.listReports({
        projectId: state.projectId,
        status: state.reportStatus
      })
    ]);

    state.runDetail = runDetail;
    state.reports = reports;

    return getSnapshot();
  }

  return {
    async initialize() {
      return refreshWorkspace();
    },

    async refreshWorkspace() {
      return refreshWorkspace();
    },

    async selectRun(runId) {
      state.selectedRunId = runId;
      state.runDetail = await loadRunDetail(runId);
      return getSnapshot();
    },

    async setReportStatus(status) {
      state.reportStatus = normalizeReportStatus(status);
      state.reports = await api.listReports({
        projectId: state.projectId,
        status: state.reportStatus
      });
      return getSnapshot();
    },

    getState() {
      return getSnapshot();
    }
  };
}
