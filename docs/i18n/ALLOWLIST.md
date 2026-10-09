# LeadForge Egypt — Latin Script Allowlist
## Spec Reference: LEADFORGE_SPEC_ADDENDUM_01.md (Section 3.5)

This allowlist strictly enumerates Latin script runs permitted inside Arabic UI chrome.
Any Latin word not on this list or not formatted as a technical code/data in `.ltr-iso` is a conformance violation.

---

## 1. Approved Brand and Proper Nouns
- **LeadForge** / **LeadForge Egypt**
- **Google** / **Google Maps** / **Google Business Profile**
- **Facebook**
- **Instagram**
- **WhatsApp**

---

## 2. Approved Acronyms
Only the following 6 acronyms are approved:
- `CSV`
- `SSL`
- `URL`
- `API`
- `ID`
- `SaaS`

*Adding any additional acronym requires owner approval.*

---

## 3. Technical Identifiers & Data
Allowed only when wrapped in `.ltr-iso` (and `--font-mono` where applicable) and secondary to human Arabic labels:
- Rule codes (e.g., `RULE_NO_WEBSITE`, `RULE_DENTAL_HIGH_BUDGET`)
- Entity IDs / CUIDs / Hashes
- URLs, Web domains, and paths
- Email addresses
- Phone numbers (Western digits)
- File names (e.g., `leads-export-2026.csv`)
- CSV column names in data tables

---

## 4. Forbidden in Arabic Chrome
The following words must **NEVER** appear in Arabic UI chrome:
`Dashboard`, `Lead`, `Claim`, `Score`, `Pipeline`, `Admin`, `Settings`, `Subscription`, `Credits`, `Filter`, `Free`, `Starter`, `Pro`, `Hot`, `Warm`, `Cold`, `Premium`.
All of the above must use their Arabic equivalents from `docs/i18n/GLOSSARY.md`.
