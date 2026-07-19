import { parseDate } from "chrono-node";
import { cosineSimilarity, embedText } from "./embeddings";
import type { Classification, ConfidenceFactor } from "./schema";

/**
 * Every threshold and weight used by the deterministic scoring policy.
 * Keep policy changes here so they are reviewable, testable, and tunable.
 */
export const SCORING_CONFIG = Object.freeze({
  MIN_OVERLAP_THRESHOLD: 0.2,
  FALSE_POSITIVE_MINUTES: 15,
  // Revisit this threshold against attorney-labeled data now that MiniLM replaces
  // feature hashing; it is intentionally unchanged in the embedding-source swap.
  DIRECT_SIM_THRESHOLD: 0.05,
  CONTRADICTION_MINUTES: 45,
  TIME_CERTAINTY_BONUS: 1,
  AMBIGUOUS_TIME_CERTAINTY_BONUS: 0.5,
  WEIGHTS: Object.freeze({
    semanticSimilarity: 0.35,
    entityOverlap: 0.25,
    polarityOpposite: 0.25,
    parseableTimes: 0.22,
    hedgePenalty: 0.08,
  }),
});

export type CandidateClaim = {
  text: string;
  timeRef: string | null;
  entities: string[];
  /** Optional precomputed vector; the normal scoring path embeds text with MiniLM. */
  embedding?: number[] | Float32Array;
};

export type CandidatePair = {
  topic: string;
  claimA: CandidateClaim;
  claimB: CandidateClaim;
  explanation: string;
  reconciliation: string | null;
};

export type ScoringFeatures = {
  semanticSimilarity: number;
  timeDeltaMinutes: number | null;
  hedgeLanguageDetected: boolean;
  entityOverlapScore: number;
  polarityOpposite: boolean;
  requiresInference: boolean;
  hasParseableTimes: boolean;
  timeReferenceAmbiguous: boolean;
  timeCertaintyScore: number;
};

export type ScoredContradiction = {
  pair: CandidatePair;
  type: Classification | "DISCARDED";
  discarded: boolean;
  confidence: number;
  features: ScoringFeatures;
  factors: ConfidenceFactor[];
};

const FIXED_TIME_REFERENCE = new Date(2000, 0, 1, 12, 0, 0, 0);
const HEDGE_PATTERN =
  /(?:\b(?:about|approximately|around|close to|i believe|i guess|i think|maybe|might|not sure|or so|perhaps|possibly|roughly|want to say)\b|\b(?:do not|don't) (?:recall|remember)\b|\b\w+-ish\b)/i;
const NEGATION_PATTERN =
  /\b(?:cannot|can't|did not|didn't|does not|doesn't|never|no|no one|nobody|none|nothing|not|was not|wasn't|were not|weren't|without)\b/i;
const UNIVERSAL_LOCATION_PATTERN =
  /(?:\b(?:all|entire)\s+(?:day|evening|night)\b.*\b(?:home|house|inside)\b|\b(?:home|house|inside)\b.*\b(?:all|entire)\s+(?:day|evening|night)\b)/i;
const STAYED_LOCATION_PATTERN =
  /\b(?:home|house|inside)\b.{0,100}\b(?:did not|didn't|never)\s+(?:leave|go out|step out)\b/i;
const DEPARTURE_PATTERN =
  /\b(?:drove away|leave|left|stepped out|went out|went to (?:get|buy|pick up))\b/i;
const KNOWLEDGE_DENIAL_PATTERN =
  /\b(?:never|not|didn't|did not)\b.{0,35}\b(?:heard|knew|know|familiar)\b/i;
const KNOWLEDGE_AFFIRMATION_PATTERN =
  /\b(?:had heard|heard of|knew|know of|familiar with)\b/i;

const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "as",
  "at",
  "be",
  "before",
  "but",
  "did",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "him",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "she",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "with",
]);

const TOKEN_CANONICALIZATION: Record<string, string> = {
  apartment: "location",
  awake: "sleep",
  bed: "sleep",
  bedtime: "sleep",
  familiar: "knowledge",
  heard: "knowledge",
  home: "location",
  house: "location",
  knew: "knowledge",
  know: "knowledge",
  knowing: "knowledge",
  leave: "location",
  left: "location",
  out: "location",
  outside: "location",
  slept: "sleep",
  sleeping: "sleep",
  stepped: "location",
  went: "location",
};

const PREDICATE_CANONICALIZATION: Record<string, string> = {
  approval: "approve",
  approve: "approve",
  approved: "approve",
  approves: "approve",
  approving: "approve",
  inspect: "inspect",
  inspected: "inspect",
  inspecting: "inspect",
  inspection: "inspect",
  inspections: "inspect",
  sign: "sign",
  "sign-off": "sign",
  signed: "sign",
  "signed-off": "sign",
  signing: "sign",
  signs: "sign",
  signature: "sign",
  signatures: "sign",
};

const MONTH_NUMBER: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function tokenize(text: string) {
  return (text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)?/g) ?? [])
    .map((token) => TOKEN_CANONICALIZATION[token] ?? token)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function sharedPredicate(textA: string, textB: string) {
  const predicateRoots = (text: string) =>
    new Set(
      (text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)?/g) ?? [])
        .map((token) => PREDICATE_CANONICALIZATION[token])
        .filter((token): token is string => Boolean(token)),
    );
  const rootsA = predicateRoots(textA);
  const rootsB = predicateRoots(textB);
  return [...rootsA].some((root) => rootsB.has(root));
}

