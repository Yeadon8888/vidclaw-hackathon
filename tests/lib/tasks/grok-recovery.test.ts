import assert from "node:assert/strict";
import test from "node:test";
import { assessGrokBatchRecoveryCandidate } from "../../../src/lib/tasks/grok-recovery";

const now = new Date("2026-04-24T04:00:00.000Z");
const oldEnough = new Date(now.getTime() - 9 * 60 * 1000);

const baseTask = {
  id: "task-1",
  taskGroupId: "group-1",
  status: "generating",
  fulfillmentMode: "standard",
  creditsCost: 50,
  createdAt: oldEnough,
  startedAt: oldEnough,
  soraPrompt: "finished script prompt",
  paramsJson: {
    count: 5,
    batchUnitsPerProduct: 5,
    orientation: "portrait",
    duration: 6,
    platform: "tiktok",
    model: "grok-imagine-video",
  },
} as const;

const grokModel = { provider: "grok2api", creditsPerGen: 10 };

test("eligible stuck grok batch task returns requested recovery count", () => {
  assert.deepEqual(
    assessGrokBatchRecoveryCandidate({
      task: baseTask,
      model: grokModel,
      itemCount: 0,
      now,
    }),
    { recoverable: true, requestedCount: 5 },
  );
});

test("recent grok batch task is not recovered during grace window", () => {
  const recent = new Date(now.getTime() - 7 * 60 * 1000);

  assert.equal(
    assessGrokBatchRecoveryCandidate({
      task: { ...baseTask, createdAt: recent, startedAt: recent },
      model: grokModel,
      itemCount: 0,
      now,
    }).recoverable,
    false,
  );
});

test("credits mismatch prevents grok batch recovery", () => {
  assert.equal(
    assessGrokBatchRecoveryCandidate({
      task: { ...baseTask, creditsCost: 40 },
      model: grokModel,
      itemCount: 0,
      now,
    }).recoverable,
    false,
  );
});

test("non-grok provider is not recovered", () => {
  assert.equal(
    assessGrokBatchRecoveryCandidate({
      task: baseTask,
      model: { provider: "plato", creditsPerGen: 10 },
      itemCount: 0,
      now,
    }).recoverable,
    false,
  );
});

test("existing slot-mode task is not recovered", () => {
  assert.equal(
    assessGrokBatchRecoveryCandidate({
      task: { ...baseTask, fulfillmentMode: "backfill_until_target" },
      model: grokModel,
      itemCount: 0,
      now,
    }).recoverable,
    false,
  );
});

test("queued task without generated prompt is not recovered", () => {
  assert.equal(
    assessGrokBatchRecoveryCandidate({
      task: { ...baseTask, status: "pending", soraPrompt: null },
      model: grokModel,
      itemCount: 0,
      now,
    }).recoverable,
    false,
  );
});
