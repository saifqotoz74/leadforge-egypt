import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { parseAnalyticsFiltersFromSearchParams } from "./time-dimensions";
import { AnalyticsEngineError, AnalyticsFilterInput } from "./types";

export function parseAnalyticsFilters(req: NextRequest): AnalyticsFilterInput {
  return parseAnalyticsFiltersFromSearchParams(req.nextUrl.searchParams);
}

export function isCsvRequested(req: NextRequest): boolean {
  const format = req.nextUrl.searchParams.get("format")?.toLowerCase();
  return format === "csv";
}

export function buildCsvDownloadResponse(csv: string, reportName: string): NextResponse {
  const safeName = reportName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const datePart = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leadforge_${safeName}_${datePart}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export function handleAnalyticsApiError(err: unknown, context: string): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  if (err instanceof AnalyticsEngineError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode }
    );
  }
  console.error(`${context} error:`, err);
  return NextResponse.json(
    { error: "تعذر معالجة طلب التحليلات." },
    { status: 500 }
  );
}
