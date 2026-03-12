import { appConfig } from "../config/app-config.js";
import { interfaceContracts } from "../contracts/interface-contracts.js";
import { createAppContext } from "./app-context.js";
import { createDataLoader } from "./data-loader.js";

function getOperation(operationId) {
  const operation = interfaceContracts.operations.find((item) => item.id === operationId);
  if (!operation) {
    throw new Error(`Unknown operation "${operationId}".`);
  }
  return operation;
}

function validateRequiredInput(operation, input) {
  for (const fieldName of operation.input.required) {
    if (input[fieldName] === undefined) {
      throw new Error(`Missing required input "${fieldName}" for ${operation.id}.`);
    }
  }
}

function getRouteOperation(routeId) {
  return interfaceContracts.operations.find(
    (operation) => operation.routeId === routeId && operation.kind === "query"
  );
}

export function createSessionRuntime({ config = appConfig, seed } = {}) {
  const dataLoader = createDataLoader({ seed });

  async function execute(operationId, input = {}) {
    const operation = getOperation(operationId);
    validateRequiredInput(operation, input);

    switch (operationId) {
      case "loadDashboard":
        return dataLoader.loadDashboard(input);
      case "loadRunDetail":
        return dataLoader.loadRunDetail(input);
      case "listReports":
        return dataLoader.listReports(input);
      case "saveProjectSettings":
        return dataLoader.saveProjectSettings(input);
      default:
        throw new Error(`Unhandled operation "${operationId}".`);
    }
  }

  return {
    config,
    createContext(input) {
      return createAppContext({ config, ...input });
    },
    async loadRouteData(input = {}) {
      const context = createAppContext({ config, ...input });
      const operation = getRouteOperation(context.routeId);

      if (!operation) {
        throw new Error(`No query operation mapped for route "${context.routeId}".`);
      }

      const request = {
        projectId: context.projectId,
        ...input
      };

      return {
        context,
        operationId: operation.id,
        data: await execute(operation.id, request)
      };
    },
    execute,
    inspect() {
      return dataLoader.inspect();
    }
  };
}

