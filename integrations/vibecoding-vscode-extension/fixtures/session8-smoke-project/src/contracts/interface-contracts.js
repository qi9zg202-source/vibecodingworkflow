export const interfaceContracts = {
  transport: "local-module",
  operations: [
    {
      id: "loadDashboard",
      kind: "query",
      routeId: "dashboard",
      summary: "Hydrate the workspace dashboard shell.",
      input: {
        required: ["projectId"],
        properties: {
          projectId: "string"
        }
      },
      output: {
        view: "dashboardSnapshot"
      },
      errors: ["PROJECT_NOT_FOUND"]
    },
    {
      id: "loadRunDetail",
      kind: "query",
      routeId: "run-detail",
      summary: "Load a single run with evidence and checks.",
      input: {
        required: ["projectId", "runId"],
        properties: {
          projectId: "string",
          runId: "string"
        }
      },
      output: {
        view: "runDetail"
      },
      errors: ["PROJECT_NOT_FOUND", "RUN_NOT_FOUND"]
    },
    {
      id: "listReports",
      kind: "query",
      routeId: "reports",
      summary: "List report artifacts for the current project.",
      input: {
        required: ["projectId"],
        properties: {
          projectId: "string",
          status: "string"
        }
      },
      output: {
        view: "reportLibrary"
      },
      errors: ["PROJECT_NOT_FOUND"]
    },
    {
      id: "saveProjectSettings",
      kind: "command",
      routeId: "settings",
      summary: "Persist stable project preferences for later sessions.",
      input: {
        required: ["projectId", "preferences"],
        properties: {
          projectId: "string",
          preferences: "projectPreference"
        }
      },
      output: {
        entity: "projectPreference"
      },
      errors: ["PROJECT_NOT_FOUND", "INVALID_PREFERENCE"]
    }
  ]
};
