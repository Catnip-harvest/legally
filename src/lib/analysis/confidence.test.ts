import { describe, expect, it } from "vitest";
import {
  buildAnalysisPayload,
  evaluateCandidate,
  isWithinApproximateTimeTolerance,
  locateQuote,
} from "./confidence";
import type { ModelCandidate } from "./schema";

function candidate(overrides: Partial<ModelCandidate> = {}): ModelCandidate {
  return {
    topic: "Whereabouts",
    quoteA: "I was at home all evening.",
    quoteB: "I went out briefly to get groceries.",
    relation: "explicit_negation",
    sameSubject: true,
    sameEvent: true,
    sameScope: true,
    reconciliation: null,
    explanation: "Leaving home conflicts with being home all evening.",
    ...overrides,
  };
}

describe("deterministic classification and confidence", () => {
  it("classifies an explicit opposition as direct", () => {
    const input = candidate();
    const result = evaluateCandidate(input, input.quoteA, input.quoteB);

    expect(result.classification).toBe("DIRECT");
    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.confidence).toBeGreaterThanOrEqual(85);
    expect(result.reviewPriority).toBe("HIGH");
  });

  it("classifies facts that cannot coexist as inferential", () => {
    const input = candidate({
      topic: "Sleep timeline",
      quoteA: "I went to sleep at 10.",
      quoteB: "I was awake until midnight.",
      relation: "timeline_conflict",
      explanation: "The sleep and waking timelines cannot both be true.",
    });
    const result = evaluateCandidate(input, input.quoteA, input.quoteB);

    expect(result.classification).toBe("INFERENTIAL");
    expect(result.confidence).toBeGreaterThanOrEqual(80);
    expect(result.reviewPriority).toBe("MEDIUM");
  });

  it("promotes an inferred conflict with an absolute claim to direct", () => {
    const input = candidate({
      quoteA: "I was at home all evening.",
      quoteB: "I went out briefly for groceries.",
      relation: "timeline_conflict",
      explanation: "Leaving conflicts with being home all evening.",
    });
    const result = evaluateCandidate(input, input.quoteA, input.quoteB);

    expect(result.classification).toBe("DIRECT");
  });

  it("demotes a hedged, reconcilable encounter to a false positive", () => {
    const input = candidate({
      quoteA: "No, I was alone.",
      quoteB: "My neighbor might have seen me in the parking lot.",
      relation: "explicit_negation",
      reconciliation: "The witness could have been alone inside and seen outside.",
      explanation: "The statements use different practical meanings of alone.",
    });
    const result = evaluateCandidate(input, input.quoteA, input.quoteB);

    expect(result.classification).toBe("FALSE_POSITIVE");
  });

  it("keeps an explicit negation direct when event metadata is inconsistent", () => {
    const input = candidate({
      quoteA: "I had never heard of Daniel Cho.",
      quoteB: "I knew of Daniel Cho through mutual friends.",
      relation: "explicit_negation",
      sameEvent: false,
      sameScope: false,
      explanation: "Prior knowledge is expressly denied and later affirmed.",
    });
    const result = evaluateCandidate(input, input.quoteA, input.quoteB);

    expect(result.classification).toBe("DIRECT");
  });

  it("treats small differences in approximate times as a false positive", () => {
    const input = candidate({
      topic: "Arrival time",
      quoteA: "I arrived around 8.",
      quoteB: "I arrived at 8:05.",
      relation: "exclusive_values",
      explanation: "The reported times are five minutes apart.",
    });
    const result = evaluateCandidate(input, input.quoteA, input.quoteB);

    expect(isWithinApproximateTimeTolerance(input.quoteA, input.quoteB)).toBe(true);
    expect(result.classification).toBe("FALSE_POSITIVE");
    expect(result.confidence).toBeGreaterThanOrEqual(80);
    expect(result.reviewPriority).toBe("DISMISS");
  });

  it("rejects a geographic scope mismatch", () => {
    const input = candidate({
      topic: "Hargrove location",
      quoteA: "I have never been inside the Hargrove Street warehouse.",
      quoteB: "I have driven through the Hargrove Street area.",
      relation: "scope_mismatch",
      sameScope: false,
      reconciliation: "A person can drive through the area without entering the warehouse.",
      explanation: "The statements refer to different geographic scopes.",
    });
    const result = evaluateCandidate(input, input.quoteA, input.quoteB);

    expect(result.classification).toBe("FALSE_POSITIVE");
    expect(result.confidence).toBeGreaterThanOrEqual(80);
  });

  it("does not give high confidence to a quotation absent from the record", () => {
    const input = candidate();
    const result = evaluateCandidate(input, "Different testimony.", input.quoteB);

    expect(result.evidenceA.verified).toBe(false);
    expect(result.confidence).toBeLessThan(80);
  });

  it("removes candidates with unverified quotations from the final payload", () => {
    const valid = candidate();
    const invalid = candidate({ quoteA: "This was never said." });
    const payload = buildAnalysisPayload(
      [valid, invalid],
      valid.quoteA,
      `${valid.quoteB}\n${invalid.quoteB}`,
      "test-model",
    );

    expect(payload.results).toHaveLength(1);
    expect(payload.summary.rejectedCandidates).toBe(1);
  });

  it("locates exact evidence and reports a one-based line number", () => {
    const located = locateQuote("Heading\nFirst answer\nSecond answer", "Second answer");
    expect(located).toEqual({ quote: "Second answer", line: 3, verified: true });
  });

  it("returns identical scores for identical evidence", () => {
    const input = candidate();
    const first = evaluateCandidate(input, input.quoteA, input.quoteB);
    const second = evaluateCandidate(input, input.quoteA, input.quoteB);
    expect(second.confidence).toBe(first.confidence);
    expect(second.factors).toEqual(first.factors);
  });
});
