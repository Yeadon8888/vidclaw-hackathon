# Grok Batch Slot Recovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `grok-imagine-video` batch generation submit and persist each requested video independently, and recover stuck grok batch tasks that have no `task_items`.

**Architecture:** Reuse the existing fulfillment slot engine for grok batch tasks. Route grok batch child tasks through `task_slots` with one provider request per slot, reconcile immediate provider success into slots, and recover old standard-mode grok batch tasks through an atomic guarded transition to slot mode.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, Postgres, Node test runner, existing `task_slots`/`task_items` fulfillment engine.

---

## Files

- Modify: `src/lib/video/providers/shared.ts`
  - Export a reusable provider failure classifier for thrown synchronous errors if needed.
- Modify: `src/lib/tasks/fulfillment.ts`
  - Make slot submission/reconciliation handle immediate `SUCCESS` rows without leaving slots stuck in `submitted`.
  - Add helper to reconcile successful `task_items` into slots.
- Modify: `src/lib/tasks/batch-processing.ts`
  - Force grok batch child tasks through slot mode.
  - Avoid standard `count > 1` grok submission.
- Modify: `src/lib/tasks/runner.ts`
  - Add stuck grok batch recovery before normal active task polling.
- Modify: `src/lib/tasks/timeout.ts`
  - Ensure slot-mode tasks finalize from slot state and are not full-refunded by standard age logic.
- Test: `tests/lib/tasks/fulfillment.test.ts` or extend existing fulfillment-related tests.
- Test: `tests/lib/tasks/batch-processing.test.ts`
- Test: `tests/lib/tasks/runner.test.ts` if dependency mocking is practical; otherwise add focused pure helper tests for recovery decision logic.

## Chunk 1: Fulfillment Slot Reconciliation

### Task 1: Add immediate success reconciliation tests

**Files:**
- Modify: `tests/lib/tasks/reconciliation.test.ts` or create `tests/lib/tasks/fulfillment.test.ts`
- Modify later: `src/lib/tasks/fulfillment.ts`

- [ ] **Step 1: Write a failing test for a success item with a submitted slot**

Create a test that models:

```ts
const slot = { status: "submitted" };
const item = { status: "SUCCESS", resultUrl: "https://example.com/video.mp4" };
```

Expected behavior:

- slot becomes `success`
- slot `resultUrl` is copied from the item
- no provider resubmission is requested

- [ ] **Step 2: Run the focused test**

Run:

```bash
npm run test -- tests/lib/tasks/fulfillment.test.ts
```

Expected: fail because reconciliation helper does not exist yet.

- [ ] **Step 3: Implement reconciliation helper**

In `src/lib/tasks/fulfillment.ts`, add a focused helper such as:

```ts
export async function reconcileSuccessfulSlotItems(taskId: string): Promise<number>
```

It should:

- find slots with `status = "submitted"`;
- find linked `task_items` with `status = "SUCCESS"` and `resultUrl`;
- update the matching slots to `success`;
- set `completedAt`;
- return the number reconciled.

- [ ] **Step 4: Wire reconciliation into active fulfillment paths**

Call the helper before submitting more pending slots and before computing final progress in fulfillment polling/runner paths.

- [ ] **Step 5: Re-run focused tests**

Run:

```bash
npm run test -- tests/lib/tasks/fulfillment.test.ts
```

Expected: pass.

## Chunk 2: Grok Batch Slot Path

### Task 2: Force grok batch child tasks through slots

**Files:**
- Modify: `src/lib/tasks/batch-processing.ts`
- Test: `tests/lib/tasks/batch-processing.test.ts`

- [ ] **Step 1: Add a failing test for grok batch routing**

Test the routing decision with a grok model/provider:

- input: batch task with provider `grok2api`, `batchUnitsPerProduct = 5`
- expected: use slot path with requested count `5`
- expected: never call standard provider submission with `count = 5`

- [ ] **Step 2: Run the focused test**

Run:

```bash
npm run test -- tests/lib/tasks/batch-processing.test.ts
```

Expected: fail until routing logic exists.

- [ ] **Step 3: Add provider detection**

In `batch-processing.ts`, after claiming a task and before submission, resolve whether its model provider is `grok2api`.

Use existing model information where possible. If a new helper is needed, keep it small and local.

- [ ] **Step 4: Force slot fields before submission**

For grok batch child tasks:

- compute `videoCount = resolveBatchTaskVideoCount(taskParams)`;
- update the task to `fulfillmentMode = "backfill_until_target"`;
- set `requestedCount = videoCount`;
- set `deliveryDeadlineAt` if missing;
- call `initializeSlots()` only when slots do not already exist;
- call `submitPendingSlots()` with a bounded limit.

