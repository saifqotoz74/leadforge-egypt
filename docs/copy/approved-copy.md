# Approved Copy Catalog

This document is the single source of truth for user-facing copy in LeadForge.
Per governance rules, all new strings are submitted here as `[PROPOSED]` and require explicit PO confirmation before being marked `[APPROVED]`.

---

## 1. Error Messages & API Responses

| Error Code / Key | Status | Proposed Copy (AR) | Proposed Copy (EN) | Context / Trigger & Notes |
| :--- | :--- | :--- | :--- | :--- |
| `REFUND_REPORT_ALREADY_EXISTS` | `[PROPOSED]` *(Needs Replacement)* | يوجد بلاغ استرداد نشط قيد المراجعة بالفعل لهذا الطلب | An active refund report is already under review for this claim | **Note (Option A Policy):** The current text states the report is "under review" (قيد المراجعة), which is inaccurate under Option A (where only one report is permitted per claim forever, even after review is resolved/rejected). Marked `[PROPOSED]` pending replacement copy approved by PO. |

---

## Confirmation & Audit Notes
- **UI Exposure:** Confirmed that no frontend page or component currently renders this error message directly.
- **Client Handling:** The frontend handles this error programmatically via error code `REFUND_REPORT_ALREADY_EXISTS`.
- **Option A Safety Net:** Any developer appealing a rejected report must be directed to Customer Support / Admin manual credit restoration.
