export function createWorkspaceApi({ runtime }) {
  if (!runtime) {
    throw new Error("Workspace API requires a runtime instance.");
  }

  return {
    loadWorkspace({ projectId }) {
      return runtime.loadRouteData({ projectId });
    },

    loadRunDetail({ projectId, runId }) {
      return runtime.execute("loadRunDetail", { projectId, runId });
    },

    listReports({ projectId, status }) {
      const input = { projectId };
      if (status && status !== "all") {
        input.status = status;
      }
      return runtime.execute("listReports", input);
    }
  };
}
