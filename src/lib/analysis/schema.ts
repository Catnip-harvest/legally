import { z } from "zod";

export const MAX_TRANSCRIPT_LENGTH = 40_000;

export const analysisRequestSchema = z
  .object({
    transcriptA: z
      .string()
      .trim()
      .min(40, "Earlier testimony is too short to analyze.")
      .max(MAX_TRANSCRIPT_LENGTH, "Earlier testimony exceeds 40,000 characters."),
    transcriptB: z
      .string()
      .trim()
      .min(40, "Later testimony is too short to analyze.")
      .max(MAX_TRANSCRIPT_LENGTH, "Later testimony exceeds 40,000 characters."),
    labelA: z.string().trim().min(1).max(80).default("Earlier testimony"),
    labelB: z.string().trim().min(1).max(80).default("Later testimony"),
  })
  .strict();

export const modelCandidateSchema = z
  .object({
    topic: z.string().trim().min(1).max(160),
    quoteA: z.string().trim().min(1).max(1_500),
    quoteB: z.string().trim().min(1).max(1_500),
    timeRefA: z.string().trim().min(1).max(100).nullable(),
    timeRefB: z.string().trim().min(1).max(100).nullable(),
    entitiesA: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
    entitiesB: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
    reconciliation: z.string().trim().max(600).nullable(),
    explanation: z.string().trim().min(1).max(900),
  })
  .strict();

export const modelResponseSchema = z
  .object({
    candidates: z.array(modelCandidateSchema).max(16),
  })
  .strict();

export const modelResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "topic",
          "quoteA",
          "quoteB",
          "timeRefA",
          "timeRefB",
          "entitiesA",
          "entitiesB",
          "reconciliation",
          "explanation",
        ],
        properties: {
          topic: {
            type: "string",
            description: "A short neutral label for the factual issue.",
          },
          quoteA: {
            type: "string",
            description: "A verbatim quotation copied from transcript A.",
          },
          quoteB: {
            type: "string",
            description: "A verbatim quotation copied from transcript B.",
          },
          timeRefA: {
            type: ["string", "null"],
            description: "The shortest time phrase in quote A, or null.",
          },
          timeRefB: {
            type: ["string", "null"],
            description: "The shortest time phrase in quote B, or null.",
          },
          entitiesA: {
            type: "array",
            items: { type: "string" },
            description: "Canonical people, objects, locations, and events in quote A.",
          },
          entitiesB: {
            type: "array",
            items: { type: "string" },
            description: "Canonical people, objects, locations, and events in quote B.",
          },
          reconciliation: {
            type: ["string", "null"],
            description:
              "A concise way both statements could be true, or null when none is reasonably available.",
          },
          explanation: {
            type: "string",
            description: "A concise evidence-focused explanation without a confidence score.",
          },
        },
      },
    },
  },
} as const;

export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export type ModelCandidate = z.infer<typeof modelCandidateSchema>;

export type Classification = "DIRECT" | "INFERENTIAL" | "FALSE_POSITIVE";
export type ReviewPriority = "HIGH" | "MEDIUM" | "LOW" | "DISMISS";

export type EvidenceReference = {
  quote: string;
  line: number | null;
  verified: boolean;
};

export type ConfidenceFactor = {
  label: string;
  detail: string;
  impact: number;
};

export type AnalysisResult = {
  id: string;
  topic: string;
  classification: Classification;
  confidence: number;
  confidenceLabel: "High" | "Moderate" | "Low";
  reviewPriority: ReviewPriority;
  explanation: string;
  reconciliation: string | null;
  evidenceA: EvidenceReference;
  evidenceB: EvidenceReference;
  factors: ConfidenceFactor[];
};

export type AnalysisPayload = {
  results: AnalysisResult[];
  summary: {
    direct: number;
    inferential: number;
    falsePositive: number;
    rejectedCandidates: number;
  };
  meta: {
    model: string;
    analyzedAt: string;
  };
};
