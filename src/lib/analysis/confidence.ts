import type {
  AnalysisPayload,
  AnalysisResult,
  CandidateRelation,
  Classification,
  ConfidenceFactor,
  EvidenceReference,
  ModelCandidate,
  ReviewPriority,
} from "./schema";

const DIRECT_RELATIONS: CandidateRelation[] = [
  "explicit_negation",
  "exclusive_values",
];
const INFERENTIAL_RELATIONS: CandidateRelation[] = [
  "jointly_impossible",
  "timeline_conflict",
];
const FALSE_POSITIVE_RELATIONS: CandidateRelation[] = [
  "compatible",
  "scope_mismatch",
  "insufficient_context",
];

const HEDGE_PATTERN =
  /\b(about|approximately|around|could|guess|i think|maybe|might|possibly|roughly|somewhere|to my recollection)\b/gi;
const ABSOLUTE_PATTERN =
  /\b(all (?:day|evening|night)|always|cannot|can't|did not|didn't|never|no one|nobody|none|was not|wasn't)\b/i;
const APPROXIMATE_TIME_PATTERN =
  /\b(about|approximately|around|maybe|roughly|somewhere)\b/i;

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

function countHedges(text: string) {
  return new Set(text.toLowerCase().match(HEDGE_PATTERN) ?? []).size;
}

function parseClockTimes(text: string) {
  const values: number[] = [];
  const lowered = text.toLowerCase();

  if (/\bmidnight\b/.test(lowered)) values.push(0);
  if (/\bnoon\b/.test(lowered)) values.push(12 * 60);

  const hasTimeContext =
    /\b(at|around|about|approximately|before|after|until|by|am|pm|a\.m\.|p\.m\.)\b/i.test(
      text,
    ) || /\b\d{1,2}:\d{2}\b/.test(text);

  if (!hasTimeContext) return values;

  const pattern = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    const meridiem = match[3]?.replaceAll(".", "").toLowerCase();

    if (hour > 23 || minute > 59) continue;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    values.push(hour * 60 + minute);
  }

  return [...new Set(values)];
}

export function isWithinApproximateTimeTolerance(quoteA: string, quoteB: string) {
  if (
    !APPROXIMATE_TIME_PATTERN.test(quoteA) &&
    !APPROXIMATE_TIME_PATTERN.test(quoteB)
  ) {
    return false;
  }

  const timesA = parseClockTimes(quoteA);
  const timesB = parseClockTimes(quoteB);
  if (!timesA.length || !timesB.length) return false;

  const closestDifference = Math.min(
    ...timesA.flatMap((timeA) =>
      timesB.map((timeB) => {
        const difference = Math.abs(timeA - timeB);
        return Math.min(difference, 24 * 60 - difference);
      }),
    ),
  );

  return closestDifference <= 15;
}

function classifyCandidate(
  candidate: ModelCandidate,
  withinTimeTolerance: boolean,
): Classification {
  if (withinTimeTolerance || FALSE_POSITIVE_RELATIONS.includes(candidate.relation)) {
    return "FALSE_POSITIVE";
  }

  if (DIRECT_RELATIONS.includes(candidate.relation)) {
    const hedgedReconciliation =
      Boolean(candidate.reconciliation) &&
      countHedges(`${candidate.quoteA} ${candidate.quoteB}`) > 0;
    if (!candidate.sameSubject || hedgedReconciliation) {
      return "FALSE_POSITIVE";
    }
    if (
      candidate.relation === "explicit_negation" &&
      (ABSOLUTE_PATTERN.test(candidate.quoteA) || ABSOLUTE_PATTERN.test(candidate.quoteB))
    ) {
      return "DIRECT";
    }
    if (!candidate.sameScope) return "FALSE_POSITIVE";
    return "DIRECT";
  }

  if (INFERENTIAL_RELATIONS.includes(candidate.relation)) {
    if (!candidate.sameSubject || !candidate.sameEvent || !candidate.sameScope) {
      return "FALSE_POSITIVE";
    }
    if (ABSOLUTE_PATTERN.test(candidate.quoteA) || ABSOLUTE_PATTERN.test(candidate.quoteB)) {
      return "DIRECT";
    }
    return "INFERENTIAL";
  }
  return "FALSE_POSITIVE";
}

function addFactor(
  factors: ConfidenceFactor[],
  label: string,
  detail: string,
  impact: number,
) {
  factors.push({ label, detail, impact });
}

