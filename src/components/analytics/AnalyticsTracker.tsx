'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackFunnelEvent } from '@/lib/analytics/funnel-client';

export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;
    trackFunnelEvent('page_view', { path: pathname });
  }, [pathname]);

  return null;
}
