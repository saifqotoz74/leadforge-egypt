# LeadForge Egypt — Engineering & Workflow Invariants

## 1. Always Utilize `agent-skills`
- For every task, consult the local `agent-skills/` directory.
- Use `using-agent-skills/SKILL.md` as the meta-skill to select the appropriate workflow:
  - Planning & Specs: `spec-driven-development`, `planning-and-task-breakdown`
  - Implementation: `incremental-implementation`, `frontend-ui-engineering`, `source-driven-development`
  - Code Review & Quality: `code-review-and-quality`, `code-simplification`
  - Documentation: `documentation-and-adrs`
  - Testing & Debugging: `test-driven-development`, `debugging-and-error-recovery`
- Enforce Core Operating Behaviors at all times:
  - Surface assumptions explicitly before implementing non-trivial changes.
  - Manage confusion actively; stop and present tradeoffs instead of guessing.
  - Maintain scope discipline: touch only what was requested.

## 2. Schema-First Verification
- Never construct Prisma payloads or seed data from memory.
- Verify exact model fields and enums directly against `prisma/schema.prisma` before executing database scripts.

## 3. Design System Invariants (`docs/design/LEADFORGE_DESIGN_SYSTEM.md`)
- **Backend Frozen:** Never modify `prisma/`, API routes, auth, or backend engines when working on the UI layer.
- **Zero AI Policy:** No sparkles, magic wands, "AI", or "smart" icons/labels. All scores and prices must be explainable.
- **Logical Properties Only:** Use RTL-first logical properties (`ps-*`, `pe-*`, `start-*`, `end-*`, `border-s`, `border-e`, `text-start`, `text-end`). Never use physical `ml/mr/pl/pr/left/right`.
- **Directional Icon Mirroring:** Directional icons must use `rtl:-scale-x-100`.
- **Palette Discipline:** Teal family (`--teal-50` to `--teal-900`) and warm neutrals only. No green, no purple, no gradients.
- **Numbers & Isolated Text:** Use Western digits (`ar-EG-u-nu-latn`) with `tabular-nums`. Wrap phone numbers, emails, and prices in `.ltr-iso`.

## 4. Design System Calibration & Phase Discipline
- **External Calibration Protocol:** When calibrating against external references, never alter spec tokens unilaterally. Log differences > 20% in `docs/design/OPEN_QUESTIONS.md`.
- **Living Style Guide Invariants:** The `/design-system` route must showcase every component in every state across both densities (`comfortable` and `compact`) and include interactive RTL/LTR toggles.
- **Phase Boundary Discipline:** Complete and verify Phase 4 style guide before modifying any production application routes in Phase 5.

