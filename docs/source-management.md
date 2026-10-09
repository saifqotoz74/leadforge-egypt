# Phase 8 — Source Management, Health, Scheduling & Continuous Supply

## 1. Source Health States (`SourceHealthStatus`)
Each `LeadSource` is deterministically evaluated (`src/lib/collectors/health-and-supply.ts`):

- `HEALTHY`: Source is enabled, configured (`CONFIGURED`), circuit breaker is `CLOSED`, `consecutiveFailures === 0`, and invalid/duplicate rates are within normal bounds.
- `DEGRADED`: Source has `consecutiveFailures >= 1`, circuit breaker is `HALF_OPEN`, invalid rate `> 35%` (min 5 records), or duplicate rate `> 85%` (min 10 records).
- `FAILING`: Circuit breaker is `OPEN` or `consecutiveFailures >= 3`.
- `NOT_CONFIGURED`: Collector requires external credentials (e.g. `GOOGLE_PLACES_API_KEY`) that are not present in the environment or source config.
- `DISABLED`: Administratively disabled (`enabled: false` or `isActive: false`).

---

## 2. Circuit Breaker State Machine (`src/lib/collectors/resilience.ts`)
- **`CLOSED`**: Normal operation. Consecutive job failures increment `consecutiveFailures`.
- **`OPEN`**: Triggered when `consecutiveFailures >= failureThreshold` (default `3`). Blocks new automated runs with `CIRCUIT_OPEN` (HTTP 503) until `cooldownMs` (default `60,000ms`) elapses or an Admin resets the circuit.
- **`HALF_OPEN`**: Entered automatically after `cooldownMs` elapses. Allows a single probe run:
  - If the probe succeeds → transitions back to `CLOSED` and resets `consecutiveFailures = 0`.
  - If the probe fails → re-opens (`OPEN`) with a fresh cooldown timer.

---

## 3. Continuous Supply & Inventory Replenishment
`evaluateInventoryReplenishment` (`src/lib/collectors/health-and-supply.ts`) monitors available, saleable canonical leads (`status: 'AVAILABLE'`, `saleabilityStatus: 'AVAILABLE'`, `isCanonical: true`) across Egyptian business categories, cities, governorates, and required developer services:

1. Compares `currentAvailable` against each rule's `minAvailableSaleableLeads`.
2. Computes `deficit = max(0, minRequired - currentAvailable)`.
3. Selects eligible automated sources (`enabled`, `CONFIGURED`, `HEALTHY` or `DEGRADED`, `circuitState !== 'OPEN'`) ordered deterministically by `priority ASC` and historical success count.
4. When `autoTrigger: true`, dispatches `runIngestionPipeline` with `triggerType: 'REPLENISHMENT'`.

---

## 4. Source Cost & Acquisition Economics
`computeSourceCostEconomics` calculates:
- `costPerCollectedRecord`
- `costPerUniqueLead`
- `costPerSaleableLead`
- `costPerClaimedLead`
- `costPerWonLead`

If a source has no configured cost (`acquisitionCostPerRunEgp == null`, `acquisitionCostPerRecordEgp == null`, and `totalJobCostEgp == null`), all cost metrics return `status: 'INSUFFICIENT_DATA'` and `value: null`—never fabricated numbers.
