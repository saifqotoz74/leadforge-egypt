# LeadForge Egypt — Open Design System Questions & Calibration Differences

> **Spec Reference:** `docs/design/LEADFORGE_DESIGN_SYSTEM.md` (Section 13 — Item 4)  
> **Date:** October 9, 2026

The following items represent differences above 20% discovered during the calibration against `https://www.hostinger.com/ae` (recorded in `docs/design/hostinger-reference-notes.md`). As required by the specification, the **LeadForge Design System spec values are retained** until the product owner explicitly decides otherwise.

---

### Question 1: Public Section Vertical Spacing (96px vs. 80px)
- **Reference Measurement:** Hostinger uses `80px` (`padding-block: 80px`) on desktop for marketing sections.
- **LeadForge Spec Value:** `96px` (`py-24` / Spec Section 8: "sections of 96px padding alternating").
- **Difference:** `+20.0%`.
- **Engineering Rationale for Spec Value:** Arabic typography (`IBM Plex Sans Arabic`) requires generous vertical line-height (1.4–1.75). The extra 16px provides essential visual breathing room between content bands without feeling crowded.
- **Decision Needed from Owner:** Keep `96px` for public marketing sections or align to Hostinger's tighter `80px`? (Currently retaining `96px`).

---

### Question 2: Heading Scale Hierarchy (Marketing Landing vs. Dashboard App)
- **Reference Measurement:** Hostinger uses large display headings: Title 1 is `48px` (desktop), Title 2 is `36px`, and Title 3 is `32px`.
- **LeadForge Spec Value:**
  - `display`: `clamp(2rem, 1.4rem + 2.6vw, 3.5rem)` (32px – 56px) for public hero.
  - `h1`: `clamp(1.625rem, 1.3rem + 1.2vw, 2rem)` (26px – 32px) for application page headers.
  - `h2`: `24px` (`1.5rem`), `h3`: `20px` (`1.25rem`).
- **Difference:** ~33% difference when comparing dashboard `h1`/`h2` against marketing `Title 1`/`Title 2`.
- **Engineering Rationale for Spec Value:** LeadForge is a high-density B2B marketplace. Overly large titles inside authenticated dashboard screens would displace critical feed tables and lead data. `display` already provides up to 56px for marketing hero sections.
- **Decision Needed from Owner:** Confirm that dashboard page headers remain at `h1` (32px max) and marketing hero uses `display` (56px). (Currently retaining this separation).

---

### Question 3: Finality of Lead Purchases ("العملية نهائية")
- **Spec Citation:** Section 7.10 ("Caption under the buttons: `العملية نهائية.` Only if the backend treats purchases as final.")
- **Audit Finding:** The backend (`claimsEngine`) actually supports admin credit adjustments and refunds for invalid/closed leads.
- **Decision Needed from Owner:** Should the purchase confirmation dialog say "العملية نهائية" or "الرصيد يُخصم فوراً مع إمكانية الإبلاغ عن أي أرقام خاطئة"? (Currently omitting the unqualified claim or using neutral copy).

---

### Question 4: StatTile Metrics Scope Divergence (Hot [226] and Leads This Week [250] Exceed Matched [213])
- **Observation:** On the developer `/dashboard`, the "Hot leads" count (226) and "Leads this week" count (250) exceed "Matched leads" (213).
- **Engineering Finding:**
  - `matchedLeads` queries leads filtered specifically by the authenticated developer's profile preferences (`servicesOffered`, `targetGovernorates`, `minimumBudget`).
  - `hotLeads` and `leadsThisWeek` query global, platform-wide inventory across all sectors and Egyptian governorates.
- **Frontend Solution:** StatTiles now include explicit scope captions beneath the values ("Profile criteria match" vs. "Platform-wide (score 70+)" and "New platform additions") to ensure comparability without modifying database queries.
- **Decision Needed from Owner:** Should `hotLeads` and `leadsThisWeek` remain platform-wide discovery metrics, or should they be scoped strictly to the developer's matched subset in future backend releases? (Currently keeping platform-wide with scope captions).

---

### Question 5: Information Architecture (IA) — "Top Up" Location in Navigation
- **Observation:** "Top Up" / Credit balance management currently sits under the "Settings" group (`/subscription`) in the developer sidebar IA (per flow doc).
- **Decision Needed from Owner:** Confirm whether "Top Up" should remain grouped under "Settings" or be elevated to a primary top-level action alongside "Explore leads" and "Pipeline". (Currently retained under Settings group).

---

### Question 6: Mixed Arabic and English Seed Business Names ("X - Y")
- **Observation:** Multiple database seed business names contain mixed Arabic and English runs within a single string (e.g., `"عيادات النخبة التخصصية - Elite Clinics"`).
- **Engineering Finding:** The frontend wraps all business names and user data in `<bdi dir="auto">` to isolate bidirectional text flow and prevent layout distortion. However, mixed strings within a single element can cause reading friction and script boundary ambiguities in both locales.
- **Spec Constraint & Decision:** In accordance with the backend freeze invariant, database seed scripts and records remain untouched. In a future data pipeline update, consider separating localized names or standardizing seed entries to single-script names.

---

### Question 7: Support Contact Channel & Interim Password Recovery Details (UX-010)
- **Observation:** In the absence of an automated transactional email password recovery flow, the `/login` screen now directs users experiencing forgotten credentials to `/forgot-password`.
- **Current Placeholder:** `support@leadforge.eg` is rendered as the primary support contact address.
- **Decision Needed from Owner:** Please provide the official support contact email and/or WhatsApp hotline number to replace the `support@leadforge.eg` placeholder prior to public domain deployment.



