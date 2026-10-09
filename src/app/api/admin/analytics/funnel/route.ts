import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  buildCsvDownloadResponse,
  exportAnalyticsCsv,
  getFunnelAndReasonAnalytics,
  handleAnalyticsApiError,
  isCsvRequested,
  parseAnalyticsFilters,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const filters = parseAnalyticsFilters(req);

    if (isCsvRequested(req)) {
      const csv = await exportAnalyticsCsv("funnel", filters, admin.id);
      return buildCsvDownloadResponse(csv, "sales_funnel");
    }

    const result = await getFunnelAndReasonAnalytics(filters);
    return NextResponse.json(result);
  } catch (err) {
    return handleAnalyticsApiError(err, "GET /api/admin/analytics/funnel");
  }
}