function calendarDateScopes(claim: CandidateClaim) {
  const value = `${claim.text} ${claim.timeRef ?? ""} ${claim.entities.join(" ")}`;
  const scopes = new Set<string>();
  const pattern =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    scopes.add(`${MONTH_NUMBER[match[1].toLowerCase()]}-${Number(match[2])}`);
  }
  return scopes;
}

function hasDistinctCalendarDateScopes(pair: CandidatePair) {
  const scopesA = calendarDateScopes(pair.claimA);
  const scopesB = calendarDateScopes(pair.claimB);
  if (!scopesA.size || !scopesB.size) return false;
  return ![...scopesA].some((scope) => scopesB.has(scope));
}

function normalizeEntity(entity: string) {
  return entity
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function entityOverlap(entitiesA: string[], entitiesB: string[]) {
  const setA = new Set(entitiesA.map(normalizeEntity).filter(Boolean));
  const setB = new Set(entitiesB.map(normalizeEntity).filter(Boolean));
  const union = new Set([...setA, ...setB]);
  if (!union.size) return 0;
  const intersection = [...setA].filter((entity) => setB.has(entity)).length;
  return intersection / union.size;
}

type ParsedClockReference = {
  options: number[];
  ambiguous: boolean;
};

function parseClockReference(reference: string | null): ParsedClockReference | null {
  if (!reference) return null;
  const normalized = reference.toLowerCase().trim();
  const options: number[] = [];
  let ambiguous = false;

  if (/\bmidnight\b/.test(normalized)) options.push(0);
  if (/\bnoon\b/.test(normalized)) options.push(12 * 60);

  const pattern = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    const meridiem = match[3]?.replaceAll(".", "").toLowerCase();
    if (hour > 23 || minute > 59 || (meridiem && hour > 12)) continue;

    if (meridiem) {
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
      options.push(hour * 60 + minute);
    } else if (hour === 0 || hour > 12) {
      options.push(hour * 60 + minute);
    } else {
      const base = (hour % 12) * 60 + minute;
      options.push(base, base + 12 * 60);
      ambiguous = true;
    }
  }

  const uniqueOptions = [...new Set(options)];
  if (uniqueOptions.length) {
    return {
      options: uniqueOptions,
      ambiguous: ambiguous || uniqueOptions.length > 1,
    };
  }

  if (!/\b(?:a\.?m\.?|p\.?m\.?|o'?clock|morning|afternoon|evening|night)\b/i.test(normalized)) {
    return null;
  }
  const parsed = parseDate(reference, FIXED_TIME_REFERENCE, { forwardDate: false });
  return parsed
    ? { options: [parsed.getHours() * 60 + parsed.getMinutes()], ambiguous: false }
    : null;
}

export function normalizeTime(reference: string | null) {
  return parseClockReference(reference)?.options[0] ?? null;
}

function timeDelta(referenceA: string | null, referenceB: string | null) {
  const timeA = parseClockReference(referenceA);
  const timeB = parseClockReference(referenceB);
  if (!timeA || !timeB) return null;

  let minutes = Number.POSITIVE_INFINITY;
  for (const optionA of timeA.options) {
    for (const optionB of timeB.options) {
      const absolute = Math.abs(optionA - optionB);
      minutes = Math.min(minutes, absolute, 24 * 60 - absolute);
    }
  }
  return {
    minutes,
    ambiguous: timeA.ambiguous || timeB.ambiguous,
  };
}

function tokenOverlap(textA: string, textB: string) {
  const tokensA = new Set(tokenize(textA));
  const tokensB = new Set(tokenize(textB));
  const union = new Set([...tokensA, ...tokensB]);
  if (!union.size) return 0;
  return [...tokensA].filter((token) => tokensB.has(token)).length / union.size;
}

function polarityOpposite(pair: CandidatePair) {
  const { text: textA } = pair.claimA;
  const { text: textB } = pair.claimB;
  if (hasDistinctCalendarDateScopes(pair)) return false;
  const locationOpposition =
    (UNIVERSAL_LOCATION_PATTERN.test(textA) && DEPARTURE_PATTERN.test(textB)) ||
    (UNIVERSAL_LOCATION_PATTERN.test(textB) && DEPARTURE_PATTERN.test(textA)) ||
    (STAYED_LOCATION_PATTERN.test(textA) && DEPARTURE_PATTERN.test(textB)) ||
    (STAYED_LOCATION_PATTERN.test(textB) && DEPARTURE_PATTERN.test(textA));
  const knowledgeOpposition =
    (KNOWLEDGE_DENIAL_PATTERN.test(textA) && KNOWLEDGE_AFFIRMATION_PATTERN.test(textB)) ||
    (KNOWLEDGE_DENIAL_PATTERN.test(textB) && KNOWLEDGE_AFFIRMATION_PATTERN.test(textA));
  if (locationOpposition || knowledgeOpposition) return true;

  const negationDiffers = NEGATION_PATTERN.test(textA) !== NEGATION_PATTERN.test(textB);
  return (
    negationDiffers &&
    (sharedPredicate(textA, textB) || tokenOverlap(textA, textB) >= 0.18)
  );
}

export async function extractScoringFeatures(
  pair: CandidatePair,
): Promise<ScoringFeatures> {
  const [embeddingA, embeddingB] = await Promise.all([
    pair.claimA.embedding
      ? Float32Array.from(pair.claimA.embedding)
      : embedText(pair.claimA.text),
    pair.claimB.embedding
      ? Float32Array.from(pair.claimB.embedding)
      : embedText(pair.claimB.text),
  ]);
  const semanticSimilarity = await cosineSimilarity(embeddingA, embeddingB);
  const timing = timeDelta(pair.claimA.timeRef, pair.claimB.timeRef);
  const timeDeltaMinutes = timing?.minutes ?? null;
  const polarity = polarityOpposite(pair);

  return {
    semanticSimilarity,
    timeDeltaMinutes,
    hedgeLanguageDetected:
      HEDGE_PATTERN.test(pair.claimA.text) || HEDGE_PATTERN.test(pair.claimB.text),
    entityOverlapScore: entityOverlap(pair.claimA.entities, pair.claimB.entities),
    polarityOpposite: polarity,
    requiresInference:
      timeDeltaMinutes !== null &&
      timeDeltaMinutes > SCORING_CONFIG.CONTRADICTION_MINUTES &&
      !polarity,
    hasParseableTimes: timeDeltaMinutes !== null,
    timeReferenceAmbiguous: timing?.ambiguous ?? false,
    timeCertaintyScore:
      timing === null
        ? 0
        : timing.ambiguous
          ? SCORING_CONFIG.AMBIGUOUS_TIME_CERTAINTY_BONUS
          : SCORING_CONFIG.TIME_CERTAINTY_BONUS,
  };
}

/** Pure weighted confidence calculation over already extracted features. */
export function calculateConfidence(features: ScoringFeatures) {
  const weights = SCORING_CONFIG.WEIGHTS;
  return clamp(
    weights.semanticSimilarity * features.semanticSimilarity +
      weights.entityOverlap * features.entityOverlapScore +
      weights.polarityOpposite * (features.polarityOpposite ? 1 : 0) +
      weights.parseableTimes * features.timeCertaintyScore -
      weights.hedgePenalty * (features.hedgeLanguageDetected ? 1 : 0),
  );
}

function confidenceFactors(features: ScoringFeatures): ConfidenceFactor[] {
  const weights = SCORING_CONFIG.WEIGHTS;
  return [
    {
      label: "Semantic similarity",
      detail: `Cosine similarity ${features.semanticSimilarity.toFixed(2)} from local or precomputed embeddings.`,
      impact: Math.round(weights.semanticSimilarity * features.semanticSimilarity * 100),
    },
    {
      label: "Entity overlap",
      detail: `Normalized entity-set overlap ${features.entityOverlapScore.toFixed(2)}.`,
      impact: Math.round(weights.entityOverlap * features.entityOverlapScore * 100),
    },
    {
      label: "Polarity",
      detail: features.polarityOpposite
        ? "A shared assertion has opposite polarity."
        : "No direct polarity opposition was detected.",
      impact: features.polarityOpposite ? Math.round(weights.polarityOpposite * 100) : 0,
    },
    {
      label: "Parseable time",
      detail: features.hasParseableTimes
        ? features.timeReferenceAmbiguous
          ? `Clock times parsed with unresolved AM/PM or multiple estimates; conservative delta ${features.timeDeltaMinutes} minutes.`
          : `Both time references parsed; delta ${features.timeDeltaMinutes} minutes.`
        : "Both claims did not provide parseable time references.",
      impact: features.hasParseableTimes
        ? Math.round(weights.parseableTimes * features.timeCertaintyScore * 100)
        : 0,
    },
    {
      label: "Hedge penalty",
      detail: features.hedgeLanguageDetected
        ? "Approximate or hedged language reduces confidence."
        : "No configured hedge phrase was detected.",
      impact: features.hedgeLanguageDetected ? -Math.round(weights.hedgePenalty * 100) : 0,
    },
  ];
}

/**
 * The core deliverable: no network calls, no model confidence, and no mutable
 * external state. Identical CandidatePair values always produce identical output.
 */
export async function scoreContradiction(
  pair: CandidatePair,
): Promise<ScoredContradiction> {
  const features = await extractScoringFeatures(pair);
  let type: ScoredContradiction["type"];

  if (features.entityOverlapScore < SCORING_CONFIG.MIN_OVERLAP_THRESHOLD) {
    type = "DISCARDED";
  } else if (
    features.hedgeLanguageDetected &&
    features.timeDeltaMinutes !== null &&
    features.timeDeltaMinutes <= SCORING_CONFIG.FALSE_POSITIVE_MINUTES
  ) {
    type = "FALSE_POSITIVE";
  } else if (
    features.polarityOpposite &&
    features.semanticSimilarity > SCORING_CONFIG.DIRECT_SIM_THRESHOLD
  ) {
    type = "DIRECT";
  } else if (
    features.requiresInference &&
    features.timeDeltaMinutes !== null &&
    features.timeDeltaMinutes > SCORING_CONFIG.CONTRADICTION_MINUTES
  ) {
    type = "INFERENTIAL";
  } else {
    type = "FALSE_POSITIVE";
  }

  return {
    pair,
    type,
    discarded: type === "DISCARDED",
    confidence: Math.round(calculateConfidence(features) * 100),
    features,
    factors: confidenceFactors(features),
  };
}
