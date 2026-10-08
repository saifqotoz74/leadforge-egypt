import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  buildCsvDownloadResponse,
  exportAnalyticsCsv,
  getDeveloperPerformanceAnalytics,
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
      const csv = await exportAnalyticsCsv("developers", filters, admin.id);
      return buildCsvDownloadResponse(csv, "developer_performance");
    }

    const result = await getDeveloperPerformanceAnalytics(filters);
    return NextResponse.json(result);
  } catch (err) {
    return handleAnalyticsApiError(err, "GET /api/admin/analytics/developers");
  }
}
