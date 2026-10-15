/**
 * LeadForge Egypt / Leads4dev — Programmatic SEO Thresholds & Invariants
 */

export const MIN_LEADS_FOR_INDEXING = parseInt(
  process.env.MIN_LEADS_FOR_INDEXING || '10',
  10
);

export const EXCLUDED_CATEGORIES_FROM_INDEXING = ['other', 'Other'];

export function isProgrammaticPageEligible({
  leadCount,
  categorySlug,
}: {
  leadCount: number;
  categorySlug: string;
}): boolean {
  if (EXCLUDED_CATEGORIES_FROM_INDEXING.includes(categorySlug.toLowerCase())) {
    return false;
  }
  return leadCount >= MIN_LEADS_FOR_INDEXING;
}
