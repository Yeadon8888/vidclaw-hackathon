# Grok Batch Slot Recovery Design

## Background

On 2026-04-24, production credit history showed repeated `grok-imagine-video`
batch consumption and refund cycles for user `734382116@qq.com`.

Observed task examples:

- `b259e23f-9636-4ff8-a75e-41949cca8a22`
  - Batch product task: `1 product x 5 videos`
  - `task_items = 0`
  - Final failure: timeout refund after 60 minutes
- `8f9774f3-a9de-4d22-aea0-666b6a682715`
  - Batch product task: `1 product x 5 videos`
  - `task_items = 0`
  - Final failure: `HTTP 502: Video generation returned no final video URL`
- `7328412d-c056-45a7-82d0-177de7a76e44`
  - Batch product task: `1 product x 5 videos`
  - Still `generating` after more than 30 minutes when inspected
  - `task_items = 0`

The common failure mode is not incorrect credit arithmetic. The system charges
the expected `creditsPerGen * count` amount, then refunds when the task fails.
The product issue is that a user can repeatedly hit a fragile execution path
where no provider attempts are persisted.

## Root Cause

`grok2apiProvider.createTasks()` is synchronous. For `count > 1`, it loops
serially and waits for each video to fully complete before returning:

1. Call the grok chat endpoint.
2. Wait for the final video URL.
3. Re-host the returned video to R2.
4. Repeat until all requested videos are complete.
5. Return all `providerTaskIds` and `immediateResults`.

For standard batch processing, `task_items` are inserted only after
`createVideoTasksForModelId()` returns. That means `count = 5` is treated as
one all-or-nothing operation. If any single grok call fails, or if the Vercel
function is interrupted before the provider loop returns, the database remains
in this state:

- `tasks.status = generating`
- `tasks.creditsCost > 0`
- no `task_items`
- no provider task id to poll

The timeout path eventually refunds these tasks, but users see a bad loop:
consume credits, wait, fail/refund, retry, repeat.

## Goals

- Make grok batch generation independent per video target.
- Persist each successful grok video immediately.
- Prevent one failed video from losing earlier successful videos.
- Recover stuck grok batch tasks with no `task_items`.
- Preserve correct partial refund behavior.
- Keep the first fix scoped to `grok2api` batch behavior and existing task
  infrastructure.

## Non-Goals

- Do not redesign every provider.
- Do not introduce a new queue table in the first phase.
- Do not change billing semantics for successful videos.
- Do not remove the existing standard async provider path for Plato, Yunwu, or
  DashScope.

## Recommended Approach

Use the existing fulfillment slot engine for grok batch tasks.

For grok batch generation, one requested video becomes one `task_slot`.
Each slot submits exactly one provider request with `count = 1`. Successful
results are written immediately to `task_items` and `task_slots`. Failed slots
can retry according to the existing retry policy.

This reuses existing concepts:

- `task_slots` represent promised output units.
- `submitPendingSlots()` already limits provider submissions.
- `advanceSlotOnResult()` already handles success, failure, retry, and
  finalization.
- `maybeFinalizeFulfillmentTask()` already handles partial refund and task
  result aggregation.

## Phase 1: Production Stopgap

### Safety Invariants

The implementation must preserve these invariants:

- The original batch charge is created exactly once by `/api/generate/batch`.
- A task may be finalized only through a guarded terminal-state transition.
  The update must include a status guard such as `status in active statuses`.
- Refunds are emitted only when the guarded terminal transition succeeds.
  If another worker already finalized the task, the second worker must not
  insert another refund transaction.
- After a task enters slot mode, final billing is derived from terminal slot
  results, not from wall-clock age alone.
- `task_items` and `task_slots` must be reconciled so an already successful
  provider result is never submitted again.

The current schema has no `tasks.updatedAt` and no `recovering` task status.
Therefore recovery must use existing state carefully: atomic guarded updates,
slot existence checks, and a grace window long enough to ensure the original
Vercel invocation has stopped.

