import { describe, expect, it } from "vitest";
import { cosineSimilarity, embedText } from "./embeddings";
import {
  SCORING_CONFIG,
  calculateConfidence,
  entityOverlap,
  extractScoringFeatures,
  normalizeTime,
  scoreContradiction,
  type CandidatePair,
  type ScoringFeatures,
} from "./scoring-engine";

function pair(overrides: Partial<CandidatePair> = {}): CandidatePair {
  return {
    topic: "Vehicle ownership",
    claimA: {
      text: "I never owned the vehicle.",
      timeRef: null,
      entities: ["Marcus Webb", "Honda Civic"],
      embedding: [1, 0],
    },
    claimB: {
      text: "I owned the vehicle.",
      timeRef: null,
      entities: ["Marcus Webb", "Honda Civic"],
      embedding: [1, 0],
    },
    reconciliation: null,
    explanation: "Ownership is denied and affirmed.",
    ...overrides,
  };
}

describe("scoreContradiction", () => {
  it("exports named, isolated policy thresholds", () => {
    expect(SCORING_CONFIG.MIN_OVERLAP_THRESHOLD).toBeGreaterThan(0);
    expect(SCORING_CONFIG.FALSE_POSITIVE_MINUTES).toBe(15);
    expect(SCORING_CONFIG.DIRECT_SIM_THRESHOLD).toBeGreaterThan(0);
    expect(SCORING_CONFIG.CONTRADICTION_MINUTES).toBeGreaterThan(
      SCORING_CONFIG.FALSE_POSITIVE_MINUTES,
    );
    expect(SCORING_CONFIG.AMBIGUOUS_TIME_CERTAINTY_BONUS).toBeLessThan(
      SCORING_CONFIG.TIME_CERTAINTY_BONUS,
    );
  });

  it("classifies opposite polarity with similar claims as direct", async () => {
    const result = await scoreContradiction(pair());
    expect(result.type).toBe("DIRECT");
    expect(result.discarded).toBe(false);
    expect(result.features.polarityOpposite).toBe(true);
  });

  it("classifies the knowledge-denial regression with MiniLM", async () => {
    const input = pair({
      topic: "Knowledge of Daniel Cho",
      claimA: {
        text: "I'd never heard of him before this whole thing started.",
        timeRef: null,
        entities: ["Marcus Webb", "Daniel Cho"],
      },
      claimB: {
        text: "I knew of him. We had mutual friends.",
        timeRef: null,
        entities: ["Marcus Webb", "Daniel Cho"],
      },
    });
    const result = await scoreContradiction(input);

    expect(result.features.semanticSimilarity).toBeGreaterThan(
      SCORING_CONFIG.DIRECT_SIM_THRESHOLD,
    );
    expect(result.type).toBe("DIRECT");
  });

  it("detects signed-off versus never-signed as opposite polarity", async () => {
    const input = pair({
      topic: "Change order approval",
      claimA: {
        text: "My supervisor approved it. He signed off on it himself before we proceeded with the work.",
        timeRef: null,
        entities: ["Priya Nair", "Daniel Cho", "change order"],
      },
      claimB: {
        text: "Honestly, Danny never signed anything on that one. I submitted it myself and it went through without his sign-off.",
        timeRef: null,
        entities: ["Priya Nair", "Daniel Cho", "change order"],
      },
    });

    const result = await scoreContradiction(input);
    expect(result.features.polarityOpposite).toBe(true);
    expect(result.type).toBe("DIRECT");
    expect(result.confidence).toBe(65);
  });

  it("does not treat inspections on different dates as opposite polarity", async () => {
    const input = pair({
      topic: "Loading dock inspection",
      claimA: {
        text: "No. I did not inspect it that day.",
        timeRef: "October 3rd",
        entities: ["Owen Faraday", "loading dock", "October 3rd"],
      },
      claimB: {
        text: "Yes, I inspected it. I want to say it was maybe October 2nd or so.",
        timeRef: "October 2nd or so",
        entities: ["Owen Faraday", "loading dock", "October 2nd"],
      },
    });

    const result = await scoreContradiction(input);
    expect(result.features.polarityOpposite).toBe(false);
    expect(result.features.hasParseableTimes).toBe(false);
    expect(result.type).toBe("FALSE_POSITIVE");
  });

  it("keeps hedged timing separate from a direct leave-versus-stay conflict", async () => {
    const input = pair({
      topic: "Presence at home",
      claimA: {
        text: "I was already home by then. I'd gotten in around 8:30 or so and didn't leave again that night.",
        timeRef: "around 8:30 or so",
        entities: ["Marcus Whitfield", "home"],
      },
      claimB: {
        text: "I want to say I left the house again sometime close to 9, maybe a little after, to grab something from the store.",
        timeRef: "sometime close to 9, maybe a little after",
        entities: ["Marcus Whitfield", "house", "store"],
      },
    });

    const result = await scoreContradiction(input);
    expect(result.features.hedgeLanguageDetected).toBe(true);
    expect(result.features.polarityOpposite).toBe(true);
    expect(result.type).toBe("DIRECT");
  });

  it("classifies a small hedged time difference as a false positive", async () => {
    const input = pair({
      topic: "Arrival time",
      claimA: {
        text: "I arrived around 8.",
        timeRef: "around 8",
        entities: ["Marcus Webb", "Office arrival"],
        embedding: [1, 0],
      },
      claimB: {
        text: "I arrived at 8:05.",
        timeRef: "8:05",
        entities: ["Marcus Webb", "Office arrival"],
        embedding: [1, 0],
      },
    });
    const result = await scoreContradiction(input);

    expect(result.type).toBe("FALSE_POSITIVE");
    expect(result.features.timeDeltaMinutes).toBe(5);
    expect(result.features.hedgeLanguageDetected).toBe(true);
  });

  it("treats the Ilić five-minute calendar correction as a false positive", async () => {
    const input = pair({
      topic: "Vendor meeting start time",
      claimA: {
        text: "It started at 8:00, I remember because I'd just gotten coffee.",
        timeRef: "8:00",
        entities: ["Renata Ilić", "vendor meeting"],
      },
      claimB: {
        text: "It was 8:05, not 8:00 like I may have said before.",
        timeRef: "8:05",
        entities: ["Renata Ilić", "vendor meeting"],
      },
    });

    const result = await scoreContradiction(input);
    expect(result.features.timeDeltaMinutes).toBe(5);
    expect(result.type).toBe("FALSE_POSITIVE");
  });

  it("classifies a large non-polar timeline conflict as inferential", async () => {
    const input = pair({
      topic: "Sleep timeline",
      claimA: {
        text: "I went to sleep at 10.",
        timeRef: "10 PM",
        entities: ["Marcus Webb", "November 3rd", "Sleep"],
        embedding: [1, 0],
      },
      claimB: {
        text: "I was awake until midnight.",
        timeRef: "midnight",
        entities: ["Marcus Webb", "November 3rd", "Sleep"],
        embedding: [0.9, 0.1],
      },
    });
    const result = await scoreContradiction(input);

    expect(result.type).toBe("INFERENTIAL");
    expect(result.features.requiresInference).toBe(true);
    expect(result.features.timeDeltaMinutes).toBe(120);
    expect(result.features.timeReferenceAmbiguous).toBe(false);
    expect(result.features.timeCertaintyScore).toBe(1);
  });

  it("resolves an unlabeled clock against an explicit PM reference", async () => {
    const input = pair({
      topic: "Evening departure",
      claimA: {
        text: "I was home around 7 PM.",
        timeRef: "around 7 PM",
        entities: ["Marcus Webb", "November 3rd"],
        embedding: [1, 0],
      },
      claimB: {
        text: "I went out around 7:30.",
        timeRef: "around 7:30",
        entities: ["Marcus Webb", "November 3rd"],
        embedding: [1, 0],
      },
    });

    const result = await scoreContradiction(input);
    expect(result.features.timeDeltaMinutes).toBe(30);
    expect(result.features.timeReferenceAmbiguous).toBe(true);
    expect(result.features.timeCertaintyScore).toBe(0.5);
    expect(result.factors.find((factor) => factor.label === "Parseable time")).toMatchObject({
      impact: 11,
    });
  });

  it("uses the closest hedged bedtime estimate across midnight", async () => {
    const input = pair({
      topic: "Bedtime on November 3rd",
      claimA: {
        text: "Around 10, maybe 10:30.",
        timeRef: "Around 10, maybe 10:30",
        entities: ["Marcus Webb", "November 3rd", "Sleep"],
        embedding: [1, 0],
      },
      claimB: {
        text: "It was late. Midnight maybe.",
        timeRef: "Midnight maybe",
        entities: ["Marcus Webb", "November 3rd", "Sleep"],
        embedding: [0.9, 0.1],
      },
    });

    const result = await scoreContradiction(input);
    expect(result.features.timeDeltaMinutes).toBe(90);
    expect(result.features.timeReferenceAmbiguous).toBe(true);
    expect(result.type).toBe("INFERENTIAL");
  });

  it("uses circular clock distance for explicit midnight rollover", async () => {
    const input = pair({
      claimA: { ...pair().claimA, timeRef: "11 PM" },
      claimB: { ...pair().claimB, timeRef: "1 AM" },
    });

    const features = await extractScoringFeatures(input);
    expect(features.timeDeltaMinutes).toBe(120);
    expect(features.timeReferenceAmbiguous).toBe(false);
  });

  it("discards pairs below the entity-overlap threshold", async () => {
    const input = pair({
      claimA: {
        text: "I visited the warehouse.",
        timeRef: null,
        entities: ["Hargrove warehouse"],
        embedding: [1, 0],
      },
      claimB: {
        text: "I knew Daniel Cho.",
        timeRef: null,
        entities: ["Daniel Cho"],
        embedding: [1, 0],
      },
    });
    const result = await scoreContradiction(input);

    expect(result.type).toBe("DISCARDED");
    expect(result.discarded).toBe(true);
  });

  it("defaults weak signals to false positive", async () => {
    const input = pair({
      claimA: { ...pair().claimA, text: "I ordered pizza.", embedding: [1, 0] },
      claimB: { ...pair().claimB, text: "I bought groceries.", embedding: [0, 1] },
    });
    expect((await scoreContradiction(input)).type).toBe("FALSE_POSITIVE");
  });

  it("produces the documented weighted sum from hand-crafted features", () => {
    const features: ScoringFeatures = {
      semanticSimilarity: 0.8,
      entityOverlapScore: 0.5,
      polarityOpposite: true,
      hasParseableTimes: true,
      hedgeLanguageDetected: true,
      timeDeltaMinutes: 90,
      requiresInference: false,
      timeReferenceAmbiguous: false,
      timeCertaintyScore: 1,
    };
    const expected =
      SCORING_CONFIG.WEIGHTS.semanticSimilarity * 0.8 +
      SCORING_CONFIG.WEIGHTS.entityOverlap * 0.5 +
      SCORING_CONFIG.WEIGHTS.polarityOpposite +
      SCORING_CONFIG.WEIGHTS.parseableTimes * SCORING_CONFIG.TIME_CERTAINTY_BONUS -
      SCORING_CONFIG.WEIGHTS.hedgePenalty;

    expect(calculateConfidence(features)).toBeCloseTo(expected, 10);
  });

  it("detects all configured hedge forms without a model", async () => {
    for (const text of [
      "around 8",
      "about 8",
      "roughly 8",
      "eight-ish",
      "maybe 8",
      "approximately 8",
      "8 or so",
      "I think it was 8",
      "He might have seen me",
      "Perhaps it was later",
    ]) {
      const input = pair({ claimA: { ...pair().claimA, text } });
      expect((await extractScoringFeatures(input)).hedgeLanguageDetected).toBe(true);
    }
  });

  it("normalizes clock references deterministically", () => {
    expect(normalizeTime("around 8")).toBe(480);
    expect(normalizeTime("8:05")).toBe(485);
    expect(normalizeTime("midnight")).toBe(0);
    expect(normalizeTime("October 3rd")).toBeNull();
  });

  it("computes normalized entity-set overlap", () => {
    expect(entityOverlap(["Marcus Webb", "November 3rd"], ["Marcus Webb", "Parking lot"]))
      .toBeCloseTo(1 / 3);
  });

  it("computes cosine similarity and caches MiniLM embeddings", async () => {
    expect(
      await cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0])),
    ).toBe(1);
    expect(
      await cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1])),
    ).toBe(0);
    const first = await embedText("knew of Daniel");
    const second = await embedText("knew of Daniel");
    expect(first).toHaveLength(384);
    expect(second).toBe(first);
  });

  it("is deterministic and contains no model confidence input", async () => {
    const input = pair();
    expect("confidence" in input).toBe(false);
    expect(await scoreContradiction(input)).toEqual(await scoreContradiction(input));
  });
});

