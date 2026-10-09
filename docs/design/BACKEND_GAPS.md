# LeadForge Egypt — Backend Gaps & Data Contract Audit

> **Spec Reference:** `docs/design/LEADFORGE_DESIGN_SYSTEM.md` (Section 12, 14)  
> **Date:** October 9, 2026

This document lists visual features required by the LeadForge Design System specification that require backend data exposures or schema expansions.

---

## 1. Top Scoring Signals on Feed Cards (`LeadCard` Chips)
- **Spec Citation:** Section 7.8: *"Signals: up to 3 neutral outline chips (height 24, radius-full, caption, border --border-default) listing the top scoring reasons by weight... Derived from the rules that fired; if the backend does not expose them, omit this row (log in BACKEND_GAPS)."*
- **Backend Current State:** In `LeadFeed` queries, `LeadScore` returns `score` (0-100) and `classification` (`LeadTemperature`). The individual rule firing breakdown (`LeadScoreBreakdown`) is calculated during scoring but is only stored in memory or in detailed verification logs; it is not joined in standard lightweight `/api/leads` browse queries to preserve latency.
- **Frontend Fallback Implemented:** `LeadCard` accepts optional `signals?: string[]`. When passed (e.g., in detail views or cached highlights), chips render cleanly. When omitted, the signals row is omitted cleanly without visual collapse.

---

## 2. Match Explanation in Browse View
- **Spec Citation:** Section 7.9: *"Same pattern is reused for match explanation (why this lead matches the developer's profile)."*
- **Backend Current State:** Phase 4 Matching Engine calculates rule weights against `DeveloperProfile` (`servicesOffered`, `targetGovernorates`, `minimumBudget`). In browse mode, `LeadMatch` records are queried by score, but the individual matched dimensions are not unpacked into an API payload until lead inspection.
- **Frontend Fallback Implemented:** `ScoreBreakdown` accepts both scoring rules and matching dimensions.