- [ ] **Step 5: Ensure count = 1 per slot**

Verify `submitSlotAttempt()` already calls `createVideoTasks()` with `count: 1`. Keep that invariant.

- [ ] **Step 6: Re-run batch tests**

Run:

```bash
npm run test -- tests/lib/tasks/batch-processing.test.ts
```

Expected: pass.

## Chunk 3: Stuck Grok Batch Recovery

### Task 3: Add guarded recovery for existing no-item tasks

**Files:**
- Modify: `src/lib/tasks/runner.ts`
- Possibly create: `src/lib/tasks/grok-recovery.ts`
- Test: `tests/lib/tasks/grok-recovery.test.ts`

- [ ] **Step 1: Extract recovery decision into a pure helper**

Create a helper that determines whether a task is a recovery candidate:

- provider is `grok2api`;
- task belongs to a task group;
- active task status;
- `fulfillmentMode = "standard"`;
- no task items;
- age is at least 8 minutes;
- intended count matches `creditsCost / creditsPerGen`.

- [ ] **Step 2: Write failing helper tests**

Cover:

- eligible stuck task returns recoverable;
- age under 8 minutes returns not recoverable;
- count/credits mismatch returns not recoverable;
- non-grok provider returns not recoverable;
- already slot-mode task returns not recoverable.

- [ ] **Step 3: Run helper tests**

Run:

```bash
npm run test -- tests/lib/tasks/grok-recovery.test.ts
```

Expected: fail until helper exists.

- [ ] **Step 4: Implement guarded recovery**

In the recovery execution function:

- perform one guarded `update(tasks)` matching:
  - task id;
  - active status;
  - `fulfillmentMode = "standard"`;
- set:
  - `fulfillmentMode = "backfill_until_target"`;
  - `requestedCount`;
  - `deliveryDeadlineAt` if needed;
  - `startedAt = now`;
- if zero rows update, return without side effects.

- [ ] **Step 5: Initialize or reuse slots**

After a successful guarded update:

- if no slots exist, initialize slots;
- if slots exist, reconcile successful items first;
- submit only pending slots.

- [ ] **Step 6: Wire recovery into runner**

In `runTaskMaintenance()`, call recovery before standard active task orphan handling.

- [ ] **Step 7: Re-run recovery tests**

Run:

```bash
npm run test -- tests/lib/tasks/grok-recovery.test.ts
```

Expected: pass.

## Chunk 4: Timeout and Refund Safety

### Task 4: Verify slot-mode timeout finalizes by slots

**Files:**
- Modify: `src/lib/tasks/timeout.ts`
- Test: `tests/lib/tasks/reconciliation.test.ts` or new timeout test if practical

- [ ] **Step 1: Add a failing test or code assertion for slot-mode timeout**

Expected behavior:

- `fulfillmentMode = "backfill_until_target"` tasks are not processed by the standard timeout branch.
- timeout expires pending/submitted slots and calls `maybeFinalizeFulfillmentTask()`.
- refund depends on successful slot count.

- [ ] **Step 2: Inspect current timeout filters**

Confirm standard branch filters `fulfillmentMode = "standard"` and fulfillment branch filters `backfill_until_target`.

- [ ] **Step 3: Add missing reconciliation before finalize**

Before expiring/finalizing slot-mode tasks, call the successful item reconciliation helper.

- [ ] **Step 4: Re-run timeout/reconciliation tests**

Run:

```bash
npm run test -- tests/lib/tasks/reconciliation.test.ts tests/lib/tasks/fulfillment.test.ts
```

Expected: pass.

## Chunk 5: Verification and Production Readiness

### Task 5: Run validation suite

**Files:**
- No code changes expected.

- [ ] **Step 1: Run task-focused tests**

Run:

```bash
npm run test -- tests/lib/tasks/*.test.ts
```

Expected: pass.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm run test
```

Expected: pass.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 4: Manual production-query checklist after deploy**

Check:

```sql
select id, status, fulfillment_mode, requested_count
from tasks
where task_group_id is not null
  and params_json->>'model' = 'grok-imagine-video'
order by created_at desc
limit 10;
```

Expected:

- new grok batch child tasks use `backfill_until_target`;
- slots exist for requested count;
- no new grok batch task remains active with `task_items = 0` beyond 8 minutes.

- [ ] **Step 5: Deployment path**

Run preflight:

```bash
npm run deploy:vercel:check
```

If clean, deploy using the repo-preferred command:

```bash
npm run release:vercel
```

Expected: production deployment succeeds.