### Batch Creation and Processing

When `processPendingBatchTasks()` claims a batch child task whose model provider
is `grok2api`, it should force slot-based execution:

- Set or preserve `fulfillmentMode = "backfill_until_target"`.
- Set `requestedCount` to the per-product video target.
- Initialize one slot per requested video.
- Submit pending slots using the existing slot submission limit.
- Never call `createVideoTasksForModelId()` with `count > 1` for grok batch
  tasks.

This avoids a single synchronous `count = 5` provider loop.

For new tasks, this path should run before any standard `count > 1` grok submit
can start. The standard branch should be unreachable for grok batch tasks.

### Immediate Success Handling

`submitSlotAttempt()` must correctly handle synchronous providers. If
`createVideoTasks()` returns an immediate `SUCCESS`, the corresponding
`task_item` and `task_slot` success state should be written in one transaction
where practical.

If the code cannot make that fully atomic, the next maintenance tick must treat
the existing `task_item = SUCCESS` row as authoritative:

- find submitted slots with a successful `task_item`;
- copy `resultUrl` into the slot;
- mark the slot `success`;
- avoid submitting another provider attempt for that slot;
- run normal finalization if all slots are terminal.

The system should not leave a slot in `submitted` when the corresponding
`task_item` is already `SUCCESS`.

### Stuck Task Recovery

Add recovery for existing grok batch tasks matching all of these conditions:

- `tasks.taskGroupId is not null`
- model provider is `grok2api`
- task status is one of `analyzing`, `generating`, `polling`
- no `task_items` exist
- task age is greater than a short grace window

The grace window must be longer than the maximum expected lifetime of the
original Vercel invocation. Since the production routes declare `maxDuration =
300`, use at least 8 minutes for automatic recovery. This prevents recovery
from racing a still-running original synchronous `createTasks()` loop.

Recovery behavior:

1. Compute the intended video count from `paramsJson.batchUnitsPerProduct` or
   `paramsJson.count`.
2. Validate the intended video count against the charged amount:
   `creditsCost == model.creditsPerGen * intendedCount`. If this does not
   match, fail closed: do not auto-recover, leave the timeout fallback to refund
   and emit a diagnostic log.
3. Atomically claim recovery with a guarded update on the task:
   - match the task id;
   - match an active status;
   - match `fulfillmentMode = "standard"`;
   - set `fulfillmentMode = "backfill_until_target"`;
   - set `requestedCount`;
   - set `deliveryDeadlineAt` if missing;
   - refresh `startedAt` to mark the recovery attempt.
4. If the guarded update affects zero rows, another worker already recovered
   or finalized the task; do nothing.
5. Initialize slots only when no slots exist.
6. Submit pending slots with `count = 1` per slot.

This turns stuck tasks into recoverable slot tasks instead of waiting for the
60-minute timeout fallback.

Existing slot handling:

| Existing state | Recovery behavior |
| --- | --- |
| No slots, no items | Initialize slots and submit pending slots. |
| Slots exist, no items, all pending | Submit pending slots. |
| Slots exist with successful items | Reconcile item success into slot success, do not resubmit those slots. |
| Slots submitted with active provider ids | Do not reset; normal fulfillment polling owns them. |
| Slots terminal | Run finalization only. |

## Phase 2: Generalization

After the stopgap is verified, consider generalizing the behavior:

- Add an adapter capability flag such as `submissionMode: "async" | "immediate"`.
- Route all `immediate` providers with `count > 1` through per-output slot
  execution.
- Keep async task-id providers on the standard batch path when they can return
  provider ids quickly.
- Optionally add admin controls for max concurrent slots per model.

This prevents future synchronous providers from reintroducing the same failure
mode.

## Data Flow

### New Grok Batch Flow

