import { describe, expect, it } from "vitest";
import { buildAnalysisPayload, evaluateCandidate, locateQuote } from "./confidence";
import { modelResponseSchema, type ModelCandidate } from "./schema";

function candidate(overrides: Partial<ModelCandidate> = {}): ModelCandidate {
  return {
    topic: "Whereabouts on November 3rd",
    quoteA: "I was at home all evening.",
    quoteB: "I went out briefly to get groceries.",
    timeRefA: null,
    timeRefB: null,
    entitiesA: ["Marcus Webb", "November 3rd"],
    entitiesB: ["Marcus Webb", "November 3rd"],
    reconciliation: null,
    explanation: "The statements describe incompatible whereabouts.",
    ...overrides,
  };
}

describe("verified evidence adapter", () => {
  it("maps a model candidate through the standalone scoring engine", async () => {
    const input = candidate();
    const result = await evaluateCandidate(input, input.quoteA, input.quoteB);

    expect(result.classification).toBe("DIRECT");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.factors.map((factor) => factor.label)).toEqual([
      "Semantic similarity",
      "Entity overlap",
      "Polarity",
      "Parseable time",
      "Hedge penalty",
    ]);
  });

  it("removes a candidate when a quotation is absent from the record", async () => {
    const valid = candidate();
    const invalid = candidate({
      quoteA: "This was never said.",
    });
    const payload = await buildAnalysisPayload(
      [valid, invalid],
      valid.quoteA,
      valid.quoteB,
      "test-model",
    );

    expect(payload.results).toHaveLength(1);
    expect(payload.summary.rejectedCandidates).toBe(1);
  });

  it("removes a candidate below the entity-overlap gate", async () => {
    const input = candidate({
      quoteB: "I knew Daniel Cho.",
      entitiesB: ["Daniel Cho"],
    });
    const payload = await buildAnalysisPayload(
      [input],
      input.quoteA,
      input.quoteB,
      "test-model",
    );

    expect(payload.results).toHaveLength(0);
    expect(payload.summary.rejectedCandidates).toBe(1);
  });

  it("locates exact evidence and reports a one-based line number", () => {
    const located = locateQuote("Heading\nFirst answer\nSecond answer", "Second answer");
    expect(located).toEqual({ quote: "Second answer", line: 3, verified: true });
  });

  it("rejects model output that tries to add a confidence field", () => {
    const input = candidate();
    const parsed = modelResponseSchema.safeParse({
      candidates: [{ ...input, confidence: 0.99 }],
    });

    expect(parsed.success).toBe(false);
  });
});