describe("MiniLM fixture integration", () => {
  const fixtures: Array<[string, CandidatePair, string]> = [
    [
      "direct",
      pair({
        topic: "Whereabouts",
        claimA: {
          text: "I was at home all evening.",
          timeRef: null,
          entities: ["Marcus Webb", "November 3rd"],
        },
        claimB: {
          text: "I went out briefly to get groceries.",
          timeRef: null,
          entities: ["Marcus Webb", "November 3rd"],
        },
      }),
      "DIRECT",
    ],
    [
      "inferential",
      pair({
        topic: "Sleep timeline",
        claimA: {
          text: "I went to sleep at 10.",
          timeRef: "10 PM",
          entities: ["Marcus Webb", "November 3rd", "Sleep"],
        },
        claimB: {
          text: "I was awake until midnight.",
          timeRef: "midnight",
          entities: ["Marcus Webb", "November 3rd", "Sleep"],
        },
      }),
      "INFERENTIAL",
    ],
    [
      "false positive",
      pair({
        topic: "Arrival time",
        claimA: {
          text: "I arrived around 8.",
          timeRef: "around 8",
          entities: ["Marcus Webb", "Office arrival"],
        },
        claimB: {
          text: "I arrived at 8:05.",
          timeRef: "8:05",
          entities: ["Marcus Webb", "Office arrival"],
        },
      }),
      "FALSE_POSITIVE",
    ],
  ];

  it.each(fixtures)("keeps the %s fixture classification", async (_name, input, type) => {
    expect((await scoreContradiction(input)).type).toBe(type);
  });
});