```text
/api/generate/batch
  -> creates task_group and child tasks
  -> deducts credits once for requested total

/api/internal/tasks/tick or route after()
  -> processPendingBatchTasks()
  -> claim child task
  -> generate script
  -> initialize task_slots
  -> submitPendingSlots()
  -> submitSlotAttempt(count = 1)
  -> grok returns immediate success or throws
  -> persist task_item per slot
  -> advance slot on success/failure
  -> finalize when all slots terminal
```

### Partial Failure Behavior

If 5 videos are requested and 3 succeed:

- `tasks.status = done`
- `tasks.resultUrls` contains 3 URLs
- `tasks.creditsCost` is reduced to the cost of 3 successful videos
- refund transaction returns the failed portion
- task group summary shows 3 successes and 2 failures

If all 5 fail:

- `tasks.status = failed`
- `tasks.creditsCost = 0`
- full refund transaction is recorded

The timeout path must respect slot mode. Once a task is
`fulfillmentMode = "backfill_until_target"`, timeout processing should expire
pending/submitted slots, then call slot finalization. It must not perform a
standard full-task refund solely because the task age exceeds 60 minutes.

## Error Handling

- Grok upstream 502 should fail only the current slot attempt.
- Retryable provider errors should retry while inside the delivery window.
- Content policy and quota errors should not retry.
- Tasks with no `task_items` after the grace window should be recovered before
  timeout refund.
- Timeout refund remains as a final safety net.

Error classification for grok synchronous submission:

| Error | Retryable | Terminal class | Behavior |
| --- | --- | --- | --- |
| HTTP 429, 500, 502, 503, 504 | yes | `provider_error` | Fail current attempt, retry slot if policy allows. |
| Network timeout / aborted request | yes | `timeout` | Fail current attempt, retry slot if policy allows. |
| Empty or missing final video URL | yes | `provider_error` | Fail current attempt, retry slot if policy allows. |
| Content policy / safety / sensitive prompt | no | `content_policy` | Fail slot without retry. |
| Quota / insufficient balance | no | `quota_exceeded` | Fail slot without retry and surface operator-visible error. |
| R2 re-host failure after upstream URL exists | no provider retry by default | `provider_error` | Prefer returning upstream URL if safe; otherwise fail current attempt without duplicating an upstream generation. |

## Testing Plan

Add focused unit tests around task decision logic and fulfillment behavior:

- Grok batch processing uses slot path instead of standard `count > 1` submit.
- A stuck grok batch task with no `task_items` is converted to slot execution.
- Immediate success in `submitSlotAttempt()` advances the slot to success.
- A partial success summary preserves successful URLs and refunds failed slots.
- Non-grok providers remain on the existing standard path.
- Recovery run twice does not duplicate slots or provider submissions.
- Timeout processing for recovered slot-mode tasks expires slots and finalizes
  from slot state instead of full-refunding by age alone.
- A crash-window state with `task_item = SUCCESS` and `slot = submitted` is
  reconciled without resubmitting the slot.
- Finalization/refund is idempotent under repeated maintenance ticks.
- Two workers claiming the same batch child task cannot both recover it.

Run:

```bash
npm run test
npm run lint
```

For production verification after deploy:

- Submit `1 product x 5 videos` with `grok-imagine-video`.
- Confirm `task_slots` are created.
- Confirm `task_items` appear per submitted slot.
- Confirm successful videos appear before all 5 have completed.
- Confirm forced provider failure affects only one slot.
- Confirm no grok batch task remains `generating` with `task_items = 0` beyond
  the grace window.

## Acceptance Criteria

- Grok batch generation never calls the provider once with `count > 1`.
- `1 product x 5 videos` creates five independently tracked output units.
- A single grok 502 does not discard other successful videos.
- Stuck grok batch tasks with no `task_items` are recovered by maintenance.
- Partial refund behavior remains correct.
- Existing async provider batch behavior is unchanged.
- Recovery cannot race an original running grok `count > 1` submit.
- Billing after recovery is derived from terminal slot outcomes and cannot
  double-refund.
- Successful `task_items` are treated as authoritative during reconciliation.
