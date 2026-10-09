import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  buildCsvDownloadResponse,
  exportAnalyticsCsv,
  getRulePerformanceAnalytics,
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
      const csv = await exportAnalyticsCsv("rules", filters, admin.id);
      return buildCsvDownloadResponse(csv, "rule_performance");
    }

    const result = await getRulePerformanceAnalytics(filters);
    return NextResponse.json(result);
  } catch (err) {
    return handleAnalyticsApiError(err, "GET /api/admin/analytics/rules");
  }
}