function confidenceFor(
  candidate: ModelCandidate,
  classification: Classification,
  evidenceA: EvidenceReference,
  evidenceB: EvidenceReference,
  withinTimeTolerance: boolean,
) {
  const factors: ConfidenceFactor[] = [];
  addFactor(
    factors,
    "Policy baseline",
    `Starting weight for a ${classification.toLowerCase().replace("_", " ")} classification.`,
    15,
  );

  addFactor(
    factors,
    "Earlier quotation",
    evidenceA.verified
      ? "The quotation was located in the supplied testimony."
      : "The quotation could not be located verbatim.",
    evidenceA.verified ? 15 : 0,
  );
  addFactor(
    factors,
    "Later quotation",
    evidenceB.verified
      ? "The quotation was located in the supplied testimony."
      : "The quotation could not be located verbatim.",
    evidenceB.verified ? 15 : 0,
  );

  if (classification === "FALSE_POSITIVE") {
    const relationFits = FALSE_POSITIVE_RELATIONS.includes(candidate.relation);
    addFactor(
      factors,
      "Compatibility signal",
      relationFits
        ? "The extracted relation indicates compatibility, scope mismatch, or insufficient context."
        : "The extracted relation initially suggested a contradiction.",
      relationFits ? 20 : 5,
    );

    const mismatchSignals = [
      !candidate.sameSubject,
      !candidate.sameEvent,
      !candidate.sameScope,
      withinTimeTolerance,
      Boolean(candidate.reconciliation),
    ].filter(Boolean).length;
    addFactor(
      factors,
      "Reconciliation checks",
      withinTimeTolerance
        ? "The stated times fall within the 15-minute tolerance for approximate language."
        : mismatchSignals
          ? "At least one scope, event, subject, or reconciliation check prevents a clean contradiction."
          : "No additional compatibility signal was found.",
      withinTimeTolerance ? 25 : Math.min(25, mismatchSignals * 8),
    );

    if (candidate.sameSubject && candidate.sameEvent) {
      addFactor(
        factors,
        "Useful comparison",
        "The statements still concern the same subject and event, making the near miss reviewable.",
        10,
      );
    }
  } else {
    addFactor(
      factors,
      "Same subject",
      candidate.sameSubject
        ? "Both statements concern the same person or object."
        : "The subjects do not align.",
      candidate.sameSubject ? 6 : 0,
    );
    addFactor(
      factors,
      "Same event",
      candidate.sameEvent
        ? "Both statements concern the same event or occurrence."
        : "The event scopes do not align.",
      candidate.sameEvent ? 6 : 0,
    );
    addFactor(
      factors,
      "Same scope",
      candidate.sameScope
        ? "The geographic, temporal, and factual scopes align."
        : "The statements use materially different scopes.",
      candidate.sameScope ? 6 : 0,
    );

    const expectedRelations =
      classification === "DIRECT" ? DIRECT_RELATIONS : INFERENTIAL_RELATIONS;
    const absolutePolicyOverride =
      classification === "DIRECT" &&
      INFERENTIAL_RELATIONS.includes(candidate.relation) &&
      (ABSOLUTE_PATTERN.test(candidate.quoteA) || ABSOLUTE_PATTERN.test(candidate.quoteB));
    const relationFits =
      expectedRelations.includes(candidate.relation) || absolutePolicyOverride;
    addFactor(
      factors,
      "Relation strength",
      absolutePolicyOverride
        ? "An absolute claim converts the extracted incompatibility into a direct policy match."
        : relationFits
          ? `The extracted relation matches the ${classification.toLowerCase()} policy.`
          : "The extracted relation does not match the classification policy.",
      relationFits ? 20 : 0,
    );

    const localSupport =
      classification === "DIRECT"
        ? ABSOLUTE_PATTERN.test(candidate.quoteA) || ABSOLUTE_PATTERN.test(candidate.quoteB)
        : parseClockTimes(candidate.quoteA).length > 0 ||
          parseClockTimes(candidate.quoteB).length > 0;
    addFactor(
      factors,
      "Textual support",
      localSupport
        ? classification === "DIRECT"
          ? "The testimony contains an absolute or negative formulation."
          : "The testimony contains a locally detected timeline signal."
        : "No additional rule-based textual marker was detected.",
      localSupport ? 10 : 4,
    );

    const hedgeCount = countHedges(`${candidate.quoteA} ${candidate.quoteB}`);
    if (hedgeCount > 0) {
      addFactor(
        factors,
        "Imprecision penalty",
        "Approximate or hedged language reduces classification certainty.",
        -Math.min(12, hedgeCount * 4),
      );
    }

    if (candidate.reconciliation) {
      addFactor(
        factors,
        "Reconciliation penalty",
        "A plausible reconciliation was identified and requires human review.",
        -10,
      );
    }
  }

  const confidence = Math.max(
    0,
    Math.min(99, factors.reduce((total, factor) => total + factor.impact, 0)),
  );

  return { confidence, factors };
}

function confidenceLabel(confidence: number): AnalysisResult["confidenceLabel"] {
  if (confidence >= 80) return "High";
  if (confidence >= 60) return "Moderate";
  return "Low";
}

function reviewPriority(
  classification: Classification,
  confidence: number,
): ReviewPriority {
  if (classification === "FALSE_POSITIVE") return "DISMISS";
  if (classification === "DIRECT" && confidence >= 75) return "HIGH";
  if (classification === "INFERENTIAL" && confidence >= 65) return "MEDIUM";
  return "LOW";
}

export function evaluateCandidate(
  candidate: ModelCandidate,
  transcriptA: string,
  transcriptB: string,
  index = 0,
): AnalysisResult {
  const evidenceA = locateQuote(transcriptA, candidate.quoteA);
  const evidenceB = locateQuote(transcriptB, candidate.quoteB);
  const withinTimeTolerance = isWithinApproximateTimeTolerance(
    candidate.quoteA,
    candidate.quoteB,
  );
  const classification = classifyCandidate(candidate, withinTimeTolerance);
  const { confidence, factors } = confidenceFor(
    candidate,
    classification,
    evidenceA,
    evidenceB,
    withinTimeTolerance,
  );

  return {
    id: `finding-${index + 1}`,
    topic: candidate.topic,
    classification,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    reviewPriority: reviewPriority(classification, confidence),
    explanation: candidate.explanation,
    reconciliation: candidate.reconciliation,
    evidenceA,
    evidenceB,
    factors,
  };
}

const CLASSIFICATION_ORDER: Record<Classification, number> = {
  DIRECT: 0,
  INFERENTIAL: 1,
  FALSE_POSITIVE: 2,
};

export function buildAnalysisPayload(
  candidates: ModelCandidate[],
  transcriptA: string,
  transcriptB: string,
  model: string,
): AnalysisPayload {
  const evaluated = candidates.map((candidate, index) =>
    evaluateCandidate(candidate, transcriptA, transcriptB, index),
  );
  const results = evaluated
    .filter((result) => result.evidenceA.verified && result.evidenceB.verified)
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
