import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveStatusPollScope,
  summarizeTaskSettlement,
} from "../../../src/lib/tasks/reconciliation";

test("summarizeTaskSettlement returns null until every item is terminal", () => {
  const summary = summarizeTaskSettlement(
    [
      { status: "SUCCESS", resultUrl: "https://cdn.example/success.mp4" },
      { status: "PENDING" },
    ],
    20,
  );

  assert.equal(summary, null);
});

test("summarizeTaskSettlement applies partial refunds for partial success", () => {
  const summary = summarizeTaskSettlement(
    [
      { status: "SUCCESS", resultUrl: "https://cdn.example/1.mp4" },
      { status: "FAILED" },
      { status: "SUCCESS", resultUrl: "https://cdn.example/2.mp4" },
    ],
    30,
  );

  assert.ok(summary);
  assert.equal(summary.finalStatus, "done");
  assert.equal(summary.refundAmount, 10);
  assert.equal(summary.finalCreditsCost, 20);
  assert.deepEqual(summary.successUrls, [
    "https://cdn.example/1.mp4",
    "https://cdn.example/2.mp4",
  ]);
  assert.equal(summary.errorMessage, "2/3 成功，失败部分积分已退还");
});

test("summarizeTaskSettlement refunds the full amount on total failure", () => {
  const summary = summarizeTaskSettlement(
    [
      { status: "FAILED" },
      { status: "FAILED" },
      { status: "FAILED" },
    ],
    2,
  );

  assert.ok(summary);
  assert.equal(summary.finalStatus, "failed");
  assert.equal(summary.refundAmount, 2);
  assert.equal(summary.finalCreditsCost, 0);
  assert.equal(summary.errorMessage, "视频生成失败，积分已自动退还");
});

test("resolveStatusPollScope accepts a complete single-task match", () => {
  const scope = resolveStatusPollScope(
    ["task-1", "task-2"],
    [
      { providerTaskId: "task-1", taskId: "db-task", modelId: "model-1" },
      { providerTaskId: "task-2", taskId: "db-task", modelId: "model-1" },
    ],
  );

  assert.deepEqual(scope, { taskId: "db-task", modelId: "model-1" });
});

test("resolveStatusPollScope rejects missing or mixed-task provider ids", () => {
  const missing = resolveStatusPollScope(
    ["task-1", "task-2"],
    [{ providerTaskId: "task-1", taskId: "db-task", modelId: "model-1" }],
  );
  const mixed = resolveStatusPollScope(
    ["task-1", "task-2"],
    [
      { providerTaskId: "task-1", taskId: "db-task-1", modelId: "model-1" },
      { providerTaskId: "task-2", taskId: "db-task-2", modelId: "model-1" },
    ],
  );

  assert.equal(missing, null);
  assert.equal(mixed, null);
});
