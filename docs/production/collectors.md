# Collector Production Readiness & Lead Supply Safety — LeadForge Egypt

## 1. Registered Collectors Inventory (`auditCollectorProductionReadiness`)
| Collector Key | Source Type | Legal / Auth Status | Default Prod State | Max Records/Run | Rate Limit (RPM) |
|---|---|---|---|---|---|
| `manual` (`manual-v1`) | `MANUAL` | `AUTHORIZED_FIRST_PARTY` | `READY_ENABLED` | `500` | `120` |
| `csv` (`csv-v1`) | `CSV_IMPORT` | `AUTHORIZED_FIRST_PARTY` | `READY_ENABLED` | `1000` | `60` |
| `open-data` (`open-data-v1`) | `OPEN_DATA` | `REQUIRES_EXPLICIT_SOURCE_APPROVAL` | `CONTROLLED_DISABLED_UNTIL_CONFIGURED` | `500` | `30` |
| `directory` (`directory-v1`) | `DIRECTORY` | `REQUIRES_EXPLICIT_SOURCE_APPROVAL` | `CONTROLLED_DISABLED_UNTIL_CONFIGURED` | `500` | `20` |
| `website` (`website-v1`) | `WEBSITE` | `REQUIRES_EXPLICIT_SOURCE_APPROVAL` | `CONTROLLED_DISABLED_UNTIL_CONFIGURED` | `250` | `15` |
| `google-business` (`google-business-v1`) | `GOOGLE_BUSINESS` | `OFFICIAL_API_CREDENTIALS_REQUIRED` | `CONTROLLED_DISABLED_UNTIL_CONFIGURED` | `500` | `30` |

## 2. Strict Compliance & Prohibited Practices (Section 26)
All collectors in `src/lib/collectors/adapters.ts` and `src/lib/collectors/security.ts` strictly prohibit:
- CAPTCHA bypass
- Anti-bot / WAF evasion
- Authentication bypass
- Stealth scraping
- Rate-limit evasion
- Private/internal network SSRF (`validateExternalCollectorUrl()` blocks `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, `::1`, `localhost`, and non-HTTP(S) schemes).

## 3. Single Canonical 8-Stage Lead Supply Pipeline (Section 27)
Every ingested record—whether from Manual entry, CSV upload, or scheduled collector—flows through the single deterministic pipeline in `src/lib/collectors/orchestrator.ts`:
`INGESTION -> NORMALIZATION -> DEDUPLICATION -> QUALITY -> VERIFICATION -> SCORING -> SALEABILITY -> MATCHING`.
No parallel bypass path exists. Invalid, closed, duplicate, or unverified records are blocked from saleability (`availableForClaim = false`) or routed to `DeadLetterRecord`.
