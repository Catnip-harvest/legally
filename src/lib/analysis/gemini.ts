import { GoogleGenAI } from "@google/genai";
import { buildAnalysisPrompt, SYSTEM_INSTRUCTION } from "./prompts";
import {
  modelResponseJsonSchema,
  modelResponseSchema,
  type AnalysisRequest,
  type ModelCandidate,
} from "./schema";

const REQUEST_TIMEOUT_MS = 45_000;

export async function extractCandidatesWithGemini(
  input: AnalysisRequest,
): Promise<{ candidates: ModelCandidate[]; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
  });

  const response = await ai.models.generateContent({
    model,
    contents: buildAnalysisPrompt(input),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.1,
      maxOutputTokens: 6_000,
      responseMimeType: "application/json",
      responseJsonSchema: modelResponseJsonSchema,
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    },
  });

  if (!response.text) {
    throw new Error("GEMINI_EMPTY_RESPONSE");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new Error("GEMINI_INVALID_JSON");
  }

  const validated = modelResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("GEMINI_SCHEMA_MISMATCH");
  }

  return { candidates: validated.data.candidates, model };
}
