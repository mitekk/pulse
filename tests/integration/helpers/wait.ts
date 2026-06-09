/**
 * Deterministic wait helpers for integration tests.
 *
 * These replace arbitrary `setTimeout` sleeps that papered over async background
 * work (the 8 in-process BullMQ workers + fire-and-forget writes). Two tools:
 *
 *   - waitForQueuesIdle(app): resolve once every BullMQ worker is idle (no active
 *     or waiting jobs). Used between tests (truncateAll) so no worker is mid-write
 *     when the DB/Redis is truncated.
 *   - waitFor(fn): poll an assertion's observable outcome until it holds. Used where
 *     the write is fire-and-forget (e.g. notifications) and queue state is not a
 *     faithful proxy for the result.
 *
 * Both are bounded by a timeout so a perpetually-failing background job (e.g. the
 * media worker with no MinIO in integration) can never hang the suite.
 */
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/** Every BullMQ queue registered across the app (each has one @Processor worker). */
export const ALL_QUEUES = [
  'fanout',
  'search',
  'sessions',
  'counters',
  'trends',
  'timeline',
  'notify',
  'media',
] as const;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface WaitForQueuesOptions {
  /** Restrict the wait to a subset of queues (default: all). */
  only?: readonly string[];
  /** Upper bound; resolves anyway once exceeded (default 5000ms). */
  timeoutMs?: number;
  /** Poll cadence (default 25ms). */
  intervalMs?: number;
}

/**
 * Resolve once every selected BullMQ queue reports no `active` or `waiting` jobs.
 *
 * `delayed` is intentionally ignored so repeatable/cron jobs (sessions, counters,
 * trends) and retry-backoff jobs don't block the wait. Bounded by `timeoutMs` —
 * degrades to a no-op rather than hanging.
 */
export async function waitForQueuesIdle(
  app: NestFastifyApplication,
  options: WaitForQueuesOptions = {},
): Promise<void> {
  const { only, timeoutMs = 5000, intervalMs = 25 } = options;
  const names = only ?? ALL_QUEUES;

  const queues: Queue[] = [];
  for (const name of names) {
    try {
      queues.push(app.get<Queue>(getQueueToken(name), { strict: false }));
    } catch {
      // Queue not registered in this app context — skip it.
    }
  }
  if (queues.length === 0) return;

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const counts = await Promise.all(
      queues.map((queue) => queue.getJobCounts('active', 'waiting')),
    );
    const busy = counts.some(
      (count) => (count['active'] ?? 0) > 0 || (count['waiting'] ?? 0) > 0,
    );
    if (!busy || Date.now() >= deadline) return;
    await sleep(intervalMs);
  }
}

interface WaitForOptions {
  /** Upper bound before throwing (default 5000ms). */
  timeoutMs?: number;
  /** Poll cadence (default 50ms). */
  intervalMs?: number;
  /** Description used in the timeout error message. */
  label?: string;
}

/**
 * Poll `fn` until it returns a truthy value, then return it. Throws a descriptive
 * error on timeout so a failing test points at the unmet condition rather than a
 * confusing downstream assertion. Use for eventually-consistent / fire-and-forget
 * outcomes (e.g. asynchronously-written notifications).
 */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  options: WaitForOptions = {},
): Promise<T> {
  const { timeoutMs = 5000, intervalMs = 50, label = 'condition' } = options;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() >= deadline) {
      throw new Error(`waitFor: timed out after ${timeoutMs}ms waiting for ${label}`);
    }
    await sleep(intervalMs);
  }
}
