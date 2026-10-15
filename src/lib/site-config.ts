/**
 * LeadForge Egypt / Leads4dev — Canonical Site Configuration
 *
 * Production host is standardized on: https://www.leads4dev.com
 * All canonical tags, sitemaps, OpenGraph URLs, hreflang alternates,
 * and structured data references must use SITE_URL.
 */

export const PRIMARY_HOST = 'www.leads4dev.com';
export const APEX_HOST = 'leads4dev.com';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  (process.env.NODE_ENV === 'production'
    ? `https://${PRIMARY_HOST}`
    : (process.env.NEXT_PUBLIC_APP_URL || `https://${PRIMARY_HOST}`))
).replace(/\/$/, '');
