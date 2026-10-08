# Background Workers & Scheduled Jobs — LeadForge Egypt

## 1. Registered Worker Jobs Inventory (`WORKER_JOB_DEFINITIONS` in `src/lib/production/scheduler.ts`)
| Job Key | Schedule (Cron) | Timeout | Retries | Max Batch | Lock | Cancellable | Owner |
|---|---|---|---|---|---|---|---|
| `ingestion_scheduled_sync` | `*/30 * * * *` | `60000ms` | `2` | `250` | Exclusive | Yes | Data Ingestion Engineering |
| `verification_batch_refresh` | `15 */2 * * *` | `45000ms` | `2` | `100` | Exclusive | Yes | Scoring & Quality Engineering |
| `scoring_recalculation_batch` | `30 */4 * * *` | `45000ms` | `2` | `200` | Exclusive | Yes | Scoring & Quality Engineering |
| `analytics_daily_snapshot` | `5 1 * * *` | `60000ms` | `3` | `500` | Exclusive | No | Analytics Engineering |
| `stale_lead_lifecycle_sweep` | `45 */6 * * *` | `30000ms` | `2` | `250` | Exclusive | Yes | Lead Supply Operations |
| `notification_dispatch_retry` | `*/10 * * * *` | `20000ms` | `3` | `100` | Exclusive | No | Platform Operations |
| `dead_letter_retention_cleanup` | `20 3 * * *` | `30000ms` | `1` | `500` | Exclusive | Yes | Platform Operations |
| `export_artifact_cleanup` | `50 3 * * *` | `15000ms` | `1` | `200` | Exclusive | No | Platform Operations |

## 2. Scheduler Safety Guarantees (Section 25)
1. **Exclusive Job Locking (`acquireWorkerJobLock`)**: Prevents duplicate concurrent execution of the same job. Concurrent attempts return `status: "LOCK_CONFLICT"` immediately.
2. **Strict Batch Clamping**: Every job clamps `requestedBatchSize` to `[1, maxBatchSize]`. No background job can perform an unbounded full-table scan or update.
3. **Cursor Checkpoints**: Batch sweeps accept and return `checkpointCursor` (`id > cursor` ordered by `id ASC`) for deterministic pagination.
4. **Hard Timeouts & Safe Cancellation**: Every job runs inside a `Promise.race` timeout guard (`WORKER_JOB_TIMEOUT`) and checks `isCancelRequested()` between retries.
