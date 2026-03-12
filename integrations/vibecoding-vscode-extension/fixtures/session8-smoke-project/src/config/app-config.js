import { pageMap } from "../contracts/page-map.js";

export const appConfig = {
  appId: pageMap.appId,
  session: 4,
  defaultProjectId: "proj-smoke",
  defaultRouteId: pageMap.rootRouteId,
  transport: "local-module",
  dataSource: {
    kind: "embedded-fixture",
    datasetId: "session-4-local-seed"
  },
  quality: {
    enableNetworkMetrics: false,
    enablePathMetrics: false
  }
};
