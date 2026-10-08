# Phase 8 — Collector Architecture & Source Adapters

## 1. Collector Interface & Contract (`INGESTION_CONTRACT_V1`)
All collectors in LeadForge Egypt implement the `Collector<TConfig, TRaw>` interface (`src/lib/collectors/types.ts`) and are registered in the central `CollectorRegistry` (`src/lib/collectors/registry.ts`).

Each collector separates source-specific transport/parsing (**Adapter**) from contract normalization (**Collector**):

- `validateConfiguration(config)`: Validates source settings and required environment credentials (`CONFIGURED`, `NOT_CONFIGURED`, `INVALID`).
- `discover(context)`: Discovers candidate items with cursor/offset pagination and quota bounds.
- `fetch(context, discovered)`: Fetches raw source records with timeout and rate-limit enforcement.
- `normalize(rawRecord, context)`: Maps raw data into a validated `IngestionContractRecordV1` with deterministic SHA-256 checksum.
- `healthCheck(config)`: Executes a safe, non-destructive readiness check.
- `collect(input)`: Backward-compatible convenience method returning `RawLeadInput[]`.

---

## 2. Registered Production Collectors

| Collector Key / Version | SourceType | Adapter Class | Capabilities & Policy |
| :--- | :--- | :--- | :--- |
| `manual-v1` | `MANUAL` | `ManualAdapter` | Processes single or batch admin-submitted Egyptian business records. |
| `csv-v1` | `CSV_IMPORT` | `CsvAdapter` | Hardened UTF-8 CSV parser supporting Arabic/English headers, quoted fields, size/row limits, unexpected column warnings, and spreadsheet formula injection neutralization (`=`, `+`, `-`, `@`). |
| `open-data-v1` | `OPEN_DATA` | `OpenDataAdapter` | Ingests structured Egyptian open commercial registry datasets with cursor/offset pagination and external ID tracking. |
| `directory-v1` | `DIRECTORY` | `DirectoryAdapter` | Ingests structured Egyptian business directory feeds (clinics, real estate, restaurants, retail, academies) with incremental cursor support. |
| `website-v1` | `WEBSITE` | `WebsiteAdapter` | Inspects opted-in public business URLs (`/', '/contact', '/about'`) with strict **SSRF protection** (`validateSafeExternalUrl`, `safeExternalFetch`), redirect validation on every hop, and deterministic HTML metadata extraction (title, phones, emails, Facebook/Instagram links). |
| `google-business-v1` | `GOOGLE_BUSINESS` | `GoogleBusinessAdapter` | Official Google Places API connector. Checks `GOOGLE_PLACES_API_KEY`. When credentials are not configured, reports `configurationStatus: 'NOT_CONFIGURED'` and never fabricates live API responses. Supports explicit JSON export payloads when provided. |

---

## 3. Source Policy & Compliance Rules
1. **No Anti-Bot / CAPTCHA Bypass**: Collectors never bypass CAPTCHAs, login walls, or anti-bot protections.
2. **SSRF Protection (`src/lib/collectors/security.ts`)**: `WebsiteCollector` blocks `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254` (cloud metadata), IPv6 loopback/link-local (`::1`, `fe80::`), single-label internal hostnames, non-HTTP(S) schemes (`file:`, `ftp:`, `javascript:`, `data:`), and validates every HTTP 3xx redirect target before following.
3. **CSV Formula Injection Protection**: `sanitizeSpreadsheetFormula` strips dangerous formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) while preserving valid Egyptian international phone numbers (`+2010...`).
