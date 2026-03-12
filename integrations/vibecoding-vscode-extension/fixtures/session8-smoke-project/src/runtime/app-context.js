import { interfaceContracts } from "../contracts/interface-contracts.js";
import { getRouteById, pageMap } from "../contracts/page-map.js";

export function createAppContext({ config, routeId, projectId } = {}) {
  const resolvedRouteId = routeId ?? config.defaultRouteId;
  const resolvedProjectId = projectId ?? config.defaultProjectId;
  const route = getRouteById(resolvedRouteId);

  if (!route) {
    throw new Error(`Unknown route "${resolvedRouteId}".`);
  }

  const availableOperations = interfaceContracts.operations
    .filter((operation) => operation.routeId === resolvedRouteId)
    .map((operation) => operation.id);

  return {
    appId: config.appId,
    session: config.session,
    projectId: resolvedProjectId,
    routeId: resolvedRouteId,
    routeTitle: route.title,
    routePath: route.path,
    transport: config.transport,
    dataSource: config.dataSource.kind,
    availableOperations,
    navigation: pageMap.navigation
  };
}

