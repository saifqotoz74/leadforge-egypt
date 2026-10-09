import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { applySecurityHeaders, recordSecuritySignal } from "@/lib/security";
import {
  buildCsvDownloadResponse,
  exportAnalyticsCsv,
  handleAnalyticsApiError,
  parseAnalyticsFilters,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

type ExportReportType =
  | "overview"
  | "leads"
  | "sources"
  | "niches"
  | "locations"
  | "services"
  | "developers"
  | "rules"
  | "data-quality"
  | "funnel"
  | "rule-review";

const VALID_REPORTS: ExportReportType[] = [
  "overview",
  "leads",
  "sources",
  "niches",
  "locations",
  "services",
  "developers",
  "rules",
  "data-quality",
  "funnel",
  "rule-review",
];

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const ipAddress = getClientIp(req.headers);

    const rl = checkRateLimit({
      key: `admin-analytics-export:${admin.id}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      await recordSecuritySignal({
        signalType: "EXCESSIVE_EXPORT_REQUESTS",
        userId: admin.id,
        ipAddress,
        details: { route: "/api/admin/analytics/export" },
      });
      return applySecurityHeaders(
        NextResponse.json(
          { error: "تم تجاوز الحد المسموح به لتصدير التقارير.", code: "RATE_LIMITED" },
          { status: 429 }
        )
      );
    }

    const filters = parseAnalyticsFilters(req);
    const rawReport = (
      req.nextUrl.searchParams.get("report") ||
      req.nextUrl.searchParams.get("type") ||
      "overview"
    ).toLowerCase();

    const report: ExportReportType = VALID_REPORTS.includes(
      rawReport as ExportReportType
    )
      ? (rawReport as ExportReportType)
      : "overview";

    const csv = await exportAnalyticsCsv(report, filters, admin.id);
    return applySecurityHeaders(buildCsvDownloadResponse(csv, report));
  } catch (err) {
    return handleAnalyticsApiError(err, "GET /api/admin/analytics/export");
  }
}
