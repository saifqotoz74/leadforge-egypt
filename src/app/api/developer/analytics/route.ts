import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  getDeveloperOwnAnalytics,
  handleAnalyticsApiError,
  parseAnalyticsFilters,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const filters = parseAnalyticsFilters(req);

    const requestedDeveloperId =
      req.nextUrl.searchParams.get("developerId") ||
      req.nextUrl.searchParams.get("userId") ||
      filters.developerId;

    if (
      requestedDeveloperId &&
      requestedDeveloperId !== user.id &&
      user.role !== "ADMIN"
    ) {
      throw new AuthError(
        "غير مصرح لك بالاطلاع على تحليلات مطور آخر.",
        403
      );
    }

    const targetDeveloperId =
      user.role === "ADMIN" && requestedDeveloperId
        ? requestedDeveloperId
        : user.id;

    const result = await getDeveloperOwnAnalytics(targetDeveloperId, {
      ...filters,
      developerId: targetDeveloperId,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleAnalyticsApiError(err, "GET /api/developer/analytics");
  }
}
