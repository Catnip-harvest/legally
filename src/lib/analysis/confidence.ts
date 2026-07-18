import type {
  AnalysisPayload,
  AnalysisResult,
  Classification,
  EvidenceReference,
  ModelCandidate,
  ReviewPriority,
} from "./schema";
import {
  scoreContradiction,
  type CandidatePair,
  type ScoredContradiction,
} from "./scoring-engine";

function normalizeWhitespace(value: string) {
  return value.replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}

export function locateQuote(transcript: string, quote: string): EvidenceReference {
  const trimmedQuote = quote.trim();
  const exactIndex = transcript.indexOf(trimmedQuote);

  if (exactIndex >= 0) {
    return {
      quote: trimmedQuote,
      line: transcript.slice(0, exactIndex).split("\n").length,
      verified: true,
    };
  }

  const normalizedQuote = normalizeWhitespace(trimmedQuote);
  const lines = transcript.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const normalizedLine = normalizeWhitespace(lines[index]);
    if (
      normalizedLine === normalizedQuote ||
      (normalizedQuote.length >= 24 && normalizedLine.includes(normalizedQuote))
    ) {
      return { quote: lines[index].trim(), line: index + 1, verified: true };
    }
  }

  return { quote: trimmedQuote, line: null, verified: false };
}

function confidenceLabel(confidence: number): AnalysisResult["confidenceLabel"] {
  if (confidence >= 75) return "High";
  if (confidence >= 45) return "Moderate";
  return "Low";
}

function reviewPriority(
  classification: Classification,
  confidence: number,
): ReviewPriority {
  if (classification === "FALSE_POSITIVE") return "DISMISS";
  if (classification === "DIRECT" && confidence >= 50) return "HIGH";
  if (classification === "INFERENTIAL" && confidence >= 50) return "MEDIUM";
  return "LOW";
}

async function evaluateWithDisposition(
  candidate: ModelCandidate,
  transcriptA: string,
  transcriptB: string,
  index: number,
) {
  const pair: CandidatePair = {
    topic: candidate.topic,
    claimA: {
      text: candidate.quoteA,
      timeRef: candidate.timeRefA,
      entities: candidate.entitiesA,
    },
    claimB: {
      text: candidate.quoteB,
      timeRef: candidate.timeRefB,
      entities: candidate.entitiesB,
    },
    explanation: candidate.explanation,
    reconciliation: candidate.reconciliation,
  };
  const scored = await scoreContradiction(pair);
  const classification: Classification =
    scored.type === "DISCARDED" ? "FALSE_POSITIVE" : scored.type;
  const evidenceA = locateQuote(transcriptA, candidate.quoteA);
  const evidenceB = locateQuote(transcriptB, candidate.quoteB);

  const result: AnalysisResult = {
    id: `finding-${index + 1}`,
    topic: candidate.topic,
    classification,
    confidence: scored.confidence,
    confidenceLabel: confidenceLabel(scored.confidence),
    reviewPriority: reviewPriority(classification, scored.confidence),
    explanation: candidate.explanation,
    reconciliation: candidate.reconciliation,
    evidenceA,
    evidenceB,
    factors: scored.factors,
  };

  return { result, scored };
}

export async function evaluateCandidate(
  candidate: ModelCandidate,
  transcriptA: string,
  transcriptB: string,
  index = 0,
): Promise<AnalysisResult> {
  return (await evaluateWithDisposition(candidate, transcriptA, transcriptB, index)).result;
}

const CLASSIFICATION_ORDER: Record<Classification, number> = {
  DIRECT: 0,
  INFERENTIAL: 1,
  FALSE_POSITIVE: 2,
};

function isDisplayable(
  evaluated: { result: AnalysisResult; scored: ScoredContradiction },
) {
  return (
    !evaluated.scored.discarded &&
    evaluated.result.evidenceA.verified &&
    evaluated.result.evidenceB.verified
  );
}

export async function buildAnalysisPayload(
  candidates: ModelCandidate[],
  transcriptA: string,
  transcriptB: string,
  model: string,
): Promise<AnalysisPayload> {
  const evaluated = await Promise.all(
    candidates.map((candidate, index) =>
      evaluateWithDisposition(candidate, transcriptA, transcriptB, index),
    ),
  );
  const results = evaluated
    .filter(isDisplayable)
    .map(({ result }) => result)
    .sort(
      (left, right) =>
        CLASSIFICATION_ORDER[left.classification] -
          CLASSIFICATION_ORDER[right.classification] ||
        right.confidence - left.confidence,
    );

  return {
    results,
    summary: {
      direct: results.filter((result) => result.classification === "DIRECT").length,
      inferential: results.filter((result) => result.classification === "INFERENTIAL")
        .length,
      falsePositive: results.filter(
        (result) => result.classification === "FALSE_POSITIVE",
      ).length,
      rejectedCandidates: evaluated.length - results.length,
    },
    meta: {
      model,
      analyzedAt: new Date().toISOString(),
    },
  };
}
