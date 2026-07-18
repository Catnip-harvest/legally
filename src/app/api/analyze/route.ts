import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { buildAnalysisPayload } from "@/lib/analysis/confidence";
import { extractCandidatesWithGemini } from "@/lib/analysis/gemini";
import { analysisRequestSchema } from "@/lib/analysis/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 100_000) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "The submitted transcripts are too large.");
  }

  try {
    const input = analysisRequestSchema.parse(await request.json());
    const extraction = await extractCandidatesWithGemini(input);
    const payload = await buildAnalysisPayload(
      extraction.candidates,
      input.transcriptA,
      input.transcriptB,
      extraction.model,
    );

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse(
        400,
        "INVALID_REQUEST",
        "Provide two valid transcripts between 40 and 40,000 characters each.",
      );
    }

    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("[analysis-provider-error]", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: message.slice(0, 500),
    });
    if (message === "GEMINI_API_KEY_MISSING") {
      return errorResponse(503, "SERVICE_NOT_CONFIGURED", "Analysis is not configured.");
    }
    if (/429|RESOURCE_EXHAUSTED/i.test(message)) {
      return errorResponse(429, "RATE_LIMITED", "Gemini is busy. Please retry shortly.");
    }
    if (/401|403|API.?KEY|PERMISSION_DENIED/i.test(message)) {
      return errorResponse(502, "MODEL_AUTH_ERROR", "The model provider rejected the request.");
    }
    if (/timeout|timed out|abort/i.test(message)) {
      return errorResponse(504, "MODEL_TIMEOUT", "Analysis took too long. Please retry.");
    }
    if (/GEMINI_(EMPTY_RESPONSE|INVALID_JSON|SCHEMA_MISMATCH)/.test(message)) {
      return errorResponse(
        502,
        "INVALID_MODEL_RESPONSE",
        "The model returned evidence in an unexpected format. Please retry.",
      );
    }

    return errorResponse(500, "ANALYSIS_FAILED", "Analysis failed unexpectedly. Please retry.");
  }
}
