import assert from "node:assert/strict";

import { appConfig } from "../src/config/app-config.js";
import { dataModel } from "../src/contracts/data-model.js";
import { interfaceContracts } from "../src/contracts/interface-contracts.js";
import { pageMap } from "../src/contracts/page-map.js";
import { createAppContext } from "../src/runtime/app-context.js";
import { createSessionRuntime } from "../src/runtime/session-runtime.js";

const scalarTypes = new Set(["string", "boolean", "number"]);

function isKnownType(typeName) {
  const normalized = typeName.endsWith("[]") ? typeName.slice(0, -2) : typeName;
  return (
    scalarTypes.has(normalized) ||
    Object.hasOwn(dataModel.entities, normalized) ||
    Object.hasOwn(dataModel.views, normalized)
  );
}

function ensureUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `Duplicate ${label} detected.`);
}

function validatePageMap() {
  assert.equal(pageMap.session, 2, "Page map must be tagged to Session 2.");
  assert.ok(pageMap.rootRouteId, "Page map requires a root route.");
  ensureUnique(
    pageMap.routes.map((route) => route.id),
    "route ids"
  );
  ensureUnique(
    pageMap.routes.map((route) => route.path),
    "route paths"
  );

  const routeIds = new Set(pageMap.routes.map((route) => route.id));
  assert.ok(routeIds.has(pageMap.rootRouteId), "Root route must exist in routes list.");

  for (const navItem of pageMap.navigation) {
    assert.ok(routeIds.has(navItem.routeId), `Unknown navigation route: ${navItem.routeId}`);
  }

  for (const route of pageMap.routes) {
    assert.ok(route.sections.length > 0, `${route.id} must define sections.`);
    assert.ok(route.primaryActions.length > 0, `${route.id} must define primary actions.`);
    assert.ok(route.dataDependencies.length > 0, `${route.id} must define data dependencies.`);
    for (const dependency of route.dataDependencies) {
      assert.ok(
        Object.hasOwn(dataModel.views, dependency) || Object.hasOwn(dataModel.entities, dependency),
        `Unknown data dependency "${dependency}" on route ${route.id}.`
      );
    }
  }
}

function validateDataModel() {
  for (const [entityName, entityDef] of Object.entries(dataModel.entities)) {
    assert.ok(entityDef.primaryKey, `${entityName} requires a primary key.`);
    assert.ok(Object.hasOwn(entityDef.fields, entityDef.primaryKey), `${entityName} primary key missing.`);
    for (const fieldName of entityDef.required) {
      assert.ok(Object.hasOwn(entityDef.fields, fieldName), `${entityName}.${fieldName} not declared.`);
    }
    for (const fieldDef of Object.values(entityDef.fields)) {
      assert.ok(isKnownType(fieldDef.type), `Unknown field type "${fieldDef.type}" in ${entityName}.`);
    }
  }

  for (const [viewName, viewDef] of Object.entries(dataModel.views)) {
    assert.ok(viewDef.shape, `${viewName} requires a shape definition.`);
    for (const typeName of Object.values(viewDef.shape)) {
      assert.ok(isKnownType(typeName), `Unknown view reference "${typeName}" in ${viewName}.`);
    }
  }
}

function validateInterfaceContracts() {
  ensureUnique(
    interfaceContracts.operations.map((operation) => operation.id),
    "operation ids"
  );

  const routeIds = new Set(pageMap.routes.map((route) => route.id));

  for (const operation of interfaceContracts.operations) {
    assert.ok(routeIds.has(operation.routeId), `Unknown route "${operation.routeId}" on operation ${operation.id}.`);
    assert.ok(operation.errors.length > 0, `${operation.id} must define error codes.`);

    for (const fieldName of operation.input.required) {
      assert.ok(
        Object.hasOwn(operation.input.properties, fieldName),
        `${operation.id} missing input property ${fieldName}.`
      );
    }

    for (const typeName of Object.values(operation.input.properties)) {
      assert.ok(isKnownType(typeName), `Unknown input type "${typeName}" on ${operation.id}.`);
    }

    if (operation.output.view) {
      assert.ok(
        Object.hasOwn(dataModel.views, operation.output.view),
        `${operation.id} references unknown output view "${operation.output.view}".`
      );
    }

    if (operation.output.entity) {
      assert.ok(
        Object.hasOwn(dataModel.entities, operation.output.entity),
        `${operation.id} references unknown output entity "${operation.output.entity}".`
      );
    }
  }
}

function validateSessionThreeRuntime() {
  assert.equal(appConfig.session, 4, "App config must be tagged to Session 4.");
  assert.equal(appConfig.appId, pageMap.appId, "App config must target the current app.");
  assert.equal(appConfig.transport, interfaceContracts.transport, "Transport must stay aligned with the contract.");
  assert.ok(
    pageMap.routes.some((route) => route.id === appConfig.defaultRouteId),
    "Default route must exist in the page map."
  );
  assert.equal(appConfig.quality.enableNetworkMetrics, false, "Session 4 must keep network metrics disabled.");
  assert.equal(appConfig.quality.enablePathMetrics, false, "Session 4 must keep path metrics disabled.");

  const context = createAppContext({ config: appConfig });
  assert.equal(context.projectId, appConfig.defaultProjectId, "Context should inherit the default project.");
  assert.ok(context.availableOperations.length > 0, "Context should expose route operations.");
  assert.ok(
    context.navigation.every((item) => pageMap.routes.some((route) => route.id === item.routeId)),
    "Context navigation must resolve to known routes."
  );

  const runtime = createSessionRuntime();
  const operationIds = interfaceContracts.operations.map((operation) => operation.id);
  const inspectedCounts = runtime.inspect().entityCounts;
  assert.deepEqual(
    Object.keys(inspectedCounts),
    ["runs", "evidence", "checks", "reports"],
    "Runtime inspection should report stable entity counts."
  );
  for (const operationId of operationIds) {
    assert.ok(operationIds.includes(operationId), `Missing runtime operation ${operationId}.`);
  }
}

validatePageMap();
validateDataModel();
validateInterfaceContracts();
validateSessionThreeRuntime();

console.log("Structure validation passed.");
