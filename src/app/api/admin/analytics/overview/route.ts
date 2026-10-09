import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, verifyCsrfOrigin } from "@/lib/auth";
import {
  buildCsvDownloadResponse,
  exportAnalyticsCsv,
  getDailyMetricSnapshots,
  getExecutiveAnalyticsOverview,
  handleAnalyticsApiError,
  isCsvRequested,
  materializeDailyMetricSnapshot,
  parseAnalyticsFilters,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const filters = parseAnalyticsFilters(req);

    if (isCsvRequested(req)) {
      const csv = await exportAnalyticsCsv("overview", filters, admin.id);
      return buildCsvDownloadResponse(csv, "executive_overview");
    }

    const [overview, snapshots] = await Promise.all([
      getExecutiveAnalyticsOverview(filters),
      getDailyMetricSnapshots({ limit: 60 }),
    ]);

    return NextResponse.json({
      ...overview,
      dailySnapshots: snapshots,
    });
  } catch (err) {
    return handleAnalyticsApiError(err, "GET /api/admin/analytics/overview");
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: "طلب غير صالح (CSRF)." }, { status: 403 });
    }
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const dateKey = typeof body.dateKey === "string" ? body.dateKey : undefined;

    const snapshotResult = await materializeDailyMetricSnapshot(dateKey);
    return NextResponse.json({
      success: true,
      ...snapshotResult,
    });
  } catch (err) {
    return handleAnalyticsApiError(err, "POST /api/admin/analytics/overview");
  }
}
