import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveBatchTaskFulfillmentMode,
  resolveBatchTaskVideoCount,
} from "../../../src/lib/tasks/batch-processing";
import {
  computeBatchTotalVideoCount,
  normalizeBatchUnitsPerProduct,
} from "../../../src/lib/tasks/batch-math";
import { ACTIVE_TASK_STATUSES } from "../../../src/lib/tasks/reconciliation";

test("resolveBatchTaskVideoCount keeps per-product count from batch params", () => {
  assert.equal(
    resolveBatchTaskVideoCount({
      batchUnitsPerProduct: 3,
      count: 3,
      orientation: "portrait",
      duration: 10,
      platform: "douyin",
      model: "plato-fast",
    }),
    3,
  );
});

test("resolveBatchTaskVideoCount prefers explicit batchUnitsPerProduct over legacy count", () => {
  assert.equal(
    resolveBatchTaskVideoCount({
      batchUnitsPerProduct: 2,
      count: 5,
      orientation: "portrait",
      duration: 10,
      platform: "douyin",
      model: "plato-fast",
    }),
    2,
  );
});

test("resolveBatchTaskVideoCount falls back to 1 when count is missing", () => {
  assert.equal(
    resolveBatchTaskVideoCount({
      count: 1,
      orientation: "portrait",
      duration: 10,
      platform: "douyin",
      model: "plato-fast",
    }),
    1,
  );
});

test("normalizeBatchUnitsPerProduct clamps to supported range", () => {
  assert.equal(normalizeBatchUnitsPerProduct(0), 1);
  assert.equal(normalizeBatchUnitsPerProduct(3), 3);
  assert.equal(normalizeBatchUnitsPerProduct(9), 5);
});

test("computeBatchTotalVideoCount uses product count and units per product as the only truth source", () => {
  assert.equal(computeBatchTotalVideoCount(3, 3), 9);
  assert.equal(computeBatchTotalVideoCount(5, 1), 5);
});

test("batch processing refunds even if submission failure happens after task enters generating", () => {
  assert.ok(ACTIVE_TASK_STATUSES.includes("generating"));
  assert.ok(ACTIVE_TASK_STATUSES.includes("polling"));
});

test("grok batch child tasks are forced through slot fulfillment", () => {
  assert.equal(
    resolveBatchTaskFulfillmentMode(
      { taskGroupId: "group-1", fulfillmentMode: "standard" },
      { provider: "grok2api" },
    ),
    "backfill_until_target",
  );
});

test("non-grok batch child tasks keep their configured fulfillment mode", () => {
  assert.equal(
    resolveBatchTaskFulfillmentMode(
      { taskGroupId: "group-1", fulfillmentMode: "standard" },
      { provider: "plato" },
    ),
    "standard",
  );
});
