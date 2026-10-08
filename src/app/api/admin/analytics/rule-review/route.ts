import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, verifyCsrfOrigin } from "@/lib/auth";
import {
  buildCsvDownloadResponse,
  createRuleReviewCandidate,
  exportAnalyticsCsv,
  generateDeterministicRuleReviewCandidates,
  getRuleReviewCandidates,
  handleAnalyticsApiError,
  isCsvRequested,
  parseAnalyticsFilters,
  RuleReviewStatusCode,
  RuleReviewTypeCode,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

const VALID_RULE_TYPES: RuleReviewTypeCode[] = ["SCORING", "MATCHING", "QUALITY"];
const VALID_RULE_STATUSES: RuleReviewStatusCode[] = [
  "OPEN",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "DEFERRED",
];

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const filters = parseAnalyticsFilters(req);

    if (isCsvRequested(req)) {
      const csv = await exportAnalyticsCsv("rule-review", filters);
      return buildCsvDownloadResponse(csv, "rule_review_candidates");
    }

    const rawStatus = req.nextUrl.searchParams.get("status")?.toUpperCase();
    const rawRuleType = req.nextUrl.searchParams.get("ruleType")?.toUpperCase();

    const status = VALID_RULE_STATUSES.includes(rawStatus as RuleReviewStatusCode)
      ? (rawStatus as RuleReviewStatusCode)
      : undefined;
    const ruleType = VALID_RULE_TYPES.includes(rawRuleType as RuleReviewTypeCode)
      ? (rawRuleType as RuleReviewTypeCode)
      : undefined;

    const result = await getRuleReviewCandidates({
      status,
      ruleType,
      page: filters.page,
      pageSize: filters.pageSize,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleAnalyticsApiError(err, "GET /api/admin/analytics/rule-review");
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: "طلب غير صالح (CSRF)." }, { status: 403 });
    }
    const admin = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    if (body.action === "generate" || !body.ruleKey) {
      const filters = parseAnalyticsFilters(req);
      const generated = await generateDeterministicRuleReviewCandidates(filters);
      return NextResponse.json({
        success: true,
        mode: "GENERATED",
        ...generated,
      });
    }

    const rawRuleType = String(body.ruleType || "SCORING").toUpperCase();
    const ruleType: RuleReviewTypeCode = VALID_RULE_TYPES.includes(
      rawRuleType as RuleReviewTypeCode
    )
      ? (rawRuleType as RuleReviewTypeCode)
      : "SCORING";

    const candidate = await createRuleReviewCandidate({
      ruleType,
      ruleKey: String(body.ruleKey),
      version: String(body.version || "v2.0.0-p4"),
      cohortFilter:
        body.cohortFilter && typeof body.cohortFilter === "object"
          ? body.cohortFilter
          : {},
      sampleSize: Number(body.sampleSize ?? 0),
      baselineRate: Number(body.baselineRate ?? 0),
      observedRate: Number(body.observedRate ?? 0),
      deltaRate:
        body.deltaRate !== undefined
          ? Number(body.deltaRate)
          : Number(body.observedRate ?? 0) - Number(body.baselineRate ?? 0),
      evidenceSummary: String(body.evidenceSummary || ""),
      suggestedAction: String(body.suggestedAction || ""),
      createdByUserId: admin.id,
    });

    return NextResponse.json(
      {
        success: true,
        mode: "CREATED",
        candidate,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleAnalyticsApiError(err, "POST /api/admin/analytics/rule-review");
  }
}
