/**
 * LeadForge Egypt — Analytics Funnel Client-Side Dispatcher
 * Client-safe: zero server/Prisma/DB dependencies.
 */

export type FunnelEventType =
  | 'page_view'
  | 'register_start'
  | 'register_complete'
  | 'first_free_lead_viewed'
  | 'first_purchase'
  | 'plan_upgrade';

export interface FunnelEventPayload {
  event: FunnelEventType;
  userId?: string | null;
  anonymousId?: string;
  path?: string;
  properties?: Record<string, any>;
  timestamp?: string;
}

/**
 * Client-side tracking dispatcher.
 * Dispatches a custom DOM event and sends an asynchronous beacon/fetch to /api/analytics/track.
 */
export function trackFunnelEvent(
  event: FunnelEventType,
  properties?: Record<string, any>
): void {
  if (typeof window === 'undefined') return;

  // Retrieve or create anonymous ID for session tracking
  let anonymousId = localStorage.getItem('leadforge_anon_id');
  if (!anonymousId) {
    anonymousId = 'anon_' + Math.random().toString(36).substring(2, 12);
    try {
      localStorage.setItem('leadforge_anon_id', anonymousId);
    } catch {
      // Storage unavailable, ignore
    }
  }

  const payload: FunnelEventPayload = {
    event,
    anonymousId,
    path: window.location.pathname,
    properties: properties || {},
    timestamp: new Date().toISOString(),
  };

  // Dispatch custom browser event for in-app listeners / debug tools
  try {
    window.dispatchEvent(
      new CustomEvent('leadforge:analytics', { detail: payload })
    );
  } catch {
    // Ignore in older environments
  }

  // Send non-blocking payload to backend tracking endpoint
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/track', JSON.stringify(payload));
    } else {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Analytics failure should never break user experience
  }
}
