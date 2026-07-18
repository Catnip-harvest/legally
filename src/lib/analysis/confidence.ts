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

function normalizeForEvidenceMatch(value: string) {
  return value
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, "");
}

type TranscriptLine = {
  text: string;
  sourceLine: number;
  kind: "QUESTION" | "ANSWER" | "CONTINUATION" | "PLAIN" | "BLANK";
};

function parseTranscriptLine(rawLine: string, physicalLine: number): TranscriptLine {
  const numbered = rawLine.match(/^\s*Line\s+(\d+)\s*(?:(Q|A):\s*)?(.*)$/i);
  if (numbered) {
    return {
      text: numbered[3].trim(),
      sourceLine: Number(numbered[1]),
      kind:
        numbered[2]?.toUpperCase() === "Q"
          ? "QUESTION"
          : numbered[2]?.toUpperCase() === "A"
            ? "ANSWER"
            : "CONTINUATION",
    };
  }

  const speaker = rawLine.match(/^\s*(Q|A):\s*(.*)$/i);
  if (speaker) {
    return {
      text: speaker[2].trim(),
      sourceLine: physicalLine,
      kind: speaker[1].toUpperCase() === "Q" ? "QUESTION" : "ANSWER",
    };
  }

  const depositionSpeaker = rawLine.match(
    /^\s*((?:(?:THE\s+)?(?:WITNESS|DEPONENT|COURT|COURT\s+REPORTER|EXAMINER))|(?:(?:MR|MRS|MS|DR)\.\s+[A-Z][A-Z'’-]*(?:\s+[A-Z][A-Z'’-]*)*)):\s*(.*)$/i,
  );
  if (depositionSpeaker) {
    const label = depositionSpeaker[1].toUpperCase();
    const isWitness = /\b(?:WITNESS|DEPONENT)\b/.test(label);
    return {
      text: depositionSpeaker[2].trim(),
      sourceLine: physicalLine,
      kind: isWitness ? "ANSWER" : "QUESTION",
    };
  }

  const text = rawLine.trim();
  return {
    text,
    sourceLine: physicalLine,
    kind: text ? "PLAIN" : "BLANK",
  };
}

function parseTranscriptLines(transcript: string) {
  let activeSpeaker: "QUESTION" | "ANSWER" | null = null;

  return transcript.split(/\r?\n/).map((rawLine, index) => {
    const parsed = parseTranscriptLine(rawLine, index + 1);
    if (parsed.kind === "BLANK") {
      activeSpeaker = null;
      return parsed;
    }
    if (parsed.kind === "QUESTION" || parsed.kind === "ANSWER") {
      activeSpeaker = parsed.kind;
      return parsed;
    }
    if (parsed.kind === "CONTINUATION") {
      return activeSpeaker === "QUESTION" ? { ...parsed, kind: "QUESTION" as const } : parsed;
    }
    if (activeSpeaker === "ANSWER") {
      return { ...parsed, kind: "CONTINUATION" as const };
    }
    if (activeSpeaker === "QUESTION") {
      return { ...parsed, kind: "QUESTION" as const };
    }
    return parsed;
  });
}

function normalizedMatch(candidate: string, quote: string) {
  const normalizedCandidate = normalizeForEvidenceMatch(candidate);
  const normalizedQuote = normalizeForEvidenceMatch(quote);
  return (
    normalizedCandidate === normalizedQuote ||
    (normalizedQuote.length >= 24 && normalizedCandidate.includes(normalizedQuote))
  );
}

export function locateQuote(transcript: string, quote: string): EvidenceReference {
  const trimmedQuote = quote.trim();
  const exactIndex = transcript.indexOf(trimmedQuote);

  if (exactIndex >= 0) {
    const physicalLine = transcript.slice(0, exactIndex).split("\n").length;
    const rawLine = transcript.split(/\r?\n/)[physicalLine - 1] ?? "";
    return {
      quote: trimmedQuote,
      line: parseTranscriptLine(rawLine, physicalLine).sourceLine,
      verified: true,
    };
  }

  const lines = parseTranscriptLines(transcript);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.kind === "BLANK" || line.kind === "QUESTION") continue;

    let combined = line.text;
    if (normalizedMatch(combined, trimmedQuote)) {
      return { quote: trimmedQuote, line: line.sourceLine, verified: true };
    }

    if (line.kind !== "ANSWER" && line.kind !== "CONTINUATION") continue;
    for (
      let continuationIndex = index + 1;
      continuationIndex < lines.length;
      continuationIndex += 1
    ) {
      const continuation = lines[continuationIndex];
      if (continuation.kind !== "CONTINUATION") break;
      combined = `${combined} ${continuation.text}`;
      if (normalizedMatch(combined, trimmedQuote)) {
        return { quote: trimmedQuote, line: line.sourceLine, verified: true };
      }
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
