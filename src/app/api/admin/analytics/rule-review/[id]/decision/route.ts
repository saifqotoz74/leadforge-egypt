import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, verifyCsrfOrigin } from "@/lib/auth";
import {
  decideRuleReviewCandidate,
  handleAnalyticsApiError,
  RuleReviewStatusCode,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

const ALLOWED_DECISION_STATUSES: RuleReviewStatusCode[] = [
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "DEFERRED",
];

export async function POST(
  req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: "طلب غير صالح (CSRF)." }, { status: 403 });
    }
    const admin = await requireAdmin(req);
    const resolvedParams = await Promise.resolve(context.params);
    const candidateId = resolvedParams.id;

    const body = await req.json().catch(() => ({}));
    const rawStatus = String(body.status || body.decision || "").toUpperCase();

    if (!ALLOWED_DECISION_STATUSES.includes(rawStatus as RuleReviewStatusCode)) {
      return NextResponse.json(
        {
          error:
            "حالة القرار غير صالحة. القيم المسموحة: UNDER_REVIEW, APPROVED, REJECTED, DEFERRED.",
          code: "INVALID_DECISION_STATUS",
        },
        { status: 400 }
      );
    }

    const decisionNotes =
      typeof body.decisionNotes === "string"
        ? body.decisionNotes
        : typeof body.notes === "string"
          ? body.notes
          : undefined;

    const updated = await decideRuleReviewCandidate({
      candidateId,
      reviewerUserId: admin.id,
      status: rawStatus as "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "DEFERRED",
      decisionNotes,
    });

    return NextResponse.json({
      success: true,
      candidate: updated,
    });
  } catch (err) {
    return handleAnalyticsApiError(
      err,
      "POST /api/admin/analytics/rule-review/[id]/decision"
    );
  }
}
