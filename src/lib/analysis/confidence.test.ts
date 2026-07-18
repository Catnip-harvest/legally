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

  it("verifies wrapped answers while ignoring certified line labels", () => {
    const transcript = [
      "Line 112  Q: Where were you around 9pm?",
      "Line 113  A: I was already home by then. I’d gotten in around 8:30 or so",
      "Line 114     and didn’t leave again that night.",
    ].join("\n");
    const quote =
      "I was already home by then. I'd gotten in around 8:30 or so and didn't leave again that night.";

    expect(locateQuote(transcript, quote)).toEqual({
      quote,
      line: 113,
      verified: true,
    });
  });

  it("keeps the wrapped Whitfield benchmark candidate in the review payload", async () => {
    const transcriptA = [
      "Line 112  Q: Where were you around the time of the incident, roughly 9pm?",
      "Line 113  A: I was already home by then. I'd gotten in around 8:30 or so",
      "Line 114     and didn't leave again that night.",
    ].join("\n");
    const transcriptB = [
      "Line 88   Q: Walk me through your evening again, starting around 8pm.",
      "Line 89   A: Sure. I want to say I left the house again sometime close",
      "Line 90      to 9, maybe a little after, to grab something from the store.",
    ].join("\n");
    const input = candidate({
      topic: "Presence at home",
      quoteA:
        "I was already home by then. I'd gotten in around 8:30 or so and didn't leave again that night.",
      quoteB:
        "I want to say I left the house again sometime close to 9, maybe a little after, to grab something from the store.",
      timeRefA: "around 8:30",
      timeRefB: "close to 9",
      entitiesA: ["Marcus Whitfield", "home"],
      entitiesB: ["Marcus Whitfield", "house", "store"],
    });

    const payload = await buildAnalysisPayload(
      [input],
      transcriptA,
      transcriptB,
      "gemini-3-flash-preview",
    );

    expect(payload.summary).toMatchObject({ direct: 1, rejectedCandidates: 0 });
    expect(payload.results[0]).toMatchObject({
      classification: "DIRECT",
      evidenceA: { line: 113, verified: true },
      evidenceB: { line: 89, verified: true },
    });
  });

  it("rejects model output that tries to add a confidence field", () => {
    const input = candidate();
    const parsed = modelResponseSchema.safeParse({
      candidates: [{ ...input, confidence: 0.99 }],
    });

    expect(parsed.success).toBe(false);
  });
});
