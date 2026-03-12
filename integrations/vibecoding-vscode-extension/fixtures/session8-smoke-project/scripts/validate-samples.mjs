import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { dataModel } from "../src/contracts/data-model.js";
import { interfaceContracts } from "../src/contracts/interface-contracts.js";

const samplePath = new URL("../outputs/samples/session-2-contract-sample.json", import.meta.url);
const scalarValidators = {
  boolean: (value) => typeof value === "boolean",
  number: (value) => typeof value === "number",
  string: (value) => typeof value === "string"
};

function validateValue(typeName, value, label) {
  if (typeName.endsWith("[]")) {
    assert.ok(Array.isArray(value), `${label} must be an array.`);
    const itemType = typeName.slice(0, -2);
    value.forEach((item, index) => validateValue(itemType, item, `${label}[${index}]`));
    return;
  }

  if (scalarValidators[typeName]) {
    assert.ok(scalarValidators[typeName](value), `${label} must match type ${typeName}.`);
    return;
  }

  if (Object.hasOwn(dataModel.entities, typeName)) {
    validateEntity(typeName, value, label);
    return;
  }

  if (Object.hasOwn(dataModel.views, typeName)) {
    validateView(typeName, value, label);
    return;
  }

  assert.fail(`Unknown type ${typeName} at ${label}.`);
}

function validateEntity(entityName, record, label) {
  assert.equal(typeof record, "object", `${label} must be an object.`);
  assert.ok(record, `${label} must be defined.`);

  const entityDef = dataModel.entities[entityName];

  for (const fieldName of entityDef.required) {
    assert.ok(record[fieldName] !== undefined, `${label}.${fieldName} is required.`);
  }

  for (const [fieldName, fieldDef] of Object.entries(entityDef.fields)) {
    if (record[fieldName] === undefined || record[fieldName] === null) {
      assert.ok(fieldDef.nullable || !entityDef.required.includes(fieldName), `${label}.${fieldName} is missing.`);
      continue;
    }

    validateValue(fieldDef.type, record[fieldName], `${label}.${fieldName}`);
  }
}

function validateView(viewName, viewPayload, label) {
  assert.equal(typeof viewPayload, "object", `${label} must be an object.`);
  assert.ok(viewPayload, `${label} must be defined.`);

  const viewDef = dataModel.views[viewName];
  for (const [fieldName, typeName] of Object.entries(viewDef.shape)) {
    assert.ok(viewPayload[fieldName] !== undefined, `${label}.${fieldName} is required.`);
    validateValue(typeName, viewPayload[fieldName], `${label}.${fieldName}`);
  }
}

const sample = JSON.parse(await readFile(samplePath, "utf8"));

for (const [entityName, entityDef] of Object.entries(dataModel.entities)) {
  const payload = sample.entities[entityName];
  assert.ok(payload !== undefined, `Missing entity sample for ${entityName}.`);
  if (entityDef.primaryKey === "projectId" || entityDef.primaryKey === "preferenceId") {
    validateEntity(entityName, payload, `entities.${entityName}`);
  } else {
    assert.ok(Array.isArray(payload), `entities.${entityName} must be an array sample.`);
    payload.forEach((record, index) =>
      validateEntity(entityName, record, `entities.${entityName}[${index}]`)
    );
  }
}

for (const viewName of Object.keys(dataModel.views)) {
  validateView(viewName, sample.views[viewName], `views.${viewName}`);
}

for (const operation of interfaceContracts.operations) {
  const operationSample = sample.operations[operation.id];
  assert.ok(operationSample, `Missing sample for operation ${operation.id}.`);

  for (const [fieldName, typeName] of Object.entries(operation.input.properties)) {
    if (operationSample.input[fieldName] === undefined) {
      assert.ok(
        !operation.input.required.includes(fieldName),
        `Missing required input ${fieldName} on ${operation.id}.`
      );
      continue;
    }

    validateValue(typeName, operationSample.input[fieldName], `operations.${operation.id}.input.${fieldName}`);
  }

  if (operation.output.view) {
    validateView(operation.output.view, operationSample.output, `operations.${operation.id}.output`);
  }

  if (operation.output.entity) {
    validateEntity(
      operation.output.entity,
      operationSample.output,
      `operations.${operation.id}.output`
    );
  }
}

console.log("Sample validation passed.");
